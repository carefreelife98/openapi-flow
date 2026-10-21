import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
  validateWorkflowClarificationAnswerRevision,
  describeWorkflowPlanningContext,
} from '@openapi-flow/core';
import {
  workflowClarificationFixture,
  clarificationQuestions,
} from './fixtures/workflow-clarification-fixture.mjs';
import { draftClarificationFixture } from './fixtures/workflow-draft-clarification-fixture.mjs';

async function fixture() {
  const input = await workflowClarificationFixture();
  input.proposal.categories = clarificationQuestions(
    input.proposal.statements[0].sources[0],
  );
  return { ...input, round: createWorkflowClarificationRound(input) };
}

for (const kind of ['single-choice', 'multiple-choice'])
  test(`explicit custom text answers ${kind} questions without mapping to an offered choice`, async () => {
    const { context, round } = await fixture();
    const question = round.categories[0].questions.find(
      (question) => question.answer.kind === kind,
    );
    assert.ok(question);
    const before = globalThis.structuredClone({
      context: describeWorkflowPlanningContext(context),
      round,
    });
    const text =
      '  보기와 다른 조건으로 조회해줘. 문자열 "0007"은 그대로 둬.\n추가 조건은 직접 설명할게.  ';
    const reply = { kind: 'text', questionId: question.id, text };
    const resolution = resolveWorkflowClarificationReplies({
      context,
      round,
      replies: [reply],
    });
    assert.deepEqual(resolution.replies, [reply]);
    assert.ok(!resolution.pendingQuestionIds.includes(question.id));
    assert.ok(!resolution.deferredQuestionIds.includes(question.id));
    assert.equal(resolution.readyForPlanning, false);
    assert.equal(
      resolution.facts.at(-1).text,
      `${question.message}\n답변: ${text}`,
    );
    assert.deepEqual(resolution.facts.at(-1).sources, [
      {
        kind: 'clarification-answer',
        roundId: round.id,
        questionId: question.id,
      },
    ]);
    const prepared = prepareWorkflowDraftClarification({
      context,
      round,
      resolution,
    });
    assert.deepEqual(JSON.parse(prepared.answerMessages[0].text).reply, reply);
    assert.deepEqual(prepared.confirmedAnswerMessageIds, [
      prepared.answerMessages[0].id,
    ]);
    assert.deepEqual(
      { context: describeWorkflowPlanningContext(context), round },
      before,
    );
    const sameLabel = resolveWorkflowClarificationReplies({
      context,
      round,
      replies: [{ ...reply, text: question.answer.choices[0].label }],
    });
    assert.equal(sameLabel.replies[0].kind, 'text');
    assert.equal(Object.hasOwn(sameLabel.replies[0], 'choiceId'), false);
    assert.equal(Object.hasOwn(sameLabel.replies[0], 'choiceIds'), false);
  });

test('partial custom answers preserve other confirmed choices and require an explicit revision to overwrite', async () => {
  const { context, round } = await fixture();
  const [single, multiple, text] = round.categories[0].questions;
  const previous = resolveWorkflowClarificationReplies({
    context,
    round,
    replies: [
      {
        kind: 'single-choice',
        questionId: single.id,
        choiceId: single.answer.choices[0].id,
      },
      { kind: 'defer', questionId: multiple.id },
    ],
  });
  const before = globalThis.structuredClone(previous);
  const reply = {
    kind: 'text',
    questionId: multiple.id,
    text: '  제공한 보기 외의 결과도 확인해줘.  ',
  };
  const result = resolveWorkflowClarificationReplies({
    context,
    round,
    previous,
    replies: [reply],
  });
  assert.deepEqual(previous, before);
  assert.deepEqual(result.replies, [previous.replies[0], reply]);
  assert.deepEqual(result.pendingQuestionIds, [text.id]);
  assert.deepEqual(result.deferredQuestionIds, []);
  assert.throws(
    () =>
      resolveWorkflowClarificationReplies({
        context,
        round,
        previous: result,
        replies: [reply],
      }),
    /already answered/,
  );
  const complete = resolveWorkflowClarificationReplies({
    context,
    round,
    previous: result,
    replies: [{ kind: 'text', questionId: text.id, text: '추가 검사는 없어.' }],
  });
  assert.equal(complete.readyForPlanning, true);
});

test('custom answers still reject blank text, stale/unknown questions, mixed controls and duplicate targets', async () => {
  const { context, round } = await fixture();
  const [single, multiple] = round.categories[0].questions;
  const reply = {
    kind: 'text',
    questionId: single.id,
    text: '직접 작성한 답변',
  };
  for (const replies of [
    [{ ...reply, text: '' }],
    [{ ...reply, text: ' \n\t ' }],
    [{ ...reply, questionId: 'not-this-round' }],
    [{ ...reply, choiceId: single.answer.choices[0].id }],
    [
      reply,
      {
        kind: 'single-choice',
        questionId: single.id,
        choiceId: single.answer.choices[0].id,
      },
    ],
    [
      {
        kind: 'single-choice',
        questionId: multiple.id,
        choiceId: multiple.answer.choices[0].id,
      },
    ],
    [
      {
        kind: 'multiple-choice',
        questionId: single.id,
        choiceIds: [single.answer.choices[0].id],
      },
    ],
  ])
    assert.throws(() =>
      resolveWorkflowClarificationReplies({ context, round, replies }),
    );
  assert.throws(
    () =>
      resolveWorkflowClarificationReplies({
        context: {
          ...context,
          messages: [...context.messages, { id: 'later', text: '새 요청' }],
        },
        round,
        replies: [reply],
      }),
    /stale/,
  );
});

test('explicit revisions can replace a selected choice with custom text and return to a choice without mutating history', async () => {
  const fixture = await draftClarificationFixture({ reply: 'confirmed' });
  const original = globalThis.structuredClone(fixture.context);
  const reply = {
    kind: 'text',
    questionId: fixture.question.id,
    text: '  주소가 아니라 다른 후속 조회를 원해. "0007"은 그대로 써.  ',
  };
  const result = reviseWorkflowClarificationAnswers({
    context: fixture.context,
    fingerprint: describeWorkflowClarificationAnswerRevision(fixture.context)
      .fingerprint,
    messageId: 'custom-answer-revision',
    changes: [{ kind: 'replace-answer', reply }],
  });
  assert.deepEqual(fixture.context, original);
  assert.deepEqual(result.revision.after.resolution.replies, [reply]);
  assert.deepEqual(result.revision.before, original.clarification);
  assert.deepEqual(
    result.revision.supersededAnswerMessageIds,
    original.clarification.confirmedAnswerMessageIds,
  );
  validateWorkflowClarificationAnswerRevision({
    context: fixture.context,
    revision: result.revision,
  });
  const context = {
    ...fixture.context,
    messages: result.activeMessages,
    clarification: result.revision.after,
  };
  const next = reviseWorkflowClarificationAnswers({
    context,
    fingerprint:
      describeWorkflowClarificationAnswerRevision(context).fingerprint,
    messageId: 'offered-answer-revision',
    changes: [
      {
        kind: 'replace-answer',
        reply: original.clarification.resolution.replies[0],
      },
    ],
  });
  assert.deepEqual(
    next.revision.after.resolution.replies,
    original.clarification.resolution.replies,
  );
  assert.equal(next.revision.before.resolution.replies[0].text, reply.text);
});
