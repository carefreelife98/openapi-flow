import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from '@langchain/langgraph';
import {
  requirementHistoryModel,
  requirementHistoryConversation,
  runRequirementHistoryConversation,
} from './fixtures/workflow-draft-requirement-history-fixture.mjs';

test('review, typed defer and explicit withdrawal retain exact history with one semantic call per turn and no material regeneration', async () => {
  const model = requirementHistoryModel();
  const result = await runRequirementHistoryConversation(model);
  assert.equal(model.calls.length, 2);
  assert.deepEqual(
    model.calls.map((entry) => entry.options.name),
    ['analyze_workflow_draft_edit', 'analyze_workflow_draft_edit'],
  );
  assert.deepEqual(result.deferred.draft.requirements[0].sourceMessageIds, [
    'revise-purpose',
    'typed-purpose-answer',
  ]);
  assert.equal(result.deferred.artifact.draftReadiness.designReady, false);
  assert.equal(result.final.artifact.draftReadiness.designReady, true);
  assert.equal(
    result.final.draft.requirementHistory[0].evidence[0].quote,
    result.context.messages[0].text,
  );
  assert.equal(result.draft.requirementHistory.length, 1);
  assert.deepEqual(result.final.artifact.inputSlots, []);
});

test('invalid requirement answers keep the original plan and history and never replay the semantic model', async () => {
  const model = requirementHistoryModel();
  const f = requirementHistoryConversation(model);
  let state = await f.graph.invoke(
    {
      input: {
        initialDraft: f.draft,
        request: {
          id: 'request-edit',
          text: 'Revise only purpose.',
          expectedRevision: 0,
        },
      },
    },
    f.config,
  );
  const resume = (response) =>
    f.graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      f.config,
    );
  state = await resume({ action: 'approve' });
  const stepId = state.questions.find(
    (entry) => entry.kind === 'requirement',
  ).stepId;
  const plan = globalThis.structuredClone(state.plan);
  for (const response of [
    {
      messageId: 'unknown-scope',
      stepId,
      requirement: {
        text: 'New',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: ['imagined'] },
      },
    },
    {
      messageId: 'initial-purpose',
      stepId,
      requirement: {
        text: 'New',
        state: 'confirmed',
        scope: { kind: 'workflow' },
      },
    },
    {
      messageId: 'unknown-step',
      stepId: 'imagined',
      requirement: {
        text: 'New',
        state: 'confirmed',
        scope: { kind: 'workflow' },
      },
    },
  ]) {
    state = await resume({ action: 'answer-requirement', ...response });
    assert.ok(state.issues.length);
    assert.deepEqual(state.plan, plan);
    assert.deepEqual(state.draft, f.draft);
    assert.equal(model.calls.length, 1);
  }
});

test('retired evidence remains available for canonical audit validation but is absent from the next model payload', async () => {
  const scripted = requirementHistoryModel();
  const f = requirementHistoryConversation(scripted);
  let state = await f.graph.invoke(
    {
      input: {
        initialDraft: f.draft,
        request: {
          id: 'first-edit',
          text: 'Revise only purpose.',
          expectedRevision: 0,
        },
      },
    },
    f.config,
  );
  const resume = (response) =>
    f.graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      f.config,
    );
  state = await resume({ action: 'approve' });
  const question = state.questions.find(
    (entry) => entry.kind === 'requirement',
  );
  state = await resume({
    action: 'answer-requirement',
    messageId: 'actual-typed-answer',
    stepId: question.stepId,
    requirement: {
      text: 'Explicit current purpose',
      state: 'confirmed',
      scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
    },
  });
  state = await resume({ action: 'approve' });
  const history = globalThis.structuredClone(state.draft.requirementHistory);
  // The host explicitly retires these evidence IDs; Core never guesses from a field name or phrase.
  await f.graph.updateState(f.config, {
    inactiveClarificationMessageIds: ['initial-purpose', 'actual-typed-answer'],
  });
  state = await f.graph.invoke(
    {
      input: {
        request: {
          id: 'second-edit',
          text: 'Withdraw purpose only.',
          expectedRevision: state.draft.revision,
        },
      },
    },
    f.config,
  );
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert.deepEqual(state.draft.requirementHistory, history);
  assert.deepEqual(
    scripted.calls[1].payload.messages.map((entry) => entry.id),
    ['first-edit', 'second-edit'],
  );
  assert.ok(state.messages.some((entry) => entry.id === 'initial-purpose'));
  assert.ok(state.messages.some((entry) => entry.id === 'actual-typed-answer'));
});
