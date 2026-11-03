import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import console from 'node:console';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
} from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  compileN8nWorkflowTemplate,
  createApiResponseResultsCapability,
} from '@openapi-flow/n8n';
import { recursiveOasDocument } from '../test/fixtures/recursive-oas-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

// Synthetic read-only fixture. Both validation and comparison code come from the OSS compiler.
const cases = [
  {
    id: 'valid',
    body: { name: 'root', children: [{ name: 'leaf', children: [] }] },
    status: 'success',
  },
  {
    id: 'nullable',
    body: { name: 'root', children: [{ name: 'leaf', children: [] }, null] },
    status: 'success',
  },
  {
    id: 'invalid-contract',
    body: { name: 'root', children: [{ name: 7, children: [] }] },
    status: 'error',
    message: 'OAS contract',
  },
  {
    id: 'comparison-failure',
    body: { name: 'root', children: [{ name: 'different', children: [] }] },
    status: 'error',
    message: 'Recursive leaf comparison failed',
  },
];
let sample;
let calls = 0;
const server = createServer((request, response) => {
  assert.equal(request.url, '/tree');
  assert.equal(request.method, 'GET');
  calls++;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(sample.body));
});
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
try {
  const spec = recursiveOasDocument();
  spec.paths['/tree'].get = { responses: spec.paths['/tree'].post.responses };
  delete spec.paths['/tree'].post;
  spec.components.schemas.Node.nullable = true;
  const catalog = await createApiCatalog([{ id: 'recursive', spec }]);
  const operations = JSON.parse(
    JSON.stringify(
      await resolveApiOperations(catalog, [catalog.operations[0].key]),
    ),
  );
  const context = {
    operations,
    capabilities: [
      ...createN8nNativeCapabilities(),
      createApiResponseResultsCapability({
        materials: ['left', 'right'].map((callId) => ({
          callId,
          operation: operations[0],
        })),
      }),
    ],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'recursive-oas-engine-check',
      requirements: [],
      apiCalls: ['left', 'right'].map((id) => ({
        id,
        operation: operations[0].key,
        values: {},
        bindings: [],
      })),
      nativeNodes: [
        {
          id: 'gather',
          capability: 'gather-api-responses',
          parameters: { sourceNodeIds: ['left', 'right'] },
        },
        {
          id: 'check',
          capability: 'assert-responses',
          parameters: {
            checks: [
              {
                left: {
                  source: 'node-output',
                  nodeId: 'gather',
                  pointer: '/results/0/body/children/0/name',
                },
                operator: 'equals',
                right: { source: 'literal', value: 'leaf' },
                message: 'Recursive leaf comparison failed',
              },
            ],
          },
        },
      ],
      edges: [
        { from: 'left', output: 'main', to: 'gather', input: 'input1' },
        { from: 'right', output: 'main', to: 'gather', input: 'input2' },
        { from: 'gather', output: 'main', to: 'check', input: 'main' },
      ],
    },
  });
  const template = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Recursive OAS engine regression',
    deployments: [
      {
        documentId: 'recursive',
        baseUrl: `http://host.docker.internal:${server.address().port}`,
        credentialBindings: {},
      },
    ],
  });
  assert.equal(template.triggerConnected, true);
  assert.equal(template.inputSlots.length, 0);
  for (sample of cases) {
    const workflow = globalThis.structuredClone(template.workflow);
    workflow.id = 'recursive-' + sample.id;
    workflow.settings = {
      ...workflow.settings,
      saveExecutionProgress: false,
      saveManualExecutions: false,
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
    };
    const before = calls;
    const raw = await runDocker(
      [
        'run',
        '--rm',
        '-i',
        '--tmpfs',
        '/home/node/.n8n:uid=1000,gid=1000,mode=0700,size=512m',
        '--tmpfs',
        '/tmp:uid=1000,gid=1000,mode=0700,size=256m',
        '-e',
        'N8N_DIAGNOSTICS_ENABLED=false',
        '-e',
        'EXECUTIONS_DATA_SAVE_ON_SUCCESS=none',
        '-e',
        'EXECUTIONS_DATA_SAVE_ON_ERROR=none',
        '-e',
        'EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false',
        '--entrypoint=/bin/sh',
        'n8nio/n8n:2.37.10',
        '-c',
        `cat > /tmp/workflow.json && n8n import:workflow --input=/tmp/workflow.json && n8n execute --id=${workflow.id} --rawOutput`,
      ],
      JSON.stringify([workflow]),
    );
    const execution = readN8nExecution(raw.stdout);
    assert.equal(execution.status, sample.status);
    assert.equal(calls - before, 2);
    const runData = execution.data.resultData.runData;
    if (sample.message) {
      const errors = Object.values(runData)
        .flat()
        .filter((run) => run.executionStatus === 'error');
      assert.equal(errors.length, 1);
      assert.ok(JSON.stringify(errors[0].error).includes(sample.message));
    } else
      assert.deepEqual(runData.check[0].data.main[0][0].json, {
        pass: true,
        assertionCount: 1,
      });
    console.log(
      JSON.stringify({
        case: sample.id,
        status: execution.status,
        readRequests: calls - before,
      }),
    );
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
