import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { nativeParameterEditFixture } from '../test/fixtures/workflow-draft-native-parameter-edit-fixture.mjs';
import {
  conversationSemantic,
  conversationEvidence,
  currentConversationMessage,
} from '../test/fixtures/workflow-draft-conversation-fixture.mjs';
import { assemblyBodyValue } from '../test/fixtures/workflow-draft-edit-assembly-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Actual public host/OSS path. Approval responses are explicit test-driver UI actions, not model decisions. */
export async function verifyWorkflowDraftConversation({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(label);
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/draft-conversation/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-draft-conversation-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    results = [],
    boundaries = [];
  let created = false,
    sourceValue = 'expected',
    phase = 'initialize';
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : undefined;
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
          [
            '/lookup/expected',
            '/lookup/different',
            '/lookup/independent-id',
            '/lookup/changed-id',
          ].includes(request.url),
        );
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          value: request.method === 'POST' ? sourceValue : 'lookup-result',
        }),
      );
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await mkdir(directory, { recursive: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const fixture = await nativeParameterEditFixture();
    const context = {
      ...fixture.context,
      capabilities: [
        ...fixture.context.capabilities,
        ...createN8nNativeCapabilities(),
      ],
    };
    const graph = createWorkflowDraftConversationGraph({
      model,
      checkpointer: new MemorySaver(),
      context,
      name: 'Multi-turn OAS workflow revision',
      reviewPolicy: 'review',
      includeExplanations: false,
      deployments: [
        {
          documentId: fixture.producer.key.documentId,
          baseUrl: `http://host.docker.internal:${server.address().port}`,
        },
      ],
    });
    const config = {
      configurable: { thread_id: `draft-conversation-${runId}` },
      recursionLimit: 200,
    };
    const original = globalThis.structuredClone(fixture.draft);
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
    async function turn(draft, id, text, initial) {
      phase = id;
      const selection = await graph.invoke(
        {
          input: {
            request: { id, text, expectedRevision: draft.revision },
            ...(initial ? { initialDraft: draft } : {}),
          },
        },
        config,
      );
      await writeFile(
        new URL(`${id}-selection.json`, directory),
        JSON.stringify(selection, null, 2),
      );
      assert.deepEqual(selection.draft, draft);
      const selectionBoundary = selection.__interrupt__?.[0]?.value;
      assert.equal(
        selectionBoundary?.kind,
        'draft-review',
        'Actual ambiguous selection must remain visible, not be repaired',
      );
      assert.equal(selectionBoundary.phase, 'selection');
      boundaries.push({ turn: id, boundary: selectionBoundary });
      const candidate = await graph.invoke(
        new Command({
          resume: { action: 'approve', token: selectionBoundary.token },
        }),
        config,
      );
      await writeFile(
        new URL(`${id}-candidate.json`, directory),
        JSON.stringify(candidate, null, 2),
      );
      assert.deepEqual(
        candidate.draft,
        draft,
        'No adoption is allowed before final approval',
      );
      const candidateBoundary = candidate.__interrupt__?.[0]?.value;
      assert.equal(
        candidateBoundary?.kind,
        'draft-review',
        'Unresolved structural questions must remain visible, not be fabricated',
      );
      assert.equal(candidateBoundary.phase, 'candidate');
      boundaries.push({ turn: id, boundary: candidateBoundary });
      const result = await graph.invoke(
        new Command({
          resume: { action: 'approve', token: candidateBoundary.token },
        }),
        config,
      );
      await writeFile(
        new URL(`${id}-complete.json`, directory),
        JSON.stringify(result, null, 2),
      );
      assert.equal(result.phase, 'complete');
      assert.equal(result.artifact.revision, result.draft.revision);
      assert.equal(result.draft.revision, draft.revision + 2);
      assert.equal(result.artifact.triggerConnected, true);
      assert.deepEqual(
        result.draft.apiCalls.filter((call) => call.id !== 'independent'),
        original.apiCalls.filter((call) => call.id !== 'independent'),
      );
      assert.deepEqual(
        result.draft.nativeNodes.filter((node) => node.capability !== 'if'),
        original.nativeNodes,
      );
      await writeFile(
        new URL(`${id}-workflow.json`, directory),
        JSON.stringify(result.artifact.workflow, null, 2),
      );
      return result;
    }
    async function execute(state, id, value, expectedRequests, followExpected) {
      phase = id;
      sourceValue = value;
      const workflow = { ...state.artifact.workflow, id: `${id}-${runId}` };
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const start = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${workflow.id}`,
        '--rawOutput',
      ]);
      const execution = readN8nExecution(raw.stdout);
      await writeFile(
        new URL(`${id}-execution.json`, directory),
        JSON.stringify(execution, null, 2),
      );
      const observed = requests.slice(start);
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.deepEqual(serverErrors, []);
      assert.equal(observed.length, expectedRequests);
      assert.equal(
        observed.some((request) => request.path === `/lookup/${value}`),
        followExpected,
      );
      const independentId = state.draft.apiCalls.find(
        (call) => call.id === 'independent',
      ).values.path.id;
      assert.equal(
        observed.filter(
          (request) => request.path === `/lookup/${independentId}`,
        ).length,
        1,
      );
      const followName = state.artifact.nodeMappings.find(
        (mapping) => mapping.nodeId === 'follow',
      ).exitNodeName;
      assert.equal(
        Boolean(execution.data.resultData.runData[followName]),
        followExpected,
      );
      results.push({
        id,
        revision: state.draft.revision,
        status: execution.status,
        requests: observed,
      });
      console.log(
        `${id}: PASSED (${observed.length} actual requests; approved revision ${state.draft.revision})`,
      );
    }
    const first = await turn(
      original,
      'turn-1',
      'source API 응답 본문의 value가 문자열 "expected"와 같을 때만 follow API를 실행하도록 두 API 사이에 n8n IF를 추가해줘. source에서 follow로 가는 기존 직결은 IF 경로로 교체하고, 다른 모든 API 입력·바인딩·native 설정과 independent 분기는 그대로 유지해줘.',
      true,
    );
    assert.equal(
      first.draft.nativeNodes.filter((node) => node.capability === 'if').length,
      1,
    );
    assert.deepEqual(first.draft.apiCalls, original.apiCalls);
    await execute(first, 'added-if-match', 'expected', 3, true);
    await execute(first, 'added-if-nonmatch', 'different', 2, false);
    const second = await turn(
      first.draft,
      'turn-2',
      'independent API의 path 입력 id만 문자열 "changed-id"로 바꿔줘. 새 API를 선택하거나 추가하지 말고 IF 조건과 모든 연결, 다른 API 입력·바인딩·native 설정은 그대로 유지해줘.',
      false,
    );
    assert.equal(
      second.draft.apiCalls.find((call) => call.id === 'independent').values
        .path.id,
      'changed-id',
    );
    assert.deepEqual(second.draft.edges, first.draft.edges);
    assert.deepEqual(second.draft.nativeNodes, first.draft.nativeNodes);
    await execute(second, 'updated-api-input', 'expected', 3, true);
    const third = await turn(
      second.draft,
      'turn-3',
      '앞서 추가한 IF 노드를 제거하고 source에서 follow로 가는 main → main 직결을 복원해줘. IF로 들어가거나 IF에서 나오는 간선도 명시적으로 제거해줘. independent의 changed-id를 포함해 다른 API 입력·바인딩·native 설정은 모두 그대로 유지해줘.',
      false,
    );
    assert.deepEqual(third.draft.edges, original.edges);
    assert.deepEqual(third.draft.nativeNodes, original.nativeNodes);
    assert.deepEqual(third.draft.apiCalls, second.draft.apiCalls);
    await execute(third, 'removed-if', 'different', 3, true);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          results,
          boundaries,
          businessApiCalls: 0,
          scope:
            'Actual host graph and scoped OSS planning, six explicit UI approval/resume boundaries, revisions 2/4/6, SDK export and isolated n8n. No output repair, retry, guessed state adoption or real business calls.',
        },
        null,
        2,
      ),
    );
    console.log(`draft-conversation: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    const schemaMessage =
      error.status === 400 &&
      typeof error.error?.message === 'string' &&
      /schema/i.test(error.error.message)
        ? error.error.message.slice(0, 1600)
        : undefined;
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          label,
          phase,
          errorType: error.name,
          httpStatus: error.status,
          schemaMessage,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          results,
          boundaries,
          requests,
          serverErrors,
          ...(error.name?.startsWith('WorkflowDraft')
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

export function scriptedConversationVerificationModel() {
  const calls = [];
  let gateId;
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            schema,
            options,
            name: options.name,
            payload: JSON.parse(messages[1].content),
            messages,
          };
          calls.push(call);
          const latest = currentConversationMessage(call);
          if (call.name === 'analyze_workflow_draft_edit') {
            if (latest.id === 'turn-1')
              return {
                decisions: [
                  conversationSemantic(call, {
                    kind: 'add-native-node',
                    capability: 'if',
                  }),
                  conversationSemantic(call, {
                    kind: 'revise-connections',
                    nodeIds: ['source', 'follow'],
                  }),
                ],
              };
            if (latest.id === 'turn-2')
              return {
                decisions: [
                  conversationSemantic(call, {
                    kind: 'revise-api-inputs',
                    nodeId: 'independent',
                  }),
                ],
              };
            gateId = call.payload.draft.nativeNodes.find(
              (node) => node.capability === 'if',
            ).id;
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'remove-node',
                  nodeId: gateId,
                }),
                conversationSemantic(call, {
                  kind: 'revise-connections',
                  nodeIds: ['source', 'follow'],
                }),
              ],
            };
          }
          if (call.name === 'generate_draft_native_node_addition')
            return {
              decision: {
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
                sourceMessageIds: [latest.id],
              },
            };
          if (call.name === 'select_draft_api_input_edit_targets')
            return {
              targets: [
                {
                  kind: 'set',
                  pointer: '/path/id',
                  ...conversationEvidence(call),
                },
              ],
            };
          if (call.name === 'generate_draft_api_input_edit_values')
            return {
              values: {
                'value-1': {
                  status: 'provided',
                  value: 'changed-id',
                  source: {
                    messageId: latest.id,
                    sourceFormat: 'text',
                    sourceText: 'changed-id',
                  },
                },
              },
            };
          if (call.name === 'plan_draft_connection_edit') {
            const decisions = [];
            if (latest.id === 'turn-1') {
              gateId = call.payload.nativeNodes.find(
                (node) => node.capability === 'if',
              ).id;
              const direct = call.payload.existingEdges.find(
                (item) =>
                  item.edge.from === 'source' && item.edge.to === 'follow',
              );
              decisions.push(
                { kind: 'remove', edgeId: direct.id },
                {
                  kind: 'add',
                  source: { nodeId: 'source', port: 'main' },
                  target: { nodeId: gateId, port: 'main' },
                },
                {
                  kind: 'add',
                  source: { nodeId: gateId, port: 'true' },
                  target: { nodeId: 'follow', port: 'main' },
                },
              );
            } else {
              for (const edge of call.payload.existingEdges.filter(
                (item) => item.edge.from === gateId || item.edge.to === gateId,
              ))
                decisions.push({ kind: 'remove', edgeId: edge.id });
              decisions.push({
                kind: 'add',
                source: { nodeId: 'source', port: 'main' },
                target: { nodeId: 'follow', port: 'main' },
              });
            }
            return {
              decisions: decisions.map((decision) => ({
                ...decision,
                ...conversationEvidence(call),
              })),
            };
          }
          throw new Error(
            `Unexpected conversation verification stage ${call.name}`,
          );
        },
      };
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyWorkflowDraftConversation({
    model: scriptedConversationVerificationModel(),
    label: 'deterministic bounded model fixtures; no external model calls',
  });
