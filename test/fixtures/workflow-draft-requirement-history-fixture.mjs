import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraft } from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';

export function requirementHistoryModel() {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          assert.equal(options.name, 'analyze_workflow_draft_edit');
          const kind =
            calls.length === 1 ? 'revise-requirement' : 'remove-requirement';
          return {
            decisions: [
              {
                kind,
                requirementId: 'purpose',
                instruction:
                  kind === 'revise-requirement'
                    ? 'Change only the stated purpose and defer its review.'
                    : 'Withdraw only the purpose requirement.',
                sources: payload.requestMessageIds.map((messageId) => ({
                  kind: 'message',
                  messageId,
                })),
              },
            ],
          };
        },
      };
    },
  };
}

export function requirementHistoryConversation(model) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  const context = {
    operations: [],
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.PassThrough],
    }).planningCapabilities,
    messages: [
      {
        id: 'initial-purpose',
        text: 'The purpose is to demonstrate an unchanged pass-through workflow.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'requirement-history-conversation',
      apiCalls: [],
      nativeNodes: [
        {
          id: 'unchanged-pass',
          capability: N8nNativeFeature.PassThrough,
          parameters: {},
        },
      ],
      edges: [],
      requirements: [
        {
          id: 'purpose',
          text: 'Demonstrate an unchanged pass-through workflow.',
          state: 'confirmed',
          scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
          sourceMessageIds: ['initial-purpose'],
        },
      ],
    },
  });
  const graph = createWorkflowDraftConversationGraph({
    model,
    context,
    checkpointer: new MemorySaver(),
    name: 'Explicit requirement lifecycle',
    reviewPolicy: 'review',
    includeExplanations: false,
  });
  return {
    context,
    draft,
    graph,
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 120 },
  };
}

export async function runRequirementHistoryConversation(model, onCheckpoint) {
  if (onCheckpoint !== undefined && typeof onCheckpoint !== 'function')
    throw new Error('onCheckpoint must be a function when supplied');
  const fixture = requirementHistoryConversation(model);
  const checkpoints = [];
  const save = (label, state) => {
    const entry = { label, state: globalThis.structuredClone(state) };
    checkpoints.push(entry);
    onCheckpoint?.(entry);
    return state;
  };
  const resume = (state, response) =>
    fixture.graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      fixture.config,
    );
  let state = save(
    'selection-revise',
    await fixture.graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: {
            id: 'revise-purpose',
            text: 'Revise only the existing purpose requirement. Its statement and review state need a typed human answer. Do not change any nodes, parameters or connections.',
            expectedRevision: fixture.draft.revision,
          },
        },
      },
      fixture.config,
    ),
  );
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  state = save(
    'requirement-question',
    await resume(state, { action: 'approve' }),
  );
  const question = state.questions.find(
    (entry) => entry.kind === 'requirement',
  );
  assert.equal(question.requirementEdit.requirement.id, 'purpose');
  const planId = state.plan.id;
  state = save(
    'candidate-deferred',
    await resume(state, {
      action: 'answer-requirement',
      messageId: 'typed-purpose-answer',
      stepId: question.stepId,
      requirement: {
        text: 'Review the purpose later; keep the existing workflow unchanged.',
        state: 'deferred',
        scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
      },
    }),
  );
  assert.equal(state.plan.id, planId);
  assert.equal(
    state.candidate.result.draft.requirementHistory.at(-1).kind,
    'revised',
  );
  assert.equal(state.candidate.preview.triggerConnected, false);
  state = save('adopted-deferred', await resume(state, { action: 'approve' }));
  assert.equal(state.phase, 'complete');
  assert.equal(state.artifact.triggerConnected, false);
  const deferred = state;
  state = save(
    'selection-withdraw',
    await fixture.graph.invoke(
      {
        input: {
          request: {
            id: 'withdraw-purpose',
            text: 'Withdraw the existing purpose requirement only. Remove that requirement, not any workflow node. Preserve every node, parameter and connection.',
            expectedRevision: state.draft.revision,
          },
        },
      },
      fixture.config,
    ),
  );
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  state = save(
    'candidate-withdrawn',
    await resume(state, { action: 'approve' }),
  );
  assert.deepEqual(state.candidate.result.draft.requirements, []);
  assert.equal(state.candidate.preview.triggerConnected, true);
  state = save('adopted-withdrawn', await resume(state, { action: 'approve' }));
  assert.equal(state.phase, 'complete');
  assert.equal(state.artifact.triggerConnected, true);
  assert.deepEqual(state.draft.nativeNodes, fixture.draft.nativeNodes);
  assert.deepEqual(state.draft.edges, fixture.draft.edges);
  assert.deepEqual(
    state.draft.requirementHistory.map((entry) => entry.kind),
    ['created', 'revised', 'removed'],
  );
  assert.deepEqual(
    state.draft.requirementHistory[1].evidence.map((entry) => entry.messageId),
    ['revise-purpose', 'typed-purpose-answer'],
  );
  assert.deepEqual(
    state.draft.requirementHistory[2].evidence.map((entry) => entry.messageId),
    ['withdraw-purpose'],
  );
  return { ...fixture, deferred, final: state, checkpoints };
}
