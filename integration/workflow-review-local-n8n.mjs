import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  createHttpRequestNode,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  generationInput,
  compilationInput,
  scriptedReviewModel,
} from '../test/fixtures/workflow-review-fixture.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const volume = `openapi-flow-workflow-review-${process.pid}-${Date.now()}`;
const execute = promisify(execFile);
const directory = new URL(
  '../.local-artifacts/workflow-review/',
  import.meta.url,
);
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  assert.ok(['/items', '/prices'].includes(request.url));
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ value: 'public fixture result' }));
});
let created = false;
try {
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const baseUrl = `http://host.docker.internal:${server.address().port}`;
  const workflows = [];
  const modes = ['selection-gap', 'binding-gap', 'graph-gap'];
  for (const mode of modes) {
    const result = await createReviewableWorkflowGenerationGraph({
      model: scriptedReviewModel(mode),
      capabilities: createN8nNativeCapabilities(),
      deployments: [
        { documentId: 'inventory', baseUrl },
        { documentId: 'pricing', baseUrl },
      ],
    }).invoke({ ...generationInput, workflowId: `public-review-${mode}` });
    assert.equal(result.status, 'needs-review');
    assert.equal(result.workflow.connections.Start, undefined);
    assert.equal(result.workflow.active, false);
    workflows.push(result.workflow);
  }
  const input = await compilationInput();
  input.id = 'public-review-independent-roots';
  input.plan = createReviewableWorkflowGraphPlan({
    ...input,
    gaps: input.plan.gaps,
    proposal: {
      nativeNodes: [],
      edges: [],
      additionalGaps: [],
      blockedCalls: [],
    },
  });
  assert.equal(input.plan.starts.length, 3);
  input.apiNodes = input.materials.map((material) =>
    createHttpRequestNode({ ...material, baseUrl, position: [300, 0] }),
  );
  workflows.push(compileReviewableN8nWorkflow(input).workflow);
  const reconnected = globalThis.structuredClone(workflows[0]);
  reconnected.id = 'public-review-reconnected';
  reconnected.connections.Start = {
    main: [
      [
        {
          node: 'Request public-review-selection-gap-request-1',
          type: 'main',
          index: 0,
        },
      ],
    ],
  };
  workflows.push(reconnected);
  await mkdir(directory, { recursive: true });
  for (const workflow of workflows)
    await writeFile(
      new URL(`${workflow.id}.workflow.json`, directory),
      JSON.stringify(workflow, null, 2),
    );
  const path = new URL('workflows.json', directory);
  await writeFile(path, JSON.stringify(workflows, null, 2));
  const args = [
    'run',
    '--rm',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '--mount',
    `type=bind,source=${fileURLToPath(path)},target=/tmp/workflows.json,readonly`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  await execute('docker', ['volume', 'create', volume]);
  created = true;
  const imported = await execute(
    'docker',
    [...args, 'import:workflow', '--input=/tmp/workflows.json'],
    { timeout: 60_000 },
  );
  assert.match(imported.stdout, /Successfully imported 5 workflows?/);
  await execute(
    'docker',
    [
      ...args,
      'export:workflow',
      '--all',
      '--output=/home/node/.n8n/exported.json',
    ],
    { timeout: 60_000 },
  );
  const exported = await execute('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    'node',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    image,
    '-e',
    "process.stdout.write(require('node:fs').readFileSync('/home/node/.n8n/exported.json','utf8'))",
  ]);
  const actualWorkflows = JSON.parse(exported.stdout);
  assert.equal(actualWorkflows.length, workflows.length);
  for (const expected of workflows) {
    const actual = actualWorkflows.find((item) => item.id === expected.id);
    assert.ok(actual);
    assert.equal(actual.active, false);
    assert.deepEqual(actual.connections, expected.connections);
    assert.equal(actual.nodes.length, expected.nodes.length);
    for (const expectedNode of expected.nodes) {
      const actualNode = actual.nodes.find(
        (item) => item.id === expectedNode.id,
      );
      assert.equal(actualNode.type, expectedNode.type);
      assert.equal(actualNode.name, expectedNode.name);
      assert.equal(actualNode.notes, expectedNode.notes);
      assert.equal(actualNode.notesInFlow, expectedNode.notesInFlow);
      assert.deepEqual(actualNode.parameters, expectedNode.parameters);
      assert.deepEqual(actualNode.position, expectedNode.position);
    }
  }
  const results = [];
  for (const workflow of workflows) {
    const offset = requests.length;
    let output;
    let exitCode = 0;
    try {
      output = await execute(
        'docker',
        [...args, 'execute', '--id=' + workflow.id, '--rawOutput'],
        { timeout: 60_000, maxBuffer: 10_000_000 },
      );
    } catch (error) {
      exitCode = error.code;
      output = error;
    }
    const execution = readN8nExecution(output.stdout);
    const executedNodes = Object.keys(execution.data.resultData.runData);
    const calls = requests.slice(offset);
    if (workflow.id === reconnected.id) {
      assert.equal(exitCode, 1);
      assert.equal(execution.status, 'error');
      assert.match(
        execution.data.resultData.error.message,
        /Refund API needs review/,
        JSON.stringify({ executedNodes, calls }),
      );
      const placeholder = workflow.nodes.find(
        (node) => node.type === 'n8n-nodes-base.code',
      );
      assert.equal(
        execution.data.resultData.lastNodeExecuted,
        placeholder.name,
      );
      assert.deepEqual(calls, ['/items']);
      assert.equal(
        executedNodes.some((name) => name.endsWith('-request-2')),
        false,
      );
    } else {
      assert.equal(exitCode, 0);
      assert.equal(execution.status, 'success');
      assert.deepEqual(executedNodes, ['Start']);
      assert.deepEqual(calls, []);
    }
    results.push({
      id: workflow.id,
      exitCode,
      status: execution.status,
      executedNodes,
      requests: calls,
      error: execution.data.resultData.error
        ? {
            name: execution.data.resultData.error.name,
            message: execution.data.resultData.error.message,
          }
        : undefined,
    });
    console.log(
      `${workflow.id}: PASSED (${calls.length} local contract requests)`,
    );
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        endedAt: new Date().toISOString(),
        image,
        imported: workflows.length,
        exported: actualWorkflows.length,
        internalConnectionsPreserved: true,
        results,
        target: 'isolated-local-fixture',
        actualServiceCalls: false,
        actualModelCalls: false,
        browserPartialExecutionTested: false,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) await execute('docker', ['volume', 'rm', volume]);
}
