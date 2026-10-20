import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  createWorkflowDraft,
  createApiArgumentsSchema,
  createApiResponseSchema,
} from '@openapi-flow/core';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import { createRequire } from 'node:module';
import { capabilityGapFixture } from '../test/fixtures/workflow-draft-capability-gap-fixture.mjs';
import { reconnectFixtureStart } from './utils/reconnect-fixture-start.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const f = await capabilityGapFixture();
const require = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const response = { config: { enabled: false } };
const responseContract = new Ajv2020({ strict: false }).compile(
  createApiResponseSchema({ operation: f.seed }),
);
assert.equal(
  responseContract({
    statusCode: 200,
    mediaType: 'application/json',
    body: response,
  }),
  true,
);
const requestContract = createApiArgumentsSchema({
  operation: f.seed,
  bindings: [],
});
const requests = [],
  serverErrors = [],
  results = [];
const image = 'n8nio/n8n:2.37.10';
const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/capability-gaps/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-capability-gaps-${runId}`;
let created = false;
const server = createServer((request, outgoing) => {
  try {
    requests.push({ method: request.method, path: request.url });
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/seed');
    requestContract.parse({ values: {} });
    outgoing.writeHead(200, { 'content-type': 'application/json' });
    outgoing.end(JSON.stringify(response));
  } catch (error) {
    serverErrors.push(error.message);
    outgoing.writeHead(422, { 'content-type': 'application/json' });
    outgoing.end('{"error":"Local contract rejected request"}');
  }
});

try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const cases = [];
  for (const mixed of [false, true]) {
    const id = mixed ? 'mixed-gap' : 'gap-only';
    const draft = createWorkflowDraft({
      context: f.context,
      content: {
        id,
        requirements: [],
        nativeNodes: [],
        gapNodes: [f.gap],
        apiCalls: mixed
          ? [{ id: 'seed', operation: f.seed.key, values: {}, bindings: [] }]
          : [],
        edges: mixed
          ? [{ from: 'seed', output: 'main', to: f.gap.id, input: 'main' }]
          : [],
      },
    });
    const compiled = compileN8nWorkflowTemplate({
      context: f.context,
      draft,
      name: '결손 대역 실행 검증',
      ...(mixed
        ? {
            deployments: [
              {
                documentId: f.seed.key.documentId,
                baseUrl: `http://host.docker.internal:${server.address().port}`,
                credentialBindings: {},
              },
            ],
          }
        : {}),
    });
    assert.equal(compiled.triggerConnected, false);
    assert.equal(compiled.workflow.connections.Start, undefined);
    const inputNode = compiled.workflow.nodes.find(
      (node) => node.id === 'openapi-flow-inputs',
    );
    assert.ok(inputNode);
    const reconnected = reconnectFixtureStart(compiled.workflow, {
      entry: inputNode,
    });
    reconnected.id = id + '-test-reconnected';
    cases.push(
      { workflow: compiled.workflow, mixed, connected: false },
      { workflow: reconnected, mixed, connected: true },
    );
  }
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(
      cases.map((entry) => entry.workflow),
      null,
      2,
    ),
  );
  const made = await runDocker(['volume', 'create', volume]);
  assert.equal(made.code, 0, made.stderr);
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
  const imported = await runDocker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(cases.map((entry) => entry.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const entry of cases) {
    const before = requests.length;
    const executed = await runDocker([
      ...runtime,
      'execute',
      '--id=' + entry.workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(executed.stdout);
    const data = execution.data.resultData;
    const result = {
      id: entry.workflow.id,
      status: execution.status,
      lastNode: data.lastNodeExecuted,
      executedNodes: Object.keys(data.runData),
      requests: requests.length - before,
      classification: entry.connected
        ? 'test-reconnected-surrogate-stops'
        : 'default-entry-inert-not-business-success',
    };
    results.push(result);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          image,
          results,
          serverErrors,
          modelCalls: 0,
          businessApiCalls: 0,
          target: 'isolated-local-contract-server',
        },
        null,
        2,
      ),
    );
    assert.equal(
      execution.status,
      entry.connected ? 'error' : 'success',
      JSON.stringify(result),
    );
    assert.equal(
      result.requests,
      entry.connected && entry.mixed ? 1 : 0,
      JSON.stringify(result),
    );
    assert.equal(serverErrors.length, 0, JSON.stringify(serverErrors));
    if (entry.connected)
      assert.equal(
        result.lastNode,
        entry.workflow.nodes.find((node) => node.id === f.gap.id).name,
      );
    else assert.deepEqual(result.executedNodes, ['Start']);
    console.log(
      `${result.id}: ${result.status}, ${result.requests} local requests (${result.classification})`,
    );
  }
  console.log(
    `capability-gaps: PASSED ${results.length}/${cases.length}; ${directory.pathname}`,
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
    assert.notEqual((await runDocker(['volume', 'inspect', volume])).code, 0);
    console.log('Owned validation volume removed; absence verified');
  }
}
