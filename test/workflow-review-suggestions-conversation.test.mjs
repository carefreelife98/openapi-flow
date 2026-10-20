import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  draftClarificationFixture,
  draftClarificationRequest,
  clarificationLimits,
} from './fixtures/workflow-draft-clarification-fixture.mjs';
import {
  reviewSuggestionsConversationModel,
  ownerFollowUp,
} from './fixtures/workflow-review-suggestions-conversation-fixture.mjs';

async function fixture(reviewPolicy = 'review') {
  const base = await draftClarificationFixture();
  const model = reviewSuggestionsConversationModel();
  const dependencies = {
    context: { ...base.originalContext, messages: [] },
    model,
    checkpointer: new MemorySaver(),
    name: 'Follow-up review',
    reviewPolicy,
    includeExplanations: false,
    clarification: { limits: clarificationLimits, includeSuggestions: false },
    reviewSuggestions: { limits: { maxSuggestions: 3 } },
    deployments: [
      ...new Set(
        base.originalContext.operations.map(
          (operation) => operation.key.documentId,
        ),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://private-deployment.example.test',
    })),
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: reviewPolicy },
    recursionLimit: 200,
  };
  const resume = (state, action) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...action },
      }),
      config,
    );
  const start = () =>
    graph.invoke(
      {
        input: {
          initialDraft: base.draft,
          request: {
            id: 'request-1',
            text: draftClarificationRequest,
            expectedRevision: 0,
          },
        },
      },
      config,
    );
  return { ...base, dependencies, graph, config, model, resume, start };
}

test('every actual review boundary has separately checkpointed fresh suggestions; explicit second-choice adoption resumes without promoting other options', async () => {
  const f = await fixture();
  let state = await f.start();
  assert.equal(state.__interrupt__[0].value.kind, 'requirements-clarification');
  const question = state.clarification.round.categories[0].questions[0];
  state = await f.resume(state, {
    action: 'answer-clarification',
    messageId: 'defer',
    replies: [{ kind: 'defer', questionId: question.id }],
  });
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert.equal(state.draft.requirements.length, 0);
  const unadoptedExtension = state.reviewSuggestions.suggestions[0];
  assert.equal(unadoptedExtension.kind, 'extend-workflow');
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.resolutions.length, 1);
  assert.equal(state.__interrupt__[0].value.kind, 'draft-questions');
  state = await f.resume(state, {
    action: 'answer-clarification',
    messageId: 'confirm-address',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  const confirmedIds = state.clarification.confirmedAnswerMessageIds;
  assert.equal(confirmedIds.length, 1);
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.__interrupt__[0].value.kind, 'draft-questions');
  const pending = state.__interrupt__[0].value;
  assert.equal(pending.reviewSuggestions.suggestions.length, 2);
  assert.equal(state.draft.apiCalls.length, 0);
  const chosen = pending.reviewSuggestions.suggestions[1];
  assert.equal(chosen.text, ownerFollowUp);
  const calls = f.model.calls.length;
  for (const changed of [
    { reviewId: 'stale-review' },
    { suggestionId: 'unknown' },
    { token: 'stale-token' },
    { messageId: 'request-1' },
  ]) {
    state = await f.resume(state, {
      action: 'adopt-suggestion',
      reviewId: pending.reviewSuggestions.id,
      suggestionId: chosen.id,
      messageId: 'choose-account',
      ...changed,
    });
    assert.ok(state.__interrupt__[0].value.issues.length);
    assert.equal(f.model.calls.length, calls);
    assert.equal(state.suggestionAdoptions.length, 0);
  }
  state = await f.resume(state, {
    action: 'adopt-suggestion',
    reviewId: pending.reviewSuggestions.id,
    suggestionId: chosen.id,
    messageId: 'choose-account',
  });
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert.equal(state.suggestionAdoptions.length, 1);
  assert.equal(
    JSON.parse(state.suggestionAdoptions[0].message.text).adoptedText,
    ownerFollowUp,
  );
  assert.ok(
    confirmedIds.every((id) =>
      state.clarification.round.sourceMessages.some(
        (message) => message.id === id,
      ),
    ),
  );
  assert.ok(
    state.clarificationHistory.some((entry) => entry.resolutions.length === 1),
  );
  assert.deepEqual(state.draft.apiCalls, []);
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  const candidateCalls = f.model.calls.length;
  state = await f.resume(state, {
    action: 'approve',
    token: 'old-candidate-token',
  });
  assert.equal(f.model.calls.length, candidateCalls);
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.draft.apiCalls.length, 2);
  assert.equal(state.draft.edges.length, 1);
  const originalChoiceReview = state.reviewSuggestionHistory.find(
    (review) => review.id === pending.reviewSuggestions.id,
  );
  assert.ok(
    originalChoiceReview.target.questions.some((question) =>
      chosen.questionIds.includes(question.id),
    ),
  );
  assert.equal(originalChoiceReview.target.kind, 'planning-questions');
  assert.equal(state.artifact.revision, state.draft.revision);
  const address = state.draft.apiCalls.find((call) => call.bindings.length);
  assert.equal(address.bindings[0].targetPointer, '/query/owner');
  assert.equal(address.bindings[0].sourcePointer, '/accountId');
  assert.equal(
    state.suggestionAdoptions.some(
      (entry) => entry.suggestionId === unadoptedExtension.id,
    ),
    false,
  );
  const stages = new Set(
    f.model.calls
      .filter(
        (call) => call.options.name === 'suggest_workflow_review_follow_ups',
      )
      .map((call) => call.payload.boundary.kind),
  );
  assert.deepEqual([...stages].sort(), [
    'candidate-review',
    'planning-questions',
    'requirements-clarification',
    'selection-review',
  ]);
  for (const call of f.model.calls.filter(
    (call) => call.options.name === 'suggest_workflow_review_follow_ups',
  )) {
    assert.equal(
      JSON.stringify(call.payload).includes('private-deployment.example.test'),
      false,
    );
    assert.equal(Object.hasOwn(call.payload.boundary, 'key'), false);
    assert.equal(Object.hasOwn(call.payload.boundary, 'revision'), false);
    assert.equal(Object.hasOwn(call.payload.boundary.data, 'plan'), false);
  }
});

test('automatic review still pauses for an unresolved producer choice and never treats suggestions as approval', async () => {
  const f = await fixture('automatic');
  let state = await f.start();
  const question = state.clarification.round.categories[0].questions[0];
  state = await f.resume(state, {
    action: 'answer-clarification',
    messageId: 'explicit-address',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(state.__interrupt__[0].value.kind, 'draft-questions');
  const review = state.reviewSuggestions;
  state = await f.resume(state, {
    action: 'adopt-suggestion',
    reviewId: review.id,
    suggestionId: review.suggestions[1].id,
    messageId: 'explicit-account',
  });
  assert.equal(state.phase, 'complete');
  assert.equal(state.draft.apiCalls.length, 2);
  assert.deepEqual(state.draft.approvals, []);
  assert.equal(
    f.model.calls.some(
      (call) =>
        call.options.name === 'suggest_workflow_review_follow_ups' &&
        call.payload.boundary.kind.endsWith('-review'),
    ),
    false,
  );
});

test('review suggestion settings fail before any model call and cancel leaves all suggestions unadopted', async () => {
  const f = await fixture();
  const count = f.model.calls.length;
  for (const invalid of [
    null,
    {},
    { limits: { maxSuggestions: 0 } },
    { limits: { maxSuggestions: 3 }, includeExtensions: 'yes' },
    { limits: { maxSuggestions: 3 }, autoChoose: true },
  ])
    assert.throws(() =>
      createWorkflowDraftConversationGraph({
        ...f.dependencies,
        reviewSuggestions: invalid,
      }),
    );
  assert.equal(f.model.calls.length, count);
  const state = await f.start();
  const cancelled = await f.resume(state, { action: 'cancel' });
  assert.equal(cancelled.phase, 'cancelled');
  assert.deepEqual(cancelled.suggestionAdoptions, []);
  assert.deepEqual(cancelled.draft, f.draft);
});
