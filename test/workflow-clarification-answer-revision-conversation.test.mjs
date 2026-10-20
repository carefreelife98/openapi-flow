import assert from 'node:assert/strict';
import test from 'node:test';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  draftClarificationFixture,
  draftClarificationRequest,
  clarificationLimits,
} from './fixtures/workflow-draft-clarification-fixture.mjs';
import { clarificationAnswerRevisionModel } from './fixtures/workflow-clarification-answer-revision-fixture.mjs';

test('partial question revisions retire a mixed submission envelope but retain the other confirmed answer and its exact receipt', async () => {
  const calls = [];
  const model = {
    calls,
    withStructuredOutput(schema, options) {
      assert.equal(options.name, 'clarify_workflow_requirements');
      return {
        async invoke(messages) {
          calls.push({ schema, options, messages });
          return {
            statements: [],
            categories: [
              {
                title: '실행 선택',
                questions: [
                  { message: '실행 지역은?', answer: { kind: 'text' } },
                  { message: '보고서 언어는?', answer: { kind: 'text' } },
                  { message: '알림 방식은?', answer: { kind: 'text' } },
                ],
              },
            ],
          };
        },
      };
    },
  };
  const fixture = await hostFixture({
    model,
    limits: {
      maxCategories: 1,
      maxQuestionsPerCategory: 3,
      maxChoicesPerQuestion: 2,
      maxQuestionsPerRound: 3,
    },
  });
  let state = await fixture.start();
  const [region, language, pending] =
    state.clarification.round.categories[0].questions;
  state = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'mixed-answer-submission',
    replies: [
      { kind: 'text', questionId: region.id, text: 'JP' },
      { kind: 'text', questionId: language.id, text: 'ko' },
    ],
  });
  const original = state.clarification.answerMessages.map((message) => ({
    message,
    questionId: JSON.parse(message.text).questionId,
  }));
  const unchanged = original.find(
    (item) => item.questionId === language.id,
  ).message;
  const changed = original.find(
    (item) => item.questionId === region.id,
  ).message;
  state = await fixture.resume(state, {
    action: 'revise-clarification',
    messageId: 'change-region-only',
    changes: [
      {
        kind: 'replace-answer',
        reply: { kind: 'text', questionId: region.id, text: 'KR' },
      },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(state.__interrupt__[0].value.kind, 'requirements-clarification');
  assert.deepEqual(state.clarification.resolution.pendingQuestionIds, [
    pending.id,
  ]);
  assert(
    state.inactiveClarificationMessageIds.includes('mixed-answer-submission'),
  );
  assert(state.inactiveClarificationMessageIds.includes(changed.id));
  assert(!state.inactiveClarificationMessageIds.includes(unchanged.id));
  assert.deepEqual(
    state.clarification.answerMessages.find(
      (message) => message.id === unchanged.id,
    ),
    unchanged,
  );
  assert(state.requestMessageIds.includes(unchanged.id));
  assert(
    state.clarification.resolution.facts.some((fact) =>
      fact.text.endsWith('답변: ko'),
    ),
  );
  assert(
    state.clarification.resolution.facts.some((fact) =>
      fact.text.endsWith('답변: KR'),
    ),
  );
  assert(
    !state.clarification.resolution.facts.some((fact) =>
      fact.text.endsWith('답변: JP'),
    ),
  );
  state = await fixture.resume(state, { action: 'cancel' });
  assert.equal(state.phase, 'cancelled');
});

async function hostFixture({
  reviewSuggestions = false,
  model: suppliedModel,
  limits = clarificationLimits,
} = {}) {
  const fixture = await draftClarificationFixture();
  const model =
    suppliedModel === undefined
      ? clarificationAnswerRevisionModel()
      : suppliedModel;
  const graph = createWorkflowDraftConversationGraph({
    model,
    checkpointer: new MemorySaver(),
    context: { ...fixture.originalContext, messages: [] },
    name: 'Explicit answer revision',
    reviewPolicy: 'review',
    includeExplanations: false,
    clarification: { limits, includeSuggestions: false },
    ...(reviewSuggestions
      ? { reviewSuggestions: { limits: { maxSuggestions: 3 } } }
      : {}),
    deployments: [
      ...new Set(
        fixture.context.operations.map((operation) => operation.key.documentId),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://contract.example.test',
    })),
  });
  const config = {
    configurable: { thread_id: 'answer-revision' },
    recursionLimit: 200,
  };
  const resume = (state, response) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      config,
    );
  const start = () =>
    graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: {
            id: 'request-1',
            text: draftClarificationRequest,
            expectedRevision: 0,
          },
        },
      },
      config,
    );
  return { ...fixture, model, graph, config, start, resume };
}

test('explicit replace, reopen and restore preserve history but exclude retired answers from every subsequent model input', async () => {
  const fixture = await hostFixture();
  let state = await fixture.start();
  const question = state.clarification.round.categories[0].questions[0];
  state = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'first-yes',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(
    state.plan.steps.filter((step) => step.decision.kind === 'add-api-call')
      .length,
    2,
  );
  const yesReceipt = state.clarification.confirmedAnswerMessageIds[0];
  const beforeChanges = fixture.model.calls.length;
  state = await fixture.resume(state, {
    action: 'revise-clarification',
    messageId: 'explicit-no',
    changes: [
      {
        kind: 'replace-answer',
        reply: {
          kind: 'single-choice',
          questionId: question.id,
          choiceId: question.answer.choices[1].id,
        },
      },
    ],
  });
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert.equal(
    state.plan.steps.filter((step) => step.decision.kind === 'add-api-call')
      .length,
    1,
  );
  assert.equal(state.clarificationAnswerRevisions.length, 1);
  assert(state.messages.some((message) => message.id === yesReceipt));
  assert(state.inactiveClarificationMessageIds.includes(yesReceipt));
  assert(state.inactiveClarificationMessageIds.includes('first-yes'));
  assert(!state.requestMessageIds.includes(yesReceipt));
  for (const call of fixture.model.calls.slice(beforeChanges)) {
    assert(
      !call.payload.messages.some(
        (message) => message.id === yesReceipt || message.id === 'first-yes',
      ),
    );
  }
  const noReceipt = state.clarification.confirmedAnswerMessageIds[0];
  state = await fixture.resume(state, { action: 'approve' });
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  assert.equal(state.candidate.result.draft.apiCalls.length, 1);
  const priorCalls = fixture.model.calls.length;
  const staleToken = state.__interrupt__[0].value.token;
  state = await fixture.resume(state, {
    action: 'revise-clarification',
    messageId: 'reopen-choice',
    changes: [{ kind: 'reopen-question', questionId: question.id }],
  });
  assert.equal(state.__interrupt__[0].value.kind, 'requirements-clarification');
  assert.equal(fixture.model.calls.length, priorCalls);
  assert.deepEqual(state.clarification.resolution.pendingQuestionIds, [
    question.id,
  ]);
  assert.deepEqual(state.clarification.confirmedAnswerMessageIds, []);
  assert.equal(state.candidate, undefined);
  assert.equal(state.plan, undefined);
  assert(!state.requestMessageIds.includes(noReceipt));
  state = await fixture.resume(state, { action: 'approve', token: staleToken });
  assert(state.issues.length);
  assert.equal(fixture.model.calls.length, priorCalls);
  state = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'restore-yes',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  assert(
    !state.inactiveClarificationMessageIds.includes(yesReceipt),
    'Restoring the identical content-addressed answer must reactivate its original receipt',
  );
  assert(state.inactiveClarificationMessageIds.includes(noReceipt));
  for (const call of fixture.model.calls.slice(priorCalls))
    assert(
      !call.payload.messages.some(
        (message) =>
          message.id === noReceipt ||
          message.id === 'explicit-no' ||
          message.id === 'reopen-choice' ||
          message.id === 'first-yes',
      ),
    );
  assert(state.inactiveClarificationMessageIds.includes('reopen-choice'));
  assert(state.messages.some((message) => message.id === 'reopen-choice'));
  state = await fixture.resume(state, { action: 'approve' });
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  assert.equal(state.candidate.result.draft.apiCalls.length, 2);
  state = await fixture.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.artifact.revision, state.draft.revision);
  assert.equal(state.draft.apiCalls.length, 2);
  assert.equal(state.clarificationAnswerRevisions.length, 2);
  assert(
    state.clarificationHistory.some(
      (item) => item.candidate?.result.draft.apiCalls.length === 1,
    ),
  );
});

test('optional follow-up models receive current evidence only, while full old answer submissions stay in audit history', async () => {
  const fixture = await hostFixture({ reviewSuggestions: true });
  let state = await fixture.start();
  const question = state.clarification.round.categories[0].questions[0];
  state = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'retired-ui-yes',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  const receipt = state.clarification.confirmedAnswerMessageIds[0];
  const count = fixture.model.calls.length;
  state = await fixture.resume(state, {
    action: 'revise-clarification',
    messageId: 'active-ui-no',
    changes: [
      {
        kind: 'replace-answer',
        reply: {
          kind: 'single-choice',
          questionId: question.id,
          choiceId: question.answer.choices[1].id,
        },
      },
    ],
  });
  const reviewCalls = fixture.model.calls
    .slice(count)
    .filter(
      (call) => call.options.name === 'suggest_workflow_review_follow_ups',
    );
  assert.equal(reviewCalls.length, 1);
  for (const call of reviewCalls) {
    assert(
      !call.payload.messages.some(
        (message) => message.id === receipt || message.id === 'retired-ui-yes',
      ),
    );
    assert(
      call.payload.messages.some((message) => message.id === 'active-ui-no'),
    );
  }
  assert(state.messages.some((message) => message.id === 'retired-ui-yes'));
  assert.equal(
    state.clarificationAnswerRevisions[0].before.resolution.replies[0].choiceId,
    question.answer.choices[0].id,
  );
  const beforeReanalysis = fixture.model.calls.length;
  state = await fixture.resume(state, {
    action: 'revise',
    message: { id: 'subsequent-request', text: '현재 요청을 다시 검토해줘.' },
  });
  const clarificationCall = fixture.model.calls
    .slice(beforeReanalysis)
    .find((call) => call.options.name === 'clarify_workflow_requirements');
  assert(clarificationCall);
  for (const message of [
    ...clarificationCall.payload.messages,
    ...clarificationCall.payload.backgroundMessages,
  ])
    assert(message.id !== receipt && message.id !== 'retired-ui-yes');
  assert(state.messages.some((message) => message.id === receipt));
  const done = await fixture.resume(state, { action: 'cancel' });
  assert.equal(done.phase, 'cancelled');
});

test('invalid or stale explicit answer changes never mutate the original plan or replay the model', async () => {
  const fixture = await hostFixture();
  let state = await fixture.start();
  const question = state.clarification.round.categories[0].questions[0];
  state = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'yes',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  const plan = globalThis.structuredClone(state.plan),
    calls = fixture.model.calls.length;
  for (const update of [
    {
      token: 'stale',
      changes: [{ kind: 'reopen-question', questionId: question.id }],
    },
    {
      messageId: 'yes',
      changes: [{ kind: 'reopen-question', questionId: question.id }],
    },
    { changes: [{ kind: 'reopen-question', questionId: 'unknown' }] },
    {
      changes: [
        {
          kind: 'replace-answer',
          reply: {
            kind: 'single-choice',
            questionId: question.id,
            choiceId: question.answer.choices[0].id,
          },
        },
      ],
    },
    {
      changes: [
        {
          kind: 'replace-answer',
          reply: {
            kind: 'single-choice',
            questionId: question.id,
            choiceId: 'unknown',
          },
        },
      ],
    },
    {
      changes: [
        { kind: 'reopen-question', questionId: question.id },
        { kind: 'reopen-question', questionId: question.id },
      ],
    },
  ]) {
    state = await fixture.resume(state, {
      action: 'revise-clarification',
      messageId: 'invalid-change',
      ...update,
    });
    assert(state.issues.length);
    assert.deepEqual(state.plan, plan);
    assert.equal(fixture.model.calls.length, calls);
    assert.deepEqual(state.clarificationAnswerRevisions, []);
  }
});
