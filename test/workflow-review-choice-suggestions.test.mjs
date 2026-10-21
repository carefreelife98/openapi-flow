import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '@openapi-flow/core';
import {
  suggestWorkflowReviewFollowUps,
  WorkflowReviewSuggestionPlanningError,
} from '@openapi-flow/langchain';
import {
  reviewSuggestionsFixture,
  reviewSuggestionModel,
} from './fixtures/workflow-review-suggestions-fixture.mjs';

async function fixture(kind = 'single-choice', options) {
  const input = await reviewSuggestionsFixture(options);
  input.boundary.questions[0].answer = {
    kind,
    choices: [
      { id: 'account-choice', label: 'accountId 그대로 사용' },
      { id: 'email-choice', label: 'email 그대로 사용' },
    ],
  };
  return input;
}

test('choice-backed follow-ups derive text and typed replies from original labels, not model prose', async () => {
  const input = await fixture();
  const before = globalThis.structuredClone(input);
  assert.equal(typeof core.createWorkflowReviewChoiceSuggestion, 'function');
  const suggestion = core.createWorkflowReviewChoiceSuggestion({
    ...input,
    proposal: {
      kind: 'answer-choice',
      questionId: 'owner-question',
      choiceIds: ['account-choice'],
      reason: '원래 질문에 제공된 회원 식별자 선택입니다.',
    },
  });
  assert.equal(
    suggestion.text,
    `${input.boundary.questions[0].message}\n선택: accountId 그대로 사용`,
  );
  assert.ok(!suggestion.text.includes('owner-question'));
  assert.ok(!suggestion.text.includes('account-choice'));
  assert.deepEqual(suggestion.choiceReply, {
    kind: 'single-choice',
    questionId: 'owner-question',
    choiceId: 'account-choice',
  });
  const review = core.createWorkflowReviewSuggestions({
    ...input,
    proposal: { suggestions: [suggestion] },
  });
  core.validateWorkflowReviewSuggestions({ ...input, review });
  const adoption = core.adoptWorkflowReviewSuggestion({
    ...input,
    review,
    suggestionId: review.suggestions[0].id,
    messageId: 'explicit-human-action',
  });
  assert.deepEqual(
    JSON.parse(adoption.message.text).choiceReply,
    suggestion.choiceReply,
  );
  assert.deepEqual(input, before);
});

test('choice proposals reject absent contracts, unknown or repeated choices, wrong cardinality and model-owned display fields', async () => {
  const input = await fixture();
  const proposal = {
    kind: 'answer-choice',
    questionId: 'owner-question',
    choiceIds: ['account-choice'],
    reason: '실제 선택지입니다.',
  };
  for (const changed of [
    { ...proposal, questionId: 'invented' },
    { ...proposal, choiceIds: [] },
    { ...proposal, choiceIds: ['invented'] },
    { ...proposal, choiceIds: ['account-choice', 'email-choice'] },
    { ...proposal, choiceIds: ['account-choice', 'account-choice'] },
    { ...proposal, text: 'model-owned text' },
    { ...proposal, sources: [] },
  ])
    assert.throws(() =>
      core.createWorkflowReviewChoiceSuggestion({
        ...input,
        proposal: changed,
      }),
    );
  const missing = await reviewSuggestionsFixture();
  assert.throws(() =>
    core.createWorkflowReviewChoiceSuggestion({ ...missing, proposal }),
  );
  assert.throws(
    () => core.createWorkflowReviewSuggestions(input),
    /typed choiceReply/,
  );
});

test('multiple choice order and original labels remain unchanged, including ID-looking user labels', async () => {
  const input = await fixture('multiple-choice', {
    includeExplanations: false,
  });
  input.boundary.questions[0].answer.choices[0].label =
    '  candidate-1 / 0007  ';
  const suggestion = core.createWorkflowReviewChoiceSuggestion({
    ...input,
    proposal: {
      kind: 'answer-choice',
      questionId: 'owner-question',
      choiceIds: ['email-choice', 'account-choice'],
    },
  });
  assert.deepEqual(suggestion.choiceReply, {
    kind: 'multiple-choice',
    questionId: 'owner-question',
    choiceIds: ['email-choice', 'account-choice'],
  });
  assert.equal(
    suggestion.text,
    `${input.boundary.questions[0].message}\n선택: email 그대로 사용,   candidate-1 / 0007  `,
  );
  assert.equal(Object.hasOwn(suggestion, 'reason'), false);
  assert.throws(() =>
    core.createWorkflowReviewChoiceSuggestion({
      ...input,
      proposal: {
        kind: 'answer-choice',
        questionId: 'owner-question',
        choiceIds: ['account-choice'],
        reason: 'not enabled',
      },
    }),
  );
});

test('stored typed suggestions reject changed labels, derived text, reply or question identities without repair', async () => {
  const input = await fixture();
  const suggestion = core.createWorkflowReviewChoiceSuggestion({
    ...input,
    proposal: {
      kind: 'answer-choice',
      questionId: 'owner-question',
      choiceIds: ['account-choice'],
      reason: '현재 선택지입니다.',
    },
  });
  const review = core.createWorkflowReviewSuggestions({
    ...input,
    proposal: { suggestions: [suggestion] },
  });
  for (const changed of [
    { ...suggestion, text: '다른 의미의 문장' },
    { ...suggestion, questionIds: ['other-question'] },
    {
      ...suggestion,
      choiceReply: { ...suggestion.choiceReply, choiceId: 'email-choice' },
    },
  ])
    assert.throws(() =>
      core.createWorkflowReviewSuggestions({
        ...input,
        proposal: { suggestions: [changed] },
      }),
    );
  const changedInput = globalThis.structuredClone(input);
  changedInput.boundary.questions[0].answer.choices[0].label =
    'changed contract';
  assert.throws(() =>
    core.validateWorkflowReviewSuggestions({ ...changedInput, review }),
  );
});

test('mixed question contracts preserve free-text choices and empty proposals without guessing a typed contract or repairing a bypass', async () => {
  const input = await fixture('single-choice', {
    includeExplanations: false,
    includeExtensions: false,
  });
  input.boundary.questions.push({
    id: 'free-text-question',
    message: '추가 검토할 내용을 직접 입력해 주세요.',
  });
  const before = globalThis.structuredClone(input);
  const typed = {
    kind: 'answer-choice',
    questionId: 'owner-question',
    choiceIds: ['email-choice'],
  };
  const freeText = {
    kind: 'answer-question',
    questionIds: ['free-text-question'],
    text: '추가 사항은 직접 검토할게요.',
    sources: [{ kind: 'review-question', questionId: 'free-text-question' }],
  };
  const model = reviewSuggestionModel({ suggestions: [typed, freeText] });
  const result = await suggestWorkflowReviewFollowUps({ ...input, model });
  assert.equal(model.calls.length, 1);
  assert.deepEqual(result.suggestions[0].choiceReply, {
    kind: 'single-choice',
    questionId: 'owner-question',
    choiceId: 'email-choice',
  });
  assert.equal(result.suggestions[1].text, freeText.text);
  assert.equal(Object.hasOwn(result.suggestions[1], 'choiceReply'), false);
  const empty = reviewSuggestionModel({ suggestions: [] });
  assert.deepEqual(
    (await suggestWorkflowReviewFollowUps({ ...input, model: empty }))
      .suggestions,
    [],
  );
  assert.equal(empty.calls.length, 1);
  for (const output of [
    {
      suggestions: [{ ...freeText, questionIds: ['owner-question'] }],
    },
    {
      suggestions: [{ ...typed, questionId: 'free-text-question' }],
    },
  ]) {
    const invalid = reviewSuggestionModel(output);
    await assert.rejects(
      suggestWorkflowReviewFollowUps({ ...input, model: invalid }),
      (error) => {
        assert.ok(error instanceof WorkflowReviewSuggestionPlanningError);
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, output);
        return true;
      },
    );
    assert.equal(invalid.calls.length, 1);
  }
  assert.deepEqual(input, before);
});
