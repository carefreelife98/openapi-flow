import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createHttpRequestNode,
  createResponseCollectionCapability,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-json-response-${process.pid}-${Date.now()}`;
const cases = [
  { id: 'plain-string', body: 'ordinary string' },
  { id: 'numeric-string', body: '42' },
  { id: 'object-string', body: '{"id":42}' },
  { id: 'empty-string', body: '' },
  { id: 'number', body: 42 },
  { id: 'boolean', body: false },
  { id: 'null', body: null },
  { id: 'object', body: { id: 42 } },
  { id: 'array', body: [null, { id: 42 }, '42'] },
];
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
const server = createServer((request, response) => {
  const sample = cases.find((sample) => request.url === '/' + sample.id);
  if (!sample) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(sample.body));
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  for (const sample of cases) {
    const catalog = await createApiCatalog([
      {
        id: sample.id,
        spec: {
          openapi: '3.1.0',
          info: { title: 'JSON response preservation', version: '1' },
          paths: {
            ['/' + sample.id]: {
              get: {
                responses: {
                  200: {
                    description: 'Exact JSON response',
                    content: {
                      'application/json': { schema: { const: sample.body } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const material = {
      operation,
      arguments: {
        callId: 'source',
        values: {},
        bindings: [],
        unresolvedInputs: [],
      },
    };
    const capability = createResponseCollectionCapability({
      materials: [{ callId: 'source', operation }],
    });
    const result = compilePlannedN8nWorkflow({
      id: sample.id,
      name: 'JSON response ' + sample.id,
      materials: [material],
      capabilities: [capability],
      apiNodes: [
        createHttpRequestNode({ ...material, baseUrl, position: [300, 0] }),
      ],
      plan: {
        nativeNodes: [
          {
            id: 'observed-values',
            capability: capability.name,
            parameters: { sourceNodeId: 'source', pointer: '' },
          },
        ],
        starts: ['source'],
        gaps: [],
        edges: [
          {
            from: 'source',
            output: 'main',
            to: 'observed-values',
            input: 'main',
          },
        ],
      },
    });
    workflows.push(result.workflow);
  }
  const directory = new URL(
    '../.local-artifacts/json-response/',
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(workflows, null, 2),
  );
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
  const imported = await docker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(workflows),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const results = [];
  for (const sample of cases) {
    const output = await docker([
      ...runtime,
      'execute',
      '--id=' + sample.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const observed =
      execution.data.resultData.runData['Request source']?.[0].data
        ?.main?.[0]?.[0]?.json;
    const collected =
      execution.data.resultData.runData['observed-values']?.[0].data
        ?.main?.[0]?.[0]?.json;
    let preserved = false;
    if (execution.status === 'success') {
      assert.deepEqual(collected.items, [sample.body]);
      assert.deepEqual(observed.body, sample.body);
      preserved = true;
    }
    results.push({
      case: sample.id,
      status: preserved ? 'passed' : 'failed',
      execution: execution.status,
      originalBody: sample.body,
      ...(observed ? { observedBody: observed.body } : {}),
      lastNode: execution.data.resultData.lastNodeExecuted,
      ...(execution.data.resultData.error
        ? { error: execution.data.resultData.error.message }
        : {}),
    });
  }
  const report = {
    image,
    target: 'isolated-local-contract-server',
    businessServiceCalls: 0,
    planner: 'deterministic-fixture-no-LLM',
    results,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  // A known upstream defect remains a failed contract check, not a green test.
  if (results.some((result) => result.status === 'failed'))
    process.exitCode = 1;
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) assert.equal((await docker(['volume', 'rm', volume])).code, 0);
}
