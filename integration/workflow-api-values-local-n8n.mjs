import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { generateWorkflowApiValues } from '@openapi-flow/langchain';
import { validateCompiledWorkflowApiValues } from '@openapi-flow/core';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import {
  fixture,
  messages,
} from '../test/fixtures/workflow-api-argument-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Deterministic model injection verifies the public value protocol, SDK and actual local engine.
// It does not call a business service or measure model semantic accuracy.
const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/workflow-api-values/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-values-${runId}`,
  image = 'n8nio/n8n:2.37.10';
const requests = [],
  errors = [];
const server = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    if (request.method === 'POST') {
      assert.equal(request.url, '/items');
      assert.deepEqual(JSON.parse(raw), { ids: ['101', '102', '103'] });
    } else {
      assert.equal(request.method, 'GET');
      assert(
        [
          '/stock/101?sequence=0',
          '/stock/102?sequence=0',
          '/stock/103?sequence=0',
          '/sync?category=GOODS',
        ].includes(request.url),
      );
    }
    requests.push({
      method: request.method,
      path: request.url,
      ...(raw ? { body: JSON.parse(raw) } : {}),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ path: request.url, ok: true }));
  } catch (error) {
    errors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
let created = false;
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const source = await fixture(),
    context = {
      scenario: source.context.scenario,
      messages,
      calls: source.context.calls,
      interpretSchemaChoices: true,
    };
  let invocations = 0;
  const result = await generateWorkflowApiValues({
    ...context,
    model: {
      withStructuredOutput(_schema, options) {
        assert.equal(options.strict, false);
        return {
          invoke: async () => {
            invocations++;
            return {
              calls: Object.fromEntries(
                context.calls.map((call) => [
                  call.callId,
                  {
                    values:
                      call.callId === 'sync'
                        ? { query: { category: 'GOODS' } }
                        : call.callId.startsWith('stock')
                          ? {
                              path: {
                                id: ['101', '102', '103'][
                                  Number(call.callId.at(-1)) - 1
                                ],
                              },
                              query: { sequence: 0 },
                            }
                          : { body: { ids: ['101', '102', '103'] } },
                    requestedInputs: [],
                  },
                ]),
              ),
            };
          },
        };
      },
    },
  });
  validateCompiledWorkflowApiValues({ ...context, result });
  assert.equal(invocations, 1);
  assert.equal(result.arguments.length, 6);
  assert.deepEqual(result.rejections, []);
  const fragments = context.calls.map((call) =>
    createHttpRequestNode({
      operation: call.operation,
      arguments: result.arguments.find((args) => args.callId === call.callId),
      baseUrl: `http://host.docker.internal:${server.address().port}`,
      credentialBindings: {},
      position: [300, 0],
    }),
  );
  const workflow = assembleN8nWorkflow({
    id: 'typed-value-six-calls',
    name: 'Typed values, six API calls',
    nodes: fragments,
    starts: context.calls.map((call) => call.callId),
    edges: [],
  }).workflow;
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
    JSON.stringify([workflow]),
  );
  assert.equal(imported.code, 0, imported.stderr);
  const output = await runDocker([
    ...runtime,
    'execute',
    '--id=typed-value-six-calls',
    '--rawOutput',
  ]);
  const execution = readN8nExecution(output.stdout);
  assert.equal(
    execution.status,
    'success',
    JSON.stringify(execution.data.resultData.error),
  );
  assert.equal(requests.length, 6);
  assert.deepEqual(errors, []);
  assert.equal(
    requests.filter((request) => request.method === 'POST').length,
    2,
  );
  const report = {
    image,
    status: execution.status,
    modelInvocations: invocations,
    model: 'deterministic injection',
    businessApiCalls: 0,
    requests,
    errors,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ directory: directory.pathname, ...report }));
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
