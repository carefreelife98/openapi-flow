import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import { applyDraftChangeSet } from '@openapi-flow/core';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { requirementHistoryConversation } from './workflow-draft-requirement-history-fixture.mjs';

export function requirementRestorationModel() {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          assert.equal(options.name, 'analyze_workflow_draft_edit');
          return {
            decisions: [
              {
                kind: 'restore-requirement',
                requirementId: 'purpose',
                instruction:
                  '명시적으로 철회한 목적 요구사항만 복원하고 새 문장·상태·범위를 확인합니다. 노드나 연결은 바꾸지 않습니다.',
                sources: payload.requestMessageIds.map((messageId) => ({
                  kind: 'message',
                  messageId,
                })),
                explanation: {
                  reason:
                    '현재 요청이 철회한 목적 요구사항의 복원을 명시했습니다.',
                  evidence: payload.requestMessageIds.map((messageId) => ({
                    kind: 'message',
                    messageId,
                  })),
                },
              },
            ],
          };
        },
      };
    },
  };
}

export function requirementRestorationConversation(
  model,
  reviewPolicy = 'review',
) {
  const base = requirementHistoryConversation(model);
  const context = {
    ...base.context,
    messages: [
      ...base.context.messages,
      {
        id: 'prior-withdrawal',
        text: 'Withdraw only the purpose requirement. Keep nodes and connections.',
      },
    ],
  };
  const draft = applyDraftChangeSet({
    draft: base.draft,
    context,
    changeSet: {
      baseRevision: base.draft.revision,
      changes: [
        {
          kind: 'remove-requirement',
          requirementId: 'purpose',
          sourceMessageIds: ['prior-withdrawal'],
        },
      ],
    },
  }).draft;
  const graph = createWorkflowDraftConversationGraph({
    model,
    context,
    checkpointer: new MemorySaver(),
    reviewPolicy,
    includeExplanations: true,
    name: 'Requirement restoration',
  });
  return {
    context,
    original: base.draft,
    draft,
    graph,
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 120 },
  };
}

export async function runRequirementRestorationConversation(
  model,
  onCheckpoint,
) {
  if (onCheckpoint !== undefined && typeof onCheckpoint !== 'function')
    throw new Error('onCheckpoint must be a function when supplied');
  const fixture = requirementRestorationConversation(model);
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
    'selection-restore',
    await fixture.graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: {
            id: 'restore-purpose',
            text: '철회한 purpose 요구사항만 다시 복원해줘. 복원할 문장, 상태, 범위는 직접 확인할게. API·native 노드·파라미터·연결은 변경하지 마.',
            expectedRevision: fixture.draft.revision,
          },
        },
      },
      fixture.config,
    ),
  );
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert.deepEqual(
    state.plan.steps.map((step) => step.decision.kind),
    ['restore-requirement'],
  );
  state = save(
    'restoration-question',
    await resume(state, { action: 'approve' }),
  );
  const question = state.questions.find(
    (entry) => entry.kind === 'requirement',
  );
  assert.equal(question.requirementEdit.action, 'restore');
  assert.equal(question.requirementEdit.requirement.id, 'purpose');
  const beforeAnswer = globalThis.structuredClone(state.draft);
  state = save(
    'invalid-scope',
    await resume(state, {
      action: 'answer-requirement',
      messageId: 'invalid-restoration',
      stepId: question.stepId,
      requirement: {
        text: 'Invalid scope must not apply.',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: ['not-a-node'] },
      },
    }),
  );
  assert.ok(state.issues.length);
  assert.deepEqual(state.draft, beforeAnswer);
  state = save(
    'restoration-candidate',
    await resume(state, {
      action: 'answer-requirement',
      messageId: 'restoration-answer',
      stepId: question.stepId,
      requirement: {
        text: '사용자가 새로 확인한 목적입니다. 기존 워크플로우를 그대로 유지합니다.',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
      },
    }),
  );
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  assert.deepEqual(
    state.candidate.result.draft.requirementHistory.map((entry) => entry.kind),
    ['created', 'removed', 'restored'],
  );
  assert.equal(state.candidate.preview.triggerConnected, true);
  state = save(
    'restoration-adopted',
    await resume(state, { action: 'approve' }),
  );
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.draft.nativeNodes, fixture.draft.nativeNodes);
  assert.deepEqual(state.draft.edges, fixture.draft.edges);
  assert.deepEqual(state.draft.requirements[0].sourceMessageIds, [
    'restore-purpose',
    'restoration-answer',
  ]);
  assert.equal(
    state.draft.requirementHistory.at(-1).previousEntryId,
    fixture.draft.requirementHistory.at(-1).id,
  );
  assert.notEqual(
    state.draft.requirements[0].text,
    fixture.original.requirements[0].text,
  );
  return { ...fixture, final: state, checkpoints };
}
