import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  apiResponseSourcesFixture,
  responseSourceScenario,
  responseSourcesModel,
} from '../test/fixtures/workflow-draft-api-response-sources-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Only the public host/planning/SDK path creates nodes and connections; this driver observes actual HTTP/runtime results. */
export async function verifyApiResponseSources({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/api-response-sources/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-api-response-sources-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    results = [];
  let enabled = true,
    created = false,
    phase = 'initialize';
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'GET');
      const url = new URL(request.url, 'http://fixture.invalid');
      const path = decodeURIComponent(url.pathname);
      requests.push({
        method: request.method,
        path,
        query: [...url.searchParams.entries()],
      });
      let body;
      if (path === '/seed/seed')
        body = {
          accountId: 'response-member',
          email: 'response@example.test',
          enabled,
        };
      else if (path === '/profiles/response-member')
        body = { name: 'Unchanged fixture member' };
      else if (path === '/email/response@example.test') body = { valid: true };
      else if (path === '/addresses') {
        assert.deepEqual(
          [...url.searchParams.entries()],
          [['owner', 'response-member']],
        );
        body = { count: 0 };
      } else if (path === '/history/response-member') body = { total: 0 };
      else throw new Error(`Unexpected fixture path ${path}`);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await mkdir(directory, { recursive: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const fixture = await apiResponseSourcesFixture();
    const context = { ...fixture.context, messages: [] };
    const graph = createWorkflowDraftConversationGraph({
      model,
      context,
      checkpointer: new MemorySaver(),
      name: 'Five selected APIs with response-owned requests',
      reviewPolicy: 'review',
      includeExplanations: false,
      deployments: [
        ...new Set(
          context.operations.map((operation) => operation.key.documentId),
        ),
      ].map((documentId) => ({
        documentId,
        baseUrl: `http://host.docker.internal:${server.address().port}`,
      })),
    });
    const config = {
      configurable: { thread_id: `api-response-sources-${runId}` },
      recursionLimit: 200,
    };
    phase = 'selection';
    let state = await graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: {
            id: 'request-1',
            text: responseSourceScenario,
            expectedRevision: 0,
          },
        },
      },
      config,
    );
    await writeFile(
      new URL('selection.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(
      state.__interrupt__?.[0]?.value.phase,
      'selection',
      'A real clarification remains visible instead of being repaired',
    );
    phase = 'candidate';
    state = await graph.invoke(
      new Command({
        resume: {
          action: 'approve',
          token: state.__interrupt__[0].value.token,
        },
      }),
      config,
    );
    await writeFile(
      new URL('candidate.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(
      state.__interrupt__?.[0]?.value.phase,
      'candidate',
      'Unresolved material/structure questions cannot be auto-approved',
    );
    assert.deepEqual(state.draft.apiCalls, []);
    phase = 'adoption';
    state = await graph.invoke(
      new Command({
        resume: {
          action: 'approve',
          token: state.__interrupt__[0].value.token,
        },
      }),
      config,
    );
    await writeFile(
      new URL('complete.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(state.phase, 'complete');
    assert.equal(state.draft.apiCalls.length, 5);
    assert.equal(state.draft.nativeNodes.length, 3);
    assert.equal(state.draft.edges.length, 10);
    assert.equal(state.artifact.revision, state.draft.revision);
    assert.equal(state.artifact.triggerConnected, true);
    const byPath = new Map(
      state.draft.apiCalls.map((call) => [
        context.operations.find(
          (operation) =>
            operation.key.documentId === call.operation.documentId &&
            operation.key.operationRef === call.operation.operationRef,
        ).path,
        call,
      ]),
    );
    const root = byPath.get('/seed/{seedId}');
    assert.deepEqual(root.values, { path: { seedId: 'seed' } });
    assert.deepEqual(root.bindings, []);
    for (const call of state.draft.apiCalls.filter(
      (call) => call.id !== root.id,
    )) {
      assert.deepEqual(call.values, {});
      assert.equal(call.bindings.length, 1);
      assert.equal(call.bindings[0].sourceNodeId, root.id);
    }
    const gate = state.draft.nativeNodes.find(
      (node) => node.capability === 'if',
    );
    const merge = state.draft.nativeNodes.find(
      (node) => node.capability === 'merge-append',
    );
    const pass = state.draft.nativeNodes.find(
      (node) => node.capability === 'pass-through',
    );
    assert.equal(gate.parameters.combinator, 'and');
    assert.equal(merge.parameters.numberInputs, 4);
    assert.equal(
      state.draft.edges.filter(
        (edge) => edge.from === gate.id && edge.output === 'true',
      ).length,
      4,
    );
    assert.equal(
      new Set(
        state.draft.edges
          .filter((edge) => edge.to === merge.id)
          .map((edge) => edge.input),
      ).size,
      4,
    );
    const workflow = {
      ...state.artifact.workflow,
      id: `api-response-sources-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
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
      JSON.stringify([workflow]),
    );
    assert.equal(imported.code, 0, imported.stderr);
    const passName = state.artifact.nodeMappings.find(
      (mapping) => mapping.nodeId === pass.id,
    ).exitNodeName;
    for (const value of [true, false]) {
      phase = value ? 'enabled' : 'disabled';
      enabled = value;
      const start = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${workflow.id}`,
        '--rawOutput',
      ]);
      const execution = readN8nExecution(raw.stdout);
      await writeFile(
        new URL(`${phase}-execution.json`, directory),
        JSON.stringify(execution, null, 2),
      );
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.deepEqual(serverErrors, []);
      const observed = requests.slice(start);
      assert.equal(observed.length, value ? 5 : 1);
      assert.equal(observed[0].path, '/seed/seed');
      const output = execution.data.resultData.runData[passName];
      assert.equal(Boolean(output), value);
      if (value) {
        const bodies = output.flatMap((run) =>
          run.data.main[0].map((item) => item.json.body),
        );
        assert.equal(bodies.length, 4);
        assert.deepEqual(
          bodies.map((body) => JSON.stringify(body)).sort(),
          [
            { name: 'Unchanged fixture member' },
            { valid: true },
            { count: 0 },
            { total: 0 },
          ]
            .map((body) => JSON.stringify(body))
            .sort(),
        );
      }
      results.push({
        enabled: value,
        status: execution.status,
        requests: observed,
      });
      console.log(
        `api-response-sources ${phase}: PASSED (${observed.length} actual HTTP requests)`,
      );
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          oasDocuments: 2,
          apiInstances: 5,
          nativeInstances: 3,
          simulatedUiApprovals: 2,
          revision: state.draft.revision,
          results,
          businessApiCalls: 0,
          scope:
            'Actual host and original selected OAS contracts; explicit response bindings, IF fan-out, four distinct Merge inputs, unchanged typed values. No repaired output, inferred edges, dummy requests or automatic retry.',
        },
        null,
        2,
      ),
    );
    console.log(`api-response-sources: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          label,
          phase,
          errorType: error.name,
          httpStatus: error.status,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          ...(error.name?.startsWith('WorkflowDraft')
            ? { failure: error.failure }
            : {}),
          results,
          requests,
          serverErrors,
          businessApiCalls: 0,
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
if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyApiResponseSources({
    model: responseSourcesModel(),
    label:
      'Deterministic model fixture; producer selected after consumers and native IF; actual host and n8n',
  });
