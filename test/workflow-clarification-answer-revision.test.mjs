import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
  describeWorkflowDraftClarification,
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
  validateWorkflowClarificationAnswerRevision,
  validateWorkflowPlanningEvidence,
} from '@openapi-flow/core';
import { draftClarificationFixture } from './fixtures/workflow-draft-clarification-fixture.mjs';

test('explicit answer replacement preserves originals and removes superseded evidence without a model', async () => {
  const fixture = await draftClarificationFixture({ reply: 'confirmed' });
  const original = globalThis.structuredClone(fixture.context.clarification);
  const fingerprint = describeWorkflowClarificationAnswerRevision(
    fixture.context,
  ).fingerprint;
  const result = reviseWorkflowClarificationAnswers({
    context: fixture.context,
    fingerprint,
    messageId: 'change-answer',
    changes: [
      {
        kind: 'replace-answer',
        reply: {
          kind: 'single-choice',
          questionId: fixture.question.id,
          choiceId: fixture.question.answer.choices[1].id,
        },
      },
    ],
  });
  assert.deepEqual(fixture.context.clarification, original);
  assert.deepEqual(result.revision.before, original);
  assert.match(
    result.revision.after.resolution.facts.at(-1).text,
    /원본 조회만/,
  );
  assert.deepEqual(
    result.revision.supersededAnswerMessageIds,
    original.confirmedAnswerMessageIds,
  );
  assert(
    !result.activeMessages.some((message) =>
      original.confirmedAnswerMessageIds.includes(message.id),
    ),
  );
  const context = {
    ...fixture.context,
    messages: result.activeMessages,
    clarification: result.revision.after,
  };
  describeWorkflowDraftClarification(context);
  assert.throws(
    () =>
      validateWorkflowPlanningEvidence({
        context,
        evidence: [
          {
            kind: 'message',
            messageId: original.answerMessages[0].id,
            quote: original.answerMessages[0].text,
          },
        ],
      }),
    /unknown message/,
  );
  validateWorkflowClarificationAnswerRevision({
    context: fixture.context,
    revision: JSON.parse(JSON.stringify(result.revision)),
  });
  for (const mutate of [
    (receipt) => (receipt.before.resolution.facts[0].text = 'tampered'),
    (receipt) => (receipt.after.resolution.facts.at(-1).text = 'tampered'),
    (receipt) => (receipt.supersededAnswerMessageIds = []),
    (receipt) => (receipt.message.text = 'pretend this was raw human prose'),
    (receipt) => (receipt.id = 'forged'),
  ]) {
    const receipt = globalThis.structuredClone(result.revision);
    mutate(receipt);
    assert.throws(
      () =>
        validateWorkflowClarificationAnswerRevision({
          context: fixture.context,
          revision: receipt,
        }),
      /modified lineage/,
    );
  }
  assert.throws(
    () =>
      reviseWorkflowClarificationAnswers({
        context,
        fingerprint,
        messageId: 'stale',
        changes: result.revision.changes,
      }),
    /Stale/,
  );
});

test('reopening removes the confirmed fact; replacement with deferral is distinct and only explicit answers restore readiness', async () => {
  const fixture = await draftClarificationFixture({ reply: 'confirmed' });
  const revise = (context, messageId, changes) =>
    reviseWorkflowClarificationAnswers({
      context,
      messageId,
      changes,
      fingerprint:
        describeWorkflowClarificationAnswerRevision(context).fingerprint,
    });
  const reopened = revise(fixture.context, 'reopen', [
    { kind: 'reopen-question', questionId: fixture.question.id },
  ]);
  assert.deepEqual(reopened.revision.after.resolution.pendingQuestionIds, [
    fixture.question.id,
  ]);
  assert.deepEqual(reopened.revision.after.resolution.deferredQuestionIds, []);
  assert.equal(
    reopened.revision.after.resolution.facts.length,
    fixture.round.statements.length,
  );
  assert.deepEqual(reopened.revision.after.confirmedAnswerMessageIds, []);
  const reopenedContext = {
    ...fixture.context,
    clarification: reopened.revision.after,
    messages: reopened.activeMessages,
  };
  assert.throws(
    () =>
      revise(reopenedContext, 'not-confirmed', [
        { kind: 'reopen-question', questionId: fixture.question.id },
      ]),
    /currently confirmed/,
  );
  const restored = resolveWorkflowClarificationReplies({
    context: fixture.originalContext,
    round: fixture.round,
    previous: reopened.revision.after.resolution,
    replies: fixture.resolution.replies,
  });
  assert.equal(restored.readyForPlanning, true);
  assert.deepEqual(restored.facts, fixture.resolution.facts);
  const deferred = revise(fixture.context, 'defer-answer', [
    {
      kind: 'replace-answer',
      reply: { kind: 'defer', questionId: fixture.question.id },
    },
  ]);
  assert.deepEqual(deferred.revision.after.resolution.deferredQuestionIds, [
    fixture.question.id,
  ]);
  assert.deepEqual(deferred.revision.after.resolution.pendingQuestionIds, []);
  assert.equal(deferred.revision.after.resolution.readyForPlanning, false);
  assert.throws(
    () =>
      resolveWorkflowClarificationReplies({
        context: fixture.originalContext,
        round: fixture.round,
        previous: fixture.resolution,
        replies: fixture.resolution.replies,
      }),
    /already answered/,
  );
});

test('revision rejects stale sources, malformed changes, unknown choices, duplicate targets, reused identities and no-ops atomically', async () => {
  const fixture = await draftClarificationFixture({ reply: 'confirmed' });
  const input = {
    context: fixture.context,
    fingerprint: describeWorkflowClarificationAnswerRevision(fixture.context)
      .fingerprint,
    messageId: 'revision',
    changes: [{ kind: 'reopen-question', questionId: fixture.question.id }],
  };
  const before = globalThis.structuredClone(fixture.context.clarification);
  for (const update of [
    { fingerprint: 'stale' },
    { messageId: ' ' },
    { messageId: fixture.context.messages[0].id },
    { changes: [] },
    { changes: [...input.changes, ...input.changes] },
    { changes: [{ kind: 'reopen-question', questionId: 'unknown' }] },
    {
      changes: [
        { kind: 'replace-answer', reply: fixture.resolution.replies[0] },
      ],
    },
    {
      changes: [
        {
          kind: 'replace-answer',
          reply: {
            kind: 'single-choice',
            questionId: fixture.question.id,
            choiceId: 'unknown',
          },
        },
      ],
    },
    {
      changes: [
        {
          kind: 'replace-answer',
          reply: {
            kind: 'multiple-choice',
            questionId: fixture.question.id,
            choiceIds: [fixture.question.answer.choices[0].id],
          },
        },
      ],
    },
    { changes: [{ ...input.changes[0], extra: 'not allowed' }] },
    {
      context: {
        ...fixture.context,
        messages: fixture.context.messages.map((message, index) =>
          index === 0 ? { ...message, text: 'modified' } : message,
        ),
      },
    },
  ])
    assert.throws(() =>
      reviseWorkflowClarificationAnswers({ ...input, ...update }),
    );
  assert.deepEqual(fixture.context.clarification, before);
});

test('text and multiple-choice revisions use their original question contracts, with no choice ordering or type coercion', () => {
  const context = {
    messages: [
      { id: 'original', text: '운영 지역과 알림 방식을 명확히 정해줘.' },
    ],
  };
  const round = createWorkflowClarificationRound({
    context,
    limits: {
      maxCategories: 1,
      maxQuestionsPerCategory: 2,
      maxChoicesPerQuestion: 3,
      maxQuestionsPerRound: 2,
    },
    options: { includeExplanations: false, includeSuggestions: false },
    proposal: {
      statements: [],
      categories: [
        {
          title: '설정',
          questions: [
            { message: '운영 지역은?', answer: { kind: 'text' } },
            {
              message: '알림 방식은?',
              answer: {
                kind: 'multiple-choice',
                choices: [
                  { label: '메일' },
                  { label: '메신저' },
                  { label: '기록만' },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  const [region, channels] = round.categories[0].questions;
  const resolution = resolveWorkflowClarificationReplies({
    round,
    context,
    replies: [
      { kind: 'text', questionId: region.id, text: 'JP' },
      {
        kind: 'multiple-choice',
        questionId: channels.id,
        choiceIds: [channels.answer.choices[0].id],
      },
    ],
  });
  const clarification = prepareWorkflowDraftClarification({
    context,
    round,
    resolution,
  });
  const original = {
    ...context,
    clarification,
    messages: [...context.messages, ...clarification.answerMessages],
  };
  const input = {
    context: original,
    fingerprint:
      describeWorkflowClarificationAnswerRevision(original).fingerprint,
    messageId: 'explicit-settings',
    changes: [
      {
        kind: 'replace-answer',
        reply: { kind: 'text', questionId: region.id, text: 'KR' },
      },
      {
        kind: 'replace-answer',
        reply: {
          kind: 'multiple-choice',
          questionId: channels.id,
          choiceIds: [
            channels.answer.choices[2].id,
            channels.answer.choices[1].id,
          ],
        },
      },
    ],
  };
  const result = reviseWorkflowClarificationAnswers(input);
  assert.deepEqual(
    result.revision.after.resolution.replies,
    input.changes.map((change) => change.reply),
  );
  assert.equal(result.revision.after.confirmedAnswerMessageIds.length, 2);
  assert.throws(
    () =>
      reviseWorkflowClarificationAnswers({
        ...input,
        changes: [
          {
            kind: 'replace-answer',
            reply: {
              kind: 'multiple-choice',
              questionId: channels.id,
              choiceIds: [
                channels.answer.choices[1].id,
                channels.answer.choices[1].id,
              ],
            },
          },
        ],
      }),
    /distinct/,
  );
});
