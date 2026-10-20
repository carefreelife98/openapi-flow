import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createWorkflowDraft } from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  compilePlannedN8nWorkflow,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  nativeRuntimeInputFixture,
  nativeRuntimeCompilationFixture,
  runtimeNativeValue,
} from '../test/fixtures/native-runtime-input-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const runId = `${Date.now()}-${process.pid}`;
const volume = `openapi-flow-native-input-${runId}`;
const directory = new URL(
  `../.local-artifacts/native-runtime-inputs/${runId}/`,
  import.meta.url,
);
const requests = [];
const serverErrors = [];
let expected = runtimeNativeValue;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({
      path: url.pathname,
      body: body ? JSON.parse(body) : undefined,
    });
    if (url.pathname === '/echo') assert.deepEqual(JSON.parse(body), expected);
    else assert.equal(url.pathname, '/health');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(url.pathname === '/echo' ? expected : { ok: true }),
    );
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
let created = false;
const results = [];
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const fixture = await nativeRuntimeInputFixture();
  fixture.deployments[0].baseUrl = `http://host.docker.internal:${server.address().port}`;
  const [slot] = compileN8nWorkflowTemplate(fixture).inputSlots;
  const changedValue = {
    ...runtimeNativeValue,
    id: 'native/next',
    count: 2,
    enabled: true,
    marker: '={{ still literal }}',
  };
  const cases = [];
  for (const mode of [
    'missing-input',
    'wrong-type',
    'valid-input',
    'changed-input',
    'altered-after-preflight',
    'stale-after-preflight',
  ]) {
    const value = mode === 'changed-input' ? changedValue : runtimeNativeValue;
    const supplied = !['missing-input', 'wrong-type'].includes(mode);
    const compiled = compileN8nWorkflowTemplate({
      ...fixture,
      draft: { ...fixture.draft, id: `native-input-${runId}-${mode}` },
      ...(supplied ? { inputValues: { [slot.id]: value } } : {}),
    });
    if (mode === 'wrong-type') {
      const setup = compiled.workflow.nodes.find(
        (node) => node.name === '입력 설정',
      );
      setup.parameters.jsCode = `return [{json:{revision:0,values:${JSON.stringify({ [slot.id]: { ...value, count: '0' } })}}}];`;
    }
    if (
      mode === 'altered-after-preflight' ||
      mode === 'stale-after-preflight'
    ) {
      const preflight = compiled.workflow.nodes.find(
        (node) => node.name === '입력 사전 검사',
      );
      const marker = 'return [{json:payload,pairedItem:{item:0}}];';
      assert.ok(preflight.parameters.jsCode.includes(marker));
      const mutation =
        mode === 'altered-after-preflight'
          ? `payload.values[${JSON.stringify(slot.id)}].count='0';`
          : 'payload.revision=1;';
      // Deliberate corruption after successful validation tests the immediate native guard.
      preflight.parameters.jsCode = preflight.parameters.jsCode.replace(
        marker,
        mutation + marker,
      );
    }
    cases.push({ mode, value, workflow: compiled.workflow });
  }
  const stopDraft = createWorkflowDraft({
    context: fixture.context,
    content: {
      id: `native-input-${runId}-stop`,
      requirements: [],
      apiCalls: [],
      nativeNodes: [
        {
          id: 'stop',
          capability: 'stop-and-error',
          parameters: {},
          runtimeParameters: true,
        },
      ],
      edges: [],
    },
  });
  const {
    count,
    marker: runtimeMarker,
    ...knownParameters
  } = runtimeNativeValue;
  const partialDraft = createWorkflowDraft({
    context: fixture.context,
    content: {
      id: `native-input-${runId}-partial`,
      requirements: fixture.draft.requirements,
      apiCalls: fixture.draft.apiCalls,
      edges: fixture.draft.edges,
      nativeNodes: fixture.draft.nativeNodes.map((node) =>
        node.runtimeParameters === true
          ? {
              ...node,
              parameters: knownParameters,
              runtimeParameters: { pointers: ['/count', '/marker'] },
            }
          : node,
      ),
    },
  });
  const partial = { ...fixture, draft: partialDraft };
  const partialSlots = compileN8nWorkflowTemplate(partial).inputSlots;
  assert.equal(partialSlots.length, 2);
  for (const mode of [
    'partial-missing',
    'partial-valid',
    'partial-wrong-type',
  ]) {
    const inputValues = Object.fromEntries(
      partialSlots.map((slot) => [
        slot.id,
        slot.targetPointer === '/count'
          ? mode === 'partial-wrong-type'
            ? '0'
            : count
          : runtimeMarker,
      ]),
    );
    const compiled = compileN8nWorkflowTemplate({
      ...partial,
      draft: { ...partialDraft, id: `native-input-${runId}-${mode}` },
      ...(mode === 'partial-valid' ? { inputValues } : {}),
    });
    if (mode === 'partial-wrong-type') {
      const setup = compiled.workflow.nodes.find(
        (node) => node.name === '입력 설정',
      );
      setup.parameters.jsCode = `return [{json:{revision:0,values:${JSON.stringify(inputValues)}}}];`;
    }
    cases.push({
      mode,
      value: runtimeNativeValue,
      workflow: compiled.workflow,
    });
  }
  const stopInput = {
    draft: stopDraft,
    context: fixture.context,
    name: 'Explicit runtime error message',
  };
  // Strict and review exports share the same explicit input protocol without
  // manufacturing a canonical draft or changing the existing API contracts.
  for (const [compiler, compile] of [
    ['planned', compilePlannedN8nWorkflow],
    ['reviewable', compileReviewableN8nWorkflow],
  ]) {
    for (const partial of [false, true]) {
      const { input } = await nativeRuntimeCompilationFixture({
        baseUrl: fixture.deployments[0].baseUrl,
        partial,
      });
      const inputSlots = compile(input).nativeInputTemplate.inputSlots;
      const actualValues = Object.fromEntries(
        inputSlots.map((slot) => [
          slot.id,
          partial
            ? slot.targetPointer === '/count'
              ? 0
              : '42'
            : runtimeNativeValue,
        ]),
      );
      for (const outcome of ['valid', 'missing', 'wrong-type']) {
        const mode = `${compiler}-${partial ? 'partial' : 'whole'}-${outcome}`;
        const result = compile({
          ...input,
          id: `native-input-${runId}-${mode}`,
          nativeInputs: {
            revision: 7,
            ...(outcome === 'valid' ? { inputValues: actualValues } : {}),
          },
        });
        if (outcome === 'wrong-type') {
          const values = globalThis.structuredClone(actualValues);
          const slot = inputSlots.find(
            (slot) => slot.targetPointer === (partial ? '/count' : ''),
          );
          if (partial) values[slot.id] = '0';
          else values[slot.id].count = '0';
          result.workflow.nodes.find(
            (node) => node.name === '입력 설정',
          ).parameters.jsCode =
            `return [{json:{revision:7,values:${JSON.stringify(values)}}}];`;
        }
        cases.push({
          mode,
          value: runtimeNativeValue,
          expectedSuccess: outcome === 'valid',
          workflow: result.workflow,
        });
      }
    }
  }
  const reviewFixture = await nativeRuntimeCompilationFixture({
    baseUrl: fixture.deployments[0].baseUrl,
    partial: true,
    gap: true,
  });
  const review = compileReviewableN8nWorkflow(reviewFixture.input);
  assert.equal(review.status, 'needs-review');
  assert.equal(review.workflow.connections.Start, undefined);
  assert.equal(
    review.workflow.connections.join.main[0][0].node,
    '확인 필요 · missing-action',
  );
  await writeFile(
    new URL('reviewable-gap.json', directory),
    JSON.stringify(review.workflow, null, 2),
  );
  const [stopSlot] = compileN8nWorkflowTemplate(stopInput).inputSlots;
  const stop = compileN8nWorkflowTemplate({
    ...stopInput,
    inputValues: { [stopSlot.id]: { message: '={{ literal failure text }}' } },
  });
  cases.push({ mode: 'runtime-stop', workflow: stop.workflow });
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
    expected = entry.value;
    const offset = requests.length;
    const output = await runDocker([
      ...runtime,
      'execute',
      `--id=${entry.workflow.id}`,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const data = execution.data.resultData;
    const observed = requests.slice(offset);
    const result = {
      case: entry.mode,
      status: execution.status,
      lastNode: data.lastNodeExecuted,
      requestCount: observed.length,
      echoRequests: observed.filter((request) => request.path === '/echo')
        .length,
      ...(data.error ? { error: data.error.message } : {}),
    };
    results.push(result);
    await writeFile(
      new URL('observed-results.json', directory),
      JSON.stringify(results, null, 2),
    );
    if (
      entry.mode === 'valid-input' ||
      entry.mode === 'changed-input' ||
      entry.mode === 'partial-valid' ||
      entry.expectedSuccess === true
    ) {
      assert.equal(execution.status, 'success', JSON.stringify(data.error));
      assert.equal(observed.length, 2);
      assert.equal(result.echoRequests, 1);
      assert.ok(data.runData.join);
      assert.deepEqual(
        data.runData.context[0].data.main[0][0].json,
        entry.value,
      );
    } else {
      assert.equal(execution.status, 'error', entry.mode);
      if (entry.mode === 'runtime-stop') {
        assert.equal(data.lastNodeExecuted, 'stop');
        assert.match(data.error.message, /literal failure text/);
        assert.equal(observed.length, 0);
      } else if (entry.mode === 'stale-after-preflight') {
        // Independent roots may reach either revision guard first. No branch
        // may perform an external call with a stale shared configuration.
        assert.equal(observed.length, 0);
        assert.match(JSON.stringify(data.error), /revision/i);
      } else if (entry.mode === 'altered-after-preflight') {
        assert.equal(data.lastNodeExecuted, 'Parameters context');
        assert.equal(result.echoRequests, 0);
        assert.ok(observed.length <= 1);
      } else {
        assert.equal(data.lastNodeExecuted, '입력 사전 검사');
        assert.equal(observed.length, 0);
      }
    }
    assert.deepEqual(serverErrors, []);
    console.log(`${entry.mode}: PASSED (${observed.length} requests)`);
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        image,
        results,
        modelCalls: 0,
        businessServiceCalls: 0,
        target: 'isolated-local-contract-server',
      },
      null,
      2,
    ),
  );
  console.log(`native-runtime-inputs: PASSED (${directory.pathname})`);
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}
