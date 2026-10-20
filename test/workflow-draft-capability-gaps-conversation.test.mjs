import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { capabilityGapFixture } from './fixtures/workflow-draft-capability-gap-fixture.mjs';
import {
  conversationSemantic,
  conversationEvidence,
} from './fixtures/workflow-draft-conversation-fixture.mjs';

async function conversation(
  reviewPolicy = 'automatic',
  mixed = false,
  suggestions = false,
) {
  const f = await capabilityGapFixture();
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            name: options.name,
            payload: JSON.parse(messages[1].content),
            schema,
          };
          calls.push(call);
          if (call.name === 'suggest_workflow_review_follow_ups')
            return { suggestions: [] };
          if (call.name === 'analyze_workflow_draft_edit') {
            const existing = call.payload.draft.gapNodes;
            if (existing?.length) {
              assert.equal(
                Object.hasOwn(existing[0], 'inventory'),
                false,
                'Original inventory receipts are code-owned, not needed for the next semantic choice',
              );
              return {
                decisions: [
                  conversationSemantic(call, {
                    kind: 'remove-node',
                    nodeId: existing[0].id,
                  }),
                ],
              };
            }
            return {
              decisions: [
                ...(mixed
                  ? [
                      conversationSemantic(
                        call,
                        {
                          kind: 'add-api-call',
                          operation: call.payload.candidates.find(
                            (candidate) => candidate.operation.path === '/seed',
                          ).candidateId,
                        },
                        '독립 조회를 실행해줘.',
                      ),
                    ]
                  : []),
                conversationSemantic(
                  call,
                  { kind: 'report-capability-gap', finding: f.finding },
                  '변경 이력 조회',
                ),
              ],
            };
          }
          if (call.name === 'plan_draft_connection_edit') {
            assert.equal(call.payload.gapNodes.length, 1);
            assert.equal(
              Object.hasOwn(call.payload.gapNodes[0], 'inventory'),
              false,
            );
            return {
              decisions: [
                {
                  kind: 'add',
                  source: {
                    nodeId: call.payload.apiInstances[0].nodeId,
                    port: 'main',
                  },
                  target: { nodeId: call.payload.gapNodes[0].id, port: 'main' },
                  ...conversationEvidence(call),
                },
              ],
            };
          }
          throw new Error('Unexpected gap-planning model stage ' + call.name);
        },
      };
    },
  };
  const graph = createWorkflowDraftConversationGraph({
    context: { ...f.context, messages: [] },
    model,
    checkpointer: new MemorySaver(),
    name: '명시적 결손 검토',
    reviewPolicy,
    includeExplanations: false,
    ...(suggestions
      ? { reviewSuggestions: { limits: { maxSuggestions: 2 } } }
      : {}),
    ...(mixed
      ? {
          deployments: [
            {
              documentId: f.operation.key.documentId,
              baseUrl: 'https://fixture.example.test',
              credentialBindings: {},
            },
          ],
        }
      : {}),
  });
  const config = {
    configurable: { thread_id: 'capability-gap' },
    recursionLimit: 100,
  };
  const first = () =>
    graph.invoke(
      {
        input: {
          initialDraft: f.draft,
          request: {
            id: 'request-1',
            expectedRevision: 0,
            text: f.context.messages[0].text,
          },
        },
      },
      config,
    );
  const resume = (state, response) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      config,
    );
  return { ...f, graph, config, calls, first, resume };
}

test('an explicit missing role exports a detached review workflow instead of an empty no-change outcome', async () => {
  const f = await conversation();
  const result = await f.first();
  assert.equal(result.phase, 'complete');
  assert.equal(result.outcome.kind, 'workflow-exported');
  assert.equal(result.outcome.triggerConnected, false);
  assert.equal(result.draft.gapNodes.length, 1);
  assert.deepEqual(result.outcome.unresolvedGapNodeIds, [
    result.draft.gapNodes[0].id,
  ]);
  assert.deepEqual(result.draft.apiCalls, []);
  assert.deepEqual(result.draft.nativeNodes, []);
  assert.equal(result.artifact.draftReadiness.designReady, false);
  assert.match(result.artifact.guide, /변경 이력 조회/);
  assert.equal(
    f.calls.length,
    1,
    'Only the semantic model decides an unsupported role; no fabricated parameter or routing call',
  );
});

test('independent API work still plans with a structurally connected gap, but the complete export is not executable', async () => {
  const f = await conversation('automatic', true);
  const result = await f.first();
  assert.equal(result.draft.apiCalls.length, 1);
  assert.equal(result.draft.gapNodes.length, 1);
  assert.deepEqual(result.draft.edges, [
    {
      from: result.draft.apiCalls[0].id,
      output: 'main',
      to: result.draft.gapNodes[0].id,
      input: 'main',
    },
  ]);
  assert.equal(result.artifact.triggerConnected, false);
  assert.equal(
    result.artifact.draftReadiness.nodes.find(
      (node) => node.nodeId === result.draft.apiCalls[0].id,
    ).planningStatus,
    'ready',
  );
  assert.deepEqual(
    f.calls.map((call) => call.name),
    ['analyze_workflow_draft_edit', 'plan_draft_connection_edit'],
  );
});

test('review approval preserves the finding without falsely approving capability readiness; explicit withdrawal clears it', async () => {
  const f = await conversation('review');
  let state = await f.first();
  assert.equal(state.phase, 'selecting');
  assert.equal(state.draft.gapNodes, undefined);
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'candidate');
  assert.equal(state.candidate.preview.triggerConnected, false);
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.draft.approvals, []);
  assert.equal(state.draft.gapNodes.length, 1);
  state = await f.graph.invoke(
    {
      input: {
        request: {
          id: 'withdraw-1',
          expectedRevision: state.draft.revision,
          text: '이력 조회 요구는 취소해줘.',
        },
      },
    },
    f.config,
  );
  state = await f.resume(state, { action: 'approve' });
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'no-workflow');
  assert.equal(state.artifact, undefined);
  assert.deepEqual(state.draft.gapNodes, []);
  assert.equal(state.outcome.kind, 'no-workflow');
  assert.equal(f.calls.length, 2);
});

test('optional HITL suggestions see the unresolved role at selection and candidate review, not the inventory receipt', async () => {
  const f = await conversation('review', false, true);
  let state = await f.first();
  state = await f.resume(state, { action: 'approve' });
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.artifact.triggerConnected, false);
  const suggestionCalls = f.calls.filter(
    (call) => call.name === 'suggest_workflow_review_follow_ups',
  );
  assert.equal(suggestionCalls.length, 2);
  for (const call of suggestionCalls) {
    const data = call.payload.boundary.data;
    const gap = data.staged.gapNodes[0];
    assert.equal(gap.finding.kind, 'missing-api');
    assert.equal(gap.inventoryCurrent, true);
    assert.equal(Object.hasOwn(gap, 'inventory'), false);
    assert.equal(Object.hasOwn(gap, 'sources'), false);
    assert.equal(Object.hasOwn(gap, 'fingerprint'), false);
  }
  assert.deepEqual(state.reviewSuggestions.suggestions, []);
  assert.equal(state.draft.gapNodes.length, 1);
});
