import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
} from '@openapi-flow/core';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import {
  WorkflowDraftNativeNodeAdditionPlanningError,
  WorkflowDraftConnectionEditPlanningError,
} from '@openapi-flow/langchain';
import {
  nativeNodeAdditionFixture,
  nativeAdditionProposal,
} from '../test/fixtures/workflow-draft-native-node-addition-fixture.mjs';
import {
  connectionEditPlan,
  connectionEditProposal,
  addConnection,
} from '../test/fixtures/workflow-draft-connection-edit-fixture.mjs';
import { assemblyBodyValue } from '../test/fixtures/workflow-draft-edit-assembly-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Explicit planner injection for this verification runner, not a library-owned model/retry policy. */
export async function verifyNativeNodeAddition({
  configureNative,
  connectNative,
  label,
}) {
  assert.equal(typeof configureNative, 'function');
  assert.equal(typeof connectNative, 'function');
  assert.ok(label);
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/native-node-addition/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-native-addition-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    results = [];
  let created = false,
    phase = 'configure';
  const server = createServer(async (request, response) => {
    try {
      let text = '';
      for await (const chunk of request) text += chunk;
      const body = text ? JSON.parse(text) : undefined;
      requests.push({
        method: request.method,
        path: request.url,
        ...(body === undefined ? {} : { body }),
      });
      if (request.method === 'POST') {
        assert.equal(request.url, '/items/original-id');
        assert.deepEqual(body, assemblyBodyValue);
      } else {
        assert.equal(request.method, 'GET');
        assert.ok(
          ['/lookup/expected', '/lookup/independent-id'].includes(request.url),
        );
      }
      const value =
        request.method === 'POST'
          ? phase === 'match'
            ? 'expected'
            : 'different'
          : 'lookup-result';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ value }));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await mkdir(directory, { recursive: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const input = await nativeNodeAdditionFixture('if');
    const scenario =
      'Before follow, add an IF. Continue to follow only when the source response JSON field value equals the literal string "expected". Insert it between source and follow. Keep all API values, API bindings, existing native settings and the independent root unchanged.';
    input.context.messages.find((message) => message.id === 'edit-1').text =
      scenario;
    input.plan = connectionEditPlan(input, [
      { kind: 'add-native-node', capability: 'if' },
      { kind: 'revise-connections', nodeIds: ['source', 'follow'] },
    ]);
    input.stepId = input.plan.steps[0].id;
    const original = globalThis.structuredClone(input.draft);
    const addition = await configureNative(input);
    await writeFile(
      new URL('native-addition-result.json', directory),
      JSON.stringify(addition, null, 2),
    );
    assert.equal(
      addition.status,
      'ready',
      'Actual native selection needs clarification, not a fabricated configuration',
    );
    const staged = { ...input, resolutions: [addition.resolution] };
    const connection = await connectNative(staged);
    await writeFile(
      new URL('connection-result.json', directory),
      JSON.stringify(connection, null, 2),
    );
    assert.equal(connection.status, 'ready');
    const draft = connection.candidate.draft;
    const nodeId = input.plan.steps[0].newNodeId;
    assert.deepEqual(draft.apiCalls, original.apiCalls);
    assert.deepEqual(
      draft.nativeNodes.filter((node) => node.id !== nodeId),
      original.nativeNodes,
    );
    assert.deepEqual(input.draft, original);
    const template = compileN8nWorkflowTemplate({
      draft,
      context: input.context,
      name: 'Actual selected native addition and explicit routing',
      deployments: [
        {
          documentId: input.producer.key.documentId,
          baseUrl: `http://host.docker.internal:${server.address().port}`,
        },
      ],
    });
    assert.equal(template.triggerConnected, true);
    assert.equal(template.inputSlots.length, 0);
    template.workflow.id = `native-addition-${runId}`;
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(template.workflow, null, 2),
    );
    await writeFile(
      new URL('scenario-and-drafts.json', directory),
      JSON.stringify(
        {
          scenario,
          plan: input.plan,
          before: original,
          after: draft,
          mappings: template.nodeMappings,
        },
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
      JSON.stringify([template.workflow]),
    );
    assert.equal(imported.code, 0, imported.stderr);
    const nativeName = template.nodeMappings.find(
      (mapping) => mapping.nodeId === nodeId,
    ).exitNodeName;
    const followName = template.nodeMappings.find(
      (mapping) => mapping.nodeId === 'follow',
    ).exitNodeName;
    for (const mode of ['match', 'nonmatch']) {
      phase = mode;
      const start = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${template.workflow.id}`,
        '--rawOutput',
      ]);
      const execution = readN8nExecution(raw.stdout);
      await writeFile(
        new URL(`execution-${mode}.json`, directory),
        JSON.stringify(execution, null, 2),
      );
      const observed = requests.slice(start);
      results.push({ mode, status: execution.status, requests: observed });
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.deepEqual(serverErrors, []);
      assert.equal(observed.length, mode === 'match' ? 3 : 2);
      const runData = execution.data.resultData.runData;
      assert.ok(
        runData[nativeName],
        'The added native node must actually execute',
      );
      const gate = runData[nativeName][0].data.main;
      assert.equal(gate[mode === 'match' ? 0 : 1].length, 1);
      assert.equal(Boolean(runData[followName]), mode === 'match');
      assert.equal(
        observed.some((request) => request.path === '/lookup/expected'),
        mode === 'match',
      );
      assert.ok(
        observed.some((request) => request.path === '/lookup/independent-id'),
      );
      console.log(
        `${mode}: PASSED (${observed.length} requests; actual added IF branch and unchanged independent root)`,
      );
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          results,
          businessApiCalls: 0,
          scope:
            'Actual native addition/configuration -> explicit connection deltas -> SDK template -> isolated n8n; no auto adoption, scenario repair or model retry.',
        },
        null,
        2,
      ),
    );
    console.log(`native-node-addition: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          label,
          phase,
          errorType: error.name,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          results,
          requests,
          serverErrors,
          ...(error instanceof WorkflowDraftNativeNodeAdditionPlanningError ||
          error instanceof WorkflowDraftConnectionEditPlanningError
            ? { failure: error.failure }
            : {}),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifyNativeNodeAddition({
    label: 'deterministic public structured decisions; zero model calls',
    configureNative: (input) =>
      resolveWorkflowDraftNativeNodeAddition({
        ...input,
        fingerprint: describeWorkflowDraftNativeNodeAddition(input).fingerprint,
        proposal: nativeAdditionProposal(input, {
          status: 'provided',
          parameters: {
            combinator: 'and',
            conditions: [
              {
                left: {
                  source: 'response',
                  nodeId: 'source',
                  pointer: '/value',
                },
                operator: 'equals',
                right: { source: 'literal', value: 'expected' },
              },
            ],
          },
        }),
      }),
    connectNative: (input) => {
      const description = describeWorkflowDraftConnectionEdit(input);
      assert.equal(description.status, 'ready');
      const edge = description.existingEdges.find(
        (edge) => edge.edge.from === 'source' && edge.edge.to === 'follow',
      );
      const id = input.plan.steps[0].newNodeId;
      return resolveWorkflowDraftConnectionEdit({
        ...input,
        fingerprint: description.fingerprint,
        proposal: connectionEditProposal(input, [
          { kind: 'remove', edgeId: edge.id },
          addConnection('source', id),
          addConnection(id, 'follow', 'true'),
        ]),
      });
    },
  });
}
