import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowReviewFeedbackSchema,
  createWorkflowReviewFeedback,
  isWorkflowReviewFeedback,
} from '@openapi-flow/core';

function boundary(kind = 'selection-review', questions = []) {
  return {
    key: 'original-review-key',
    kind,
    revision: 7,
    questions,
    data: { proposedApi: 'not-an-approved-operation' },
  };
}

function reply(target, scope = { kind: 'review' }) {
  return {
    kind: 'review-feedback',
    boundaryKey: target.key,
    expectedRevision: target.revision,
    scope,
    text: '  캐시 대신 원본을 조회해줘. "0007"은 그대로 둬.\n조건도 다시 검토해줘.  ',
  };
}

test('feedback retains exact human prose and review/question provenance without applying a choice or approval', () => {
  for (const kind of [
    'requirements-clarification',
    'selection-review',
    'planning-questions',
    'candidate-review',
  ]) {
    const target = boundary(kind, [
      { id: 'original-question', message: '어떤 조회인가요?' },
    ]);
    const feedback = reply(target, {
      kind: 'question',
      questionId: 'original-question',
    });
    const before = globalThis.structuredClone({ target, feedback });
    const receipt = createWorkflowReviewFeedback({
      boundary: target,
      feedback,
      messageId: 'human-1',
    });
    assert.deepEqual(receipt.message, { id: 'human-1', text: feedback.text });
    assert.deepEqual(receipt.question, target.questions[0]);
    assert.equal(receipt.boundaryKind, kind);
    assert.equal(receipt.expectedRevision, 7);
    assert.deepEqual(receipt.scope, feedback.scope);
    for (const key of ['approve', 'choiceId', 'operation', 'draft', 'value'])
      assert.equal(Object.hasOwn(receipt, key), false);
    assert.deepEqual({ target, feedback }, before);
    receipt.question.message = 'changed';
    assert.deepEqual({ target, feedback }, before);
  }
});

test('feedback cannot impersonate a choice, typed value, approval, stale review, unknown question or mixed action', () => {
  const target = boundary('candidate-review', [
    { id: 'q1', message: '원래 질문' },
  ]);
  const schema = createWorkflowReviewFeedbackSchema(target);
  const valid = reply(target);
  for (const invalid of [
    { ...valid, boundaryKey: 'old' },
    { ...valid, expectedRevision: 6 },
    { ...valid, text: ' \n\t ' },
    { ...valid, approve: true },
    { ...valid, value: '0007' },
    { ...valid, choiceId: 'choice-1' },
    { ...valid, scope: { kind: 'question', questionId: 'unoffered' } },
    { ...valid, scope: { kind: 'review', questionId: 'q1' } },
    { ...valid, scope: undefined },
  ])
    assert.equal(schema.safeParse(invalid).success, false);
  assert.equal(isWorkflowReviewFeedback({ approve: true }), false);
  assert.equal(
    isWorkflowReviewFeedback([{ questionId: 'q1', choiceId: 'c1' }]),
    false,
  );
  assert.equal(schema.safeParse({ ...valid, text: '승인' }).success, true);
  assert.equal(
    createWorkflowReviewFeedback({
      boundary: target,
      feedback: { ...valid, text: '승인' },
      messageId: 'human-2',
    }).message.text,
    '승인',
  );
});

test('a review without source questions accepts only explicit review scope and derives a valid wire schema', () => {
  const target = boundary();
  const schema = createWorkflowReviewFeedbackSchema(target);
  assert.equal(schema.safeParse(reply(target)).success, true);
  assert.equal(
    schema.safeParse(
      reply(target, { kind: 'question', questionId: 'invented' }),
    ).success,
    false,
  );
  assert.throws(() =>
    createWorkflowReviewFeedbackSchema({
      ...target,
      questions: [
        { id: 'same', message: 'one' },
        { id: 'same', message: 'two' },
      ],
    }),
  );
});
