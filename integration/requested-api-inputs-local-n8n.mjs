import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  createWorkflowDraft,
  createApiArgumentsSchema,
  collectDeferredApiInputSlots,
  createWorkflowConnectionPlan,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import { requestedApiInputFixture } from '../test/fixtures/requested-api-inputs-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const fixture = await requestedApiInputFixture();
const requestSchema = createApiArgumentsSchema({
  operation: fixture.operation,
  bindings: [],
});
const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/requested-api-inputs/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-requested-api-inputs-${runId}`;
const image = 'n8nio/n8n:2.37.10';
const cases = [
  { id: 'missing-slot', expected: 'error', requests: 0 },
  {
    id: 'omitted-child',
    value: { config: {} },
    expected: 'error',
    requests: 0,
  },
  {
    id: 'wrong-type',
    value: { config: { enabled: 'false' } },
    expected: 'error',
    requests: 0,
  },
  {
    id: 'provided-slot',
    value: { config: { enabled: false } },
    expected: 'success',
    requests: 1,
  },
  { id: 'bound-omission', bound: true, expected: 'error', requests: 1 },
  { id: 'bound-present', bound: true, expected: 'success', requests: 2 },
  { id: 'not-requested', unrequested: true, expected: 'success', requests: 1 },
];
const requests = [],
  serverErrors = [],
  results = [];
let active,
  created = false;
const server = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      ...(raw ? { body: JSON.parse(raw) } : {}),
    });
    if (request.method === 'GET' && request.url === '/seed') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          active.id === 'bound-omission'
            ? { config: {} }
            : { config: { enabled: false } },
        ),
      );
      return;
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/search');
    const values = raw ? { body: JSON.parse(raw) } : {};
    requestSchema.parse({ values });
    assert.deepEqual(
      values,
      active.unrequested ? {} : { body: { config: { enabled: false } } },
    );
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end('{"error":"Local OAS contract rejected request"}');
  }
});

try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const context = { ...fixture.input.context, messages: [] };
  const workflows = cases.map((scenario) => {
    const originalDraft = createWorkflowDraft({
      context,
      content: {
        id: scenario.id,
        requirements: [],
        nativeNodes: [],
        apiCalls: [
          ...(scenario.bound
            ? [
                {
                  id: 'seed',
                  operation: fixture.seed.key,
                  values: {},
                  bindings: [],
                },
              ]
            : []),
          {
            id: 'search',
            operation: fixture.operation.key,
            values: {},
            bindings: scenario.bound
              ? [
                  {
                    kind: 'node-output',
                    sourceNodeId: 'seed',
                    sourcePointer: '',
                    targetPointer: '/body',
                  },
                ]
              : [],
            ...(scenario.unrequested
              ? {}
              : { requestedInputs: ['/body/config/enabled'] }),
          },
        ],
        edges: scenario.bound
          ? [{ from: 'seed', output: 'main', to: 'search', input: 'main' }]
          : [],
      },
    });
    const materials = originalDraft.apiCalls.map((call) => {
      const operation = context.operations.find(
        (item) =>
          item.key.documentId === call.operation.documentId &&
          item.key.operationRef === call.operation.operationRef,
      );
      assert.ok(operation);
      const requirements = inspectApiArgumentRequirements({
        ...call,
        callId: call.id,
        operation,
      });
      return {
        status: 'ready',
        operation,
        arguments: {
          callId: call.id,
          values: call.values,
          bindings: call.bindings,
          requestMediaType: call.requestMediaType,
          requestedInputs: call.requestedInputs,
          unresolvedInputs: requirements.requirements.map(
            (requirement) => requirement.targetPointer,
          ),
        },
      };
    });
    const slots = collectDeferredApiInputSlots({
      materials: materials.map((material) => ({
        operation: material.operation,
        ...material.arguments,
      })),
    });
    const connections = createWorkflowConnectionPlan({
      scenario:
        '입력값은 사용자가 실행 전에 지정하고 기존 선행 결과의 의존성은 유지합니다.',
      materials,
      deferredApiInputIds: slots.map((slot) => slot.id),
      proposal: {
        edges: originalDraft.edges,
        blockedCalls: [],
        additionalGaps: [],
      },
    });
    const draft = createWorkflowDraft({
      context,
      content: {
        id: originalDraft.id,
        requirements: originalDraft.requirements,
        apiCalls: originalDraft.apiCalls,
        nativeNodes: connections.nativeNodes,
        edges: connections.edges,
      },
    });
    const compiled = compileN8nWorkflowTemplate({
      draft,
      context,
      name: '사용자 요청 입력 ' + scenario.id,
      deployments: [
        {
          documentId: fixture.operation.key.documentId,
          baseUrl: `http://host.docker.internal:${server.address().port}`,
          credentialBindings: {},
        },
      ],
    });
    if (scenario.value !== undefined) {
      assert.equal(compiled.inputSlots.length, 1);
      // Simulate the user's edit after JSON import. The compiler never repairs this value.
      compiled.workflow.nodes.find(
        (node) => node.id === 'openapi-flow-inputs',
      ).parameters.jsCode =
        `const inputValues=${JSON.stringify({ [compiled.inputSlots[0].id]: scenario.value })};return [{json:{revision:${compiled.revision},values:inputValues}}];`;
    }
    return compiled.workflow;
  });
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(workflows, null, 2),
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
    JSON.stringify(workflows),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const scenario of cases) {
    active = scenario;
    const before = requests.length;
    const output = await runDocker([
      ...runtime,
      'execute',
      '--id=' + scenario.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const result = {
      case: scenario.id,
      status: execution.status,
      lastNode: execution.data.resultData.lastNodeExecuted,
      requests: requests.length - before,
      ...(execution.data.resultData.error
        ? { error: execution.data.resultData.error.message }
        : {}),
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
          explicitDeferredConnectionPlanning: true,
        },
        null,
        2,
      ),
    );
    assert.equal(result.status, scenario.expected, JSON.stringify(result));
    assert.equal(result.requests, scenario.requests, JSON.stringify(result));
    assert.equal(serverErrors.length, 0, JSON.stringify(serverErrors));
    if (scenario.id === 'bound-omission') {
      assert.equal(result.lastNode, 'Materialize search');
      // n8n presents the pointer after the colon as its error title. Assert the
      // actual stopped node, exact target and HTTP count, not the raw JS wording.
      assert.match(result.error, /\/body\/config\/enabled/);
    }
    console.log(
      `${scenario.id}: ${result.status}, ${result.requests} local requests`,
    );
  }
  console.log(
    `requested-api-inputs: PASSED ${results.length}/${cases.length}; ${directory.pathname}`,
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
