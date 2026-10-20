import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import {
  compileN8nWorkflowTemplate,
  N8nNativeFeature,
  resolveN8nNativeFeatures,
} from '@openapi-flow/n8n';
import {
  workflowTemplateFixture,
  actualTemplateInputs,
} from '../test/fixtures/workflow-template-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const runId = `${Date.now()}-${process.pid}`;
const volume = `openapi-flow-input-template-${runId}`;
const directory = new URL(
  `../.local-artifacts/workflow-template/${runId}/`,
  import.meta.url,
);
const requests = [];
const failures = [];
let wrongSource = false;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({
      path: url.pathname,
      query: [...url.searchParams],
      body: body ? JSON.parse(body) : undefined,
    });
    if (url.pathname === '/seed')
      assert.equal(url.searchParams.get('id'), 'input-actual');
    else if (url.pathname === '/submit/response%2Factual')
      assert.deepEqual(JSON.parse(body), {
        quantity: 0,
        enabled: false,
        labels: ['={{ this is literal data }}'],
        metadata: { 0: 'actual' },
        nullable: null,
      });
    else assert.equal(url.pathname, '/health');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: wrongSource && url.pathname === '/seed' ? 42 : 'response/actual',
      }),
    );
  } catch (error) {
    failures.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
let created = false;
const results = [];
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const nativeRegistry = resolveN8nNativeFeatures({
    features: [N8nNativeFeature.MergeAppend],
  });
  const fixture = await workflowTemplateFixture(nativeRegistry.capabilities);
  fixture.deployments[0].baseUrl = `http://host.docker.internal:${server.address().port}`;
  const pending = compileN8nWorkflowTemplate(fixture);
  const values = actualTemplateInputs(pending.inputSlots);
  const workflows = [];
  for (const mode of [
    'missing-input',
    'valid-input',
    'wrong-type',
    'invalid-response',
  ]) {
    const compiled = compileN8nWorkflowTemplate({
      ...fixture,
      draft: { ...fixture.draft, id: mode },
      ...(mode === 'valid-input' || mode === 'invalid-response'
        ? { inputValues: values }
        : {}),
    });
    if (mode === 'wrong-type') {
      const quantity = compiled.inputSlots.find(
        (slot) => slot.targetPointer === '/body/quantity',
      );
      const actual = { ...values, [quantity.id]: '0' };
      // Simulate editing the exported input node after import, not a compiler repair.
      compiled.workflow.nodes.find(
        (node) => node.id === 'openapi-flow-inputs',
      ).parameters.jsCode =
        `const inputValues=${JSON.stringify(actual)};return [{json:{revision:${compiled.revision},values:inputValues}}];`;
    }
    workflows.push(compiled.workflow);
  }
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
  for (const workflow of workflows) {
    wrongSource = workflow.id === 'invalid-response';
    const offset = requests.length;
    const output = await runDocker([
      ...runtime,
      'execute',
      '--id=' + workflow.id,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const data = execution.data.resultData;
    const calls = requests.slice(offset);
    const observed = {
      case: workflow.id,
      status: execution.status,
      lastNode: data.lastNodeExecuted,
      requestCount: calls.length,
      executedNodes: Object.keys(data.runData),
      ...(data.error ? { error: data.error.message } : {}),
    };
    results.push(observed);
    await writeFile(
      new URL('observed-results.json', directory),
      JSON.stringify(results, null, 2),
    );
    if (workflow.id === 'valid-input') {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(calls.length, 3);
      assert.ok(data.runData.join);
    } else {
      assert.equal(execution.status, 'error');
      if (workflow.id === 'invalid-response') {
        assert.equal(data.lastNodeExecuted, 'Materialize submit');
        assert.equal(
          calls.filter((call) => call.path.startsWith('/submit')).length,
          0,
        );
        assert.match(JSON.stringify(data.error), /OAS contract/);
      } else {
        assert.equal(data.lastNodeExecuted, '입력 사전 검사');
        assert.equal(calls.length, 0);
      }
    }
    assert.deepEqual(failures, []);
    console.log(workflow.id + ': PASSED (' + calls.length + ' requests)');
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        image,
        results,
        businessServiceCalls: 0,
        planner: 'deterministic-fixture-no-LLM',
        target: 'isolated-local-contract-server',
        registeredNativeFeatures: nativeRegistry.registrations.map(
          (entry) => entry.feature,
        ),
      },
      null,
      2,
    ),
  );
  console.log('workflow-template: PASSED');
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
