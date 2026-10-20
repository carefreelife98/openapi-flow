import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowReviewSuggestions,
  validateWorkflowReviewSuggestions,
  adoptWorkflowReviewSuggestion,
  describeWorkflowReviewSuggestions,
  readWorkflowReviewSuggestionLimits,
  describeWorkflowDraftClarification,
} from '@openapi-flow/core';
import {
  suggestWorkflowReviewFollowUps,
  WorkflowReviewSuggestionPlanningError,
} from '@openapi-flow/langchain';
import {
  reviewSuggestionsFixture,
  reviewSuggestionModel,
} from './fixtures/workflow-review-suggestions-fixture.mjs';
import { draftClarificationFixture } from './fixtures/workflow-draft-clarification-fixture.mjs';
import { createPassThroughCapability } from '@openapi-flow/n8n';

test('review suggestions retain bounded original evidence and code-owned identities without changing canonical intent', async () => {
  const input = await reviewSuggestionsFixture();
  const before = globalThis.structuredClone(input.fixture.draft);
  const review = createWorkflowReviewSuggestions(input);
  assert.deepEqual(review, createWorkflowReviewSuggestions(input));
  assert.match(review.suggestions[0].id, /^workflow-review:.*:suggestion:1$/);
  assert.equal(
    review.fingerprint,
    describeWorkflowReviewSuggestions(input).fingerprint,
  );
  assert.deepEqual(review.target.questions, input.boundary.questions);
  assert.notEqual(review.target.data, input.boundary.data);
  assert.doesNotThrow(() =>
    validateWorkflowReviewSuggestions({ ...input, review }),
  );
  assert.deepEqual(input.fixture.draft, before);
  assert.deepEqual(
    createWorkflowReviewSuggestions({ ...input, proposal: { suggestions: [] } })
      .suggestions,
    [],
  );
  assert.deepEqual(
    readWorkflowReviewSuggestionLimits({
      OPENAPI_FLOW_REVIEW_MAX_SUGGESTIONS: '3',
    }),
    { maxSuggestions: 3 },
  );
  for (const value of [undefined, '', '0', '-1', '2.5', ' 3', 'many'])
    assert.throws(
      () =>
        readWorkflowReviewSuggestionLimits({
          OPENAPI_FLOW_REVIEW_MAX_SUGGESTIONS: value,
        }),
      /OPENAPI_FLOW_REVIEW_MAX_SUGGESTIONS/,
    );
});

test('only an explicit current suggestion ID creates a distinguishable human-adoption receipt; it applies no edit', async () => {
  const input = await reviewSuggestionsFixture();
  const review = createWorkflowReviewSuggestions(input);
  const before = globalThis.structuredClone(input.fixture.draft);
  const adoption = adoptWorkflowReviewSuggestion({
    ...input,
    review,
    suggestionId: review.suggestions[0].id,
    messageId: 'chosen-by-human',
  });
  const receipt = JSON.parse(adoption.message.text);
  assert.equal(receipt.kind, 'user-adopted-workflow-review-suggestion');
  assert.equal(receipt.adoptedText, review.suggestions[0].text);
  assert.equal(adoption.suggestion.id, receipt.suggestionId);
  assert.equal(Object.hasOwn(adoption, 'draft'), false);
  assert.deepEqual(input.fixture.draft, before);
  assert.throws(
    () =>
      adoptWorkflowReviewSuggestion({
        ...input,
        review,
        suggestionId: 'invented',
        messageId: 'new',
      }),
    /unknown suggestion/,
  );
  assert.throws(
    () =>
      adoptWorkflowReviewSuggestion({
        ...input,
        review,
        suggestionId: review.suggestions[0].id,
        messageId: input.context.messages[0].id,
      }),
    /already exists/,
  );
  for (const changed of [
    { ...input, boundary: { ...input.boundary, revision: 1 } },
    { ...input, boundary: { ...input.boundary, data: { changed: true } } },
    {
      ...input,
      context: {
        ...input.context,
        messages: [{ ...input.context.messages[0], text: 'Different intent' }],
      },
    },
    { ...input, limits: { maxSuggestions: 4 } },
  ])
    assert.throws(
      () => validateWorkflowReviewSuggestions({ ...changed, review }),
      /stale|modified/,
    );
  for (const changed of [
    { ...review, id: 'forged' },
    {
      ...review,
      suggestions: [{ ...review.suggestions[0], text: 'Do something else' }],
    },
    { ...review, suggestions: [{ ...review.suggestions[0], id: 'forged' }] },
    { ...review, suggestions: [null] },
  ])
    assert.throws(() =>
      validateWorkflowReviewSuggestions({ ...input, review: changed }),
    );
});

test('question/source budgets and display flags fail explicitly without truncation, quote repair or hidden extensions', async () => {
  const input = await reviewSuggestionsFixture();
  const suggestion = input.proposal.suggestions[0];
  for (const proposal of [
    { suggestions: [{ ...suggestion, questionIds: ['invented'] }] },
    {
      suggestions: [
        {
          ...suggestion,
          sources: [{ kind: 'review-question', questionId: 'invented' }],
        },
      ],
    },
    {
      suggestions: [
        {
          ...suggestion,
          sources: [
            {
              kind: 'message',
              messageId: input.context.messages[0].id,
              quote: 'never said this',
            },
          ],
        },
      ],
    },
    {
      suggestions: [
        {
          ...suggestion,
          sources: [...suggestion.sources, ...suggestion.sources],
        },
      ],
    },
    { suggestions: [suggestion, suggestion] },
    { suggestions: [suggestion], readyForExecution: true },
  ])
    assert.throws(() =>
      createWorkflowReviewSuggestions({ ...input, proposal }),
    );
  assert.throws(() =>
    createWorkflowReviewSuggestions({
      ...input,
      limits: { maxSuggestions: 0 },
    }),
  );
  const disabled = await reviewSuggestionsFixture({
    includeExplanations: false,
    includeExtensions: false,
  });
  assert.doesNotThrow(() => createWorkflowReviewSuggestions(disabled));
  assert.throws(() =>
    createWorkflowReviewSuggestions({ ...disabled, proposal: input.proposal }),
  );
  assert.throws(() =>
    createWorkflowReviewSuggestions({
      ...disabled,
      proposal: {
        suggestions: [
          {
            kind: 'extend-workflow',
            text: '프로필 조회 추가',
            sources: [
              {
                kind: 'oas',
                operation: input.context.operations[1].key,
                pointer: '',
              },
            ],
          },
        ],
      },
    }),
  );
});

test('one model call chooses source references only; errors, transport and mutable-source failures preserve actual outputs', async () => {
  const input = await reviewSuggestionsFixture();
  const message = input.context.messages[0];
  const output = globalThis.structuredClone(input.proposal);
  output.suggestions[0].sources.push(
    { kind: 'message', messageId: message.id },
    { kind: 'oas', candidateId: 'candidate-1' },
  );
  const model = reviewSuggestionModel(output);
  const review = await suggestWorkflowReviewFollowUps({ ...input, model });
  assert.equal(model.calls.length, 1);
  assert.equal(
    model.calls[0].options.name,
    'suggest_workflow_review_follow_ups',
  );
  assert.equal(model.calls[0].messages[0].constructor.name, 'SystemMessage');
  assert.equal(model.calls[0].messages[1].constructor.name, 'HumanMessage');
  assert.equal(review.suggestions[0].sources[1].quote, message.text);
  assert.deepEqual(
    review.suggestions[0].sources[2].operation,
    input.context.operations[0].key,
  );
  for (const key of ['fingerprint', 'revision', 'boundaryKey', 'reviewId'])
    assert.equal(Object.hasOwn(model.calls[0].payload, key), false);
  const invalid = { ...output, revision: 1 };
  await assert.rejects(
    suggestWorkflowReviewFollowUps({
      ...input,
      model: reviewSuggestionModel(invalid),
    }),
    (error) =>
      error instanceof WorkflowReviewSuggestionPlanningError &&
      error.failure.output === invalid &&
      error.failure.stage === 'proposal-schema',
  );
  const transport = new Error('Explicit synthetic network error');
  const failing = reviewSuggestionModel(transport);
  await assert.rejects(
    suggestWorkflowReviewFollowUps({ ...input, model: failing }),
    (error) => error === transport,
  );
  assert.equal(failing.calls.length, 1);
  for (const capabilities of [undefined, [createPassThroughCapability()]]) {
    const optionalInput = {
      context: {
        messages: [
          { id: 'native-only-review', text: '제공한 작업 흐름을 검토해줘.' },
        ],
        ...(capabilities === undefined ? {} : { capabilities }),
      },
      boundary: {
        key: 'optional-material-review',
        kind: 'selection-review',
        revision: 0,
        questions: [],
        data: {},
      },
      limits: { maxSuggestions: 2 },
      options: { includeExplanations: false, includeExtensions: false },
    };
    const nativeOutput = {
      suggestions:
        capabilities === undefined
          ? []
          : [
              {
                kind: 'change-request',
                text: '제공한 native 기능의 설정을 실행 전에 검토해줘.',
                sources: [{ kind: 'native', capability: capabilities[0].name }],
              },
            ],
    };
    const optionalModel = reviewSuggestionModel(nativeOutput);
    const optionalReview = await suggestWorkflowReviewFollowUps({
      ...optionalInput,
      model: optionalModel,
    });
    assert.equal(optionalModel.calls.length, 1);
    assert.deepEqual(optionalModel.calls[0].payload.candidates, []);
    assert.equal(
      optionalReview.suggestions.length,
      nativeOutput.suggestions.length,
    );
    assert.equal(
      JSON.stringify(optionalModel.calls[0].schema).includes('candidateId'),
      false,
    );
  }
  const stale = reviewSuggestionModel(output, () => {
    input.boundary.revision = 1;
  });
  await assert.rejects(
    suggestWorkflowReviewFollowUps({ ...input, model: stale }),
    (error) =>
      error instanceof WorkflowReviewSuggestionPlanningError &&
      error.failure.stage === 'source-validation' &&
      /changed/.test(error.cause.message),
  );
});

test('confirmed clarification answer receipts are explicit and re-derived; deferral cannot become a carried fact', async () => {
  const confirmed = await draftClarificationFixture({ reply: 'answered' });
  const deferred = await draftClarificationFixture({ reply: 'defer' });
  assert.deepEqual(
    confirmed.clarification.confirmedAnswerMessageIds,
    confirmed.clarification.answerMessages.map((message) => message.id),
  );
  assert.deepEqual(deferred.clarification.confirmedAnswerMessageIds, []);
  const forged = globalThis.structuredClone(deferred.clarification);
  forged.confirmedAnswerMessageIds = forged.answerMessages.map(
    (message) => message.id,
  );
  assert.throws(
    () =>
      describeWorkflowDraftClarification({
        ...deferred.context,
        clarification: forged,
      }),
    /differs/,
  );
});
