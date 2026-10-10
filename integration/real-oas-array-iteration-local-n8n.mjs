import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  createApiCatalog,
  resolveApiOperations,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  compileBatchedN8nWorkflow,
  resolveHttpRequestAuthentication,
} from '@openapi-flow/n8n';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const configPath = process.env.OPENAPI_FLOW_ITERATION_CONFIG;
assert.ok(configPath, 'OPENAPI_FLOW_ITERATION_CONFIG is required');
const batchSetting = process.env.OPENAPI_FLOW_ITERATION_BATCH_SIZE;
if (batchSetting !== undefined)
  assert.ok(
    /^[1-9]\d*$/.test(batchSetting) &&
      Number.isSafeInteger(Number(batchSetting)),
    'OPENAPI_FLOW_ITERATION_BATCH_SIZE must be a positive safe integer',
  );
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.ok(
  config.specPath &&
    config.sourcePath &&
    config.targetPath &&
    config.sourceValues &&
    Array.isArray(config.rows) &&
    config.rows.length &&
    config.sourcePointer !== undefined &&
    config.itemField &&
    config.targetParameter,
  'explicit real OAS iteration configuration is required',
);
const catalog = await createApiCatalog([
  {
    id: 'real-service',
    spec: JSON.parse(await readFile(config.specPath, 'utf8')),
  },
]);
const contracts = await resolveApiOperations(
  catalog,
  [config.sourcePath, config.targetPath].map((path) => {
    const found = catalog.operations.filter(
      (operation) => operation.path === path && operation.method === 'GET',
    );
    assert.equal(found.length, 1, 'configured GET operation must exist once');
    return found[0].key;
  }),
);
const materials = contracts.map((operation, index) => ({
  callId: index === 0 ? 'list' : 'detail',
  operation,
}));
const nativeNodes = [
  {
    id: 'each-item',
    capability: 'split-api-response-array',
    parameters: { sourceNodeId: 'list', pointer: config.sourcePointer },
  },
];
const capabilities = [createResponseArrayCapability({ materials })];
createNativeOutputContracts({ nativeNodes, capabilities });
const names = { list: 'Request list', detail: 'Request detail' };
const sources = createN8nNativeOutputSources({
  nativeNodes,
  capabilities,
  apiNodeNames: names,
});
const graphMaterials = materials.map((material) => ({
  operation: material.operation,
  arguments: {
    callId: material.callId,
    values: material.callId === 'list' ? config.sourceValues : {},
    bindings:
      material.callId === 'list'
        ? []
        : [
            {
              kind: 'node-output',
              sourceNodeId: 'each-item',
              sourcePointer: '/item/' + config.itemField,
              targetPointer: '/query/' + config.targetParameter,
            },
          ],
    unresolvedInputs: [],
  },
}));
const plan = {
  nativeNodes,
  starts: ['list'],
  gaps: [],
  edges: [
    ['list', 'each-item'],
    ['each-item', 'detail'],
  ].map(([from, to]) => ({ from, to, output: 'main', input: 'main' })),
};
const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-real-iteration-${process.pid}-${Date.now()}`;
const token = randomUUID();
const credentials = [];
const credentialBindings = {};
for (const material of materials) {
  const auth = resolveHttpRequestAuthentication({
    operation: material.operation,
  });
  if (!auth) continue;
  assert.equal(
    auth.credentialType,
    'httpBearerAuth',
    'this isolated runner requires an explicit Bearer OAS contract',
  );
  if (!Object.hasOwn(credentialBindings, auth.schemeName)) {
    const id = 'fixture-bearer-' + credentials.length;
    credentialBindings[auth.schemeName] = { id, name: id };
    credentials.push({ id, name: id, type: 'httpBearerAuth', data: { token } });
  }
}
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [],
      stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }),
    );
    child.stdin.end(input);
  });
}
let mode = 'normal';
const calls = [];
const failures = [];
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    if (credentials.length)
      assert.equal(request.headers.authorization, 'Bearer ' + token);
    let body;
    if (url.pathname === config.sourcePath) {
      for (const [key, value] of Object.entries(
        config.sourceValues.query ?? {},
      ))
        assert.equal(url.searchParams.get(key), String(value));
      calls.push({ kind: 'list' });
      body =
        mode === 'empty'
          ? []
          : mode === 'invalid-source'
            ? [{ ...config.rows[0], [config.itemField]: 42 }]
            : config.rows;
      assert.equal(
        config.sourcePointer,
        '',
        'this isolated runner uses a root array response, not an invented wrapper',
      );
    } else if (url.pathname === config.targetPath) {
      const value = url.searchParams.get(config.targetParameter);
      assert.ok(config.rows.some((row) => row[config.itemField] === value));
      calls.push({ kind: 'detail', value });
      body = { [config.itemField]: value };
    } else throw Error('unexpected local contract route');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  } catch {
    failures.push('isolated credential/contract failure');
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{}');
  }
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const input = {
    id: 'real-array-iteration',
    name: 'Real OAS array iteration',
    materials: graphMaterials,
    capabilities,
    plan,
    apiNodes: graphMaterials.map((material) =>
      createHttpRequestNode({
        ...material,
        baseUrl,
        credentialBindings,
        apiNodeNames: names,
        nativeOutputSources: sources,
        apiResponseContracts: Object.fromEntries(
          materials.map((source) => [source.callId, source.operation]),
        ),
        position: [300, 0],
        ...(material.arguments.callId === 'detail'
          ? { itemMode: 'linked' }
          : {}),
      }),
    ),
  };
  const result =
    batchSetting === undefined
      ? compilePlannedN8nWorkflow(input)
      : compileBatchedN8nWorkflow({
          ...input,
          batchScopes: [
            {
              id: 'detail-batches',
              batchSize: Number(batchSetting),
              nodeIds: ['detail'],
              entryNodeId: 'detail',
              exitNodeId: 'detail',
            },
          ],
        });
  const directory = new URL(
    batchSetting === undefined
      ? '../.local-artifacts/real-array-iteration/'
      : `../.local-artifacts/real-array-iteration/batch-${batchSetting}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const json = JSON.stringify(result.workflow, null, 2);
  assert.equal(json.includes(token), false);
  await writeFile(new URL('workflow.json', directory), json);
  assert.equal((await docker(['volume', 'create', volume])).code, 0);
  created = true;
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  if (credentials.length)
    assert.equal(
      (
        await docker(
          [...runtime, 'import:credentials', '--input=/dev/stdin'],
          JSON.stringify(credentials),
        )
      ).code,
      0,
    );
  assert.equal(
    (await docker([...runtime, 'import:workflow', '--input=/dev/stdin'], json))
      .code,
    0,
  );
  const results = [];
  for (mode of ['normal', 'empty', 'invalid-source']) {
    const before = calls.length;
    const output = await docker([
      ...runtime,
      'execute',
      '--id=real-array-iteration',
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const received = calls.slice(before);
    assert.deepEqual(failures, []);
    assert.equal(
      execution.status,
      mode === 'invalid-source' ? 'error' : 'success',
      JSON.stringify(execution.data.resultData.error),
    );
    assert.equal(
      received.length,
      mode === 'normal' ? config.rows.length + 1 : 1,
    );
    if (mode === 'normal') {
      assert.deepEqual(
        received
          .filter((call) => call.kind === 'detail')
          .map((call) => call.value)
          .sort(),
        config.rows.map((row) => row[config.itemField]).sort(),
      );
      const runData = execution.data.resultData.runData;
      const runs = runData['Materialize detail'];
      assert.equal(
        runs.flatMap((run) => run.data.main[0]).length,
        config.rows.length,
      );
      for (const [runIndex, run] of runs.entries()) {
        const upstream =
          batchSetting === undefined
            ? runData['each-item'][0].data.main[0]
            : runData['detail-batches'][runIndex].data.main[1];
        const materialized = run.data.main[0];
        assert.equal(materialized.length, upstream.length);
        for (const [index, item] of materialized.entries()) {
          assert.equal(item.pairedItem.item, index);
          assert.equal(
            new URL(item.json.url).searchParams.get(config.targetParameter),
            String(upstream[item.pairedItem.item].json.item[config.itemField]),
          );
        }
      }
      if (batchSetting !== undefined) {
        assert.equal(
          runs.length,
          Math.ceil(config.rows.length / Number(batchSetting)),
        );
        assert.equal(
          runData['detail-batches'].at(-1).data.main[0].length,
          config.rows.length,
        );
      }
    }
    results.push({
      mode,
      status: 'passed',
      execution: execution.status,
      requests: received.length,
    });
  }
  const report = {
    image,
    target: 'private-real-OAS-local-contract-server',
    planner: 'explicit-fixture-no-LLM',
    businessServiceCalls: 0,
    ...(batchSetting === undefined ? {} : { batchSize: Number(batchSetting) }),
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) assert.equal((await docker(['volume', 'rm', volume])).code, 0);
}
