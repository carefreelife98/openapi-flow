import assert from 'node:assert/strict';
import test from 'node:test';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  draftClarificationFixture,
  draftClarificationRequest,
  clarificationLimits,
} from './fixtures/workflow-draft-clarification-fixture.mjs';
import { reviewSuggestionsConversationModel } from './fixtures/workflow-review-suggestions-conversation-fixture.mjs';

async function fixture() {
  const base = await draftClarificationFixture();
  const model = reviewSuggestionsConversationModel();
  const graph = createWorkflowDraftConversationGraph({
    model,
    checkpointer: new MemorySaver(),
    context: { ...base.originalContext, messages: [] },
    name: 'Typed API binding questions',
    reviewPolicy: 'review',
    includeExplanations: false,
    clarification: { limits: clarificationLimits, includeSuggestions: false },
    deployments: [
      ...new Set(
        base.originalContext.operations.map(
          (operation) => operation.key.documentId,
        ),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://contract.example.test',
    })),
  });
  const config = {
    configurable: { thread_id: 'typed-api-binding-answers' },
    recursionLimit: 200,
  };
  const resume = (state, response) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      config,
    );
  let state = await graph.invoke(
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
  const original = state.clarification.round.categories[0].questions[0];
  state = await resume(state, {
    action: 'answer-clarification',
    messageId: 'include-address',
    replies: [
      {
        kind: 'single-choice',
        questionId: original.id,
        choiceId: original.answer.choices[0].id,
      },
    ],
  });
  state = await resume(state, { action: 'approve' });
  assert.equal(state.__interrupt__[0].value.kind, 'draft-questions');
  const question = state.questions.find(
    (question) => question.kind === 'api-binding',
  ).bindingQuestion;
  return { base, model, graph, config, resume, state, question };
}

test('typed source choice continues the same plan without semantic, binding or literal model replay', async () => {
  const f = await fixture();
  const planId = f.state.plan.id;
  const before = f.model.calls.length;
  assert.equal(f.question.targetPointer, '/query/owner');
  assert.equal(f.question.choices[0].sourcePointer, '/email');
  assert.equal(f.question.choices[1].sourcePointer, '/accountId');
  assert(
    f.state.__interrupt__[0].value.actions.includes('answer-api-bindings'),
  );
  let state = await f.resume(f.state, {
    action: 'answer-api-bindings',
    messageId: 'explicit-second-source',
    answers: [
      {
        kind: 'choose-source',
        questionId: f.question.id,
        choiceId: f.question.choices[1].id,
      },
    ],
  });
  assert.equal(state.plan.id, planId);
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  assert.deepEqual(
    f.model.calls.slice(before).map((call) => call.options.name),
    ['plan_draft_connection_edit'],
  );
  assert.equal(state.suggestionAdoptions.length, 0);
  assert(
    state.messages.some((message) => message.id === 'explicit-second-source'),
  );
  assert.equal(
    state.candidate.result.draft.apiCalls.find((call) => call.bindings.length)
      .bindings[0].sourcePointer,
    '/accountId',
  );
  state = await f.resume(state, { action: 'approve' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.draft.apiCalls.length, 2);
  assert.equal(state.draft.edges.length, 1);
  assert.equal(state.artifact.revision, state.draft.revision);
});

test('malformed, stale, unknown and type-incompatible binding answers leave the original plan and model calls unchanged', async () => {
  const f = await fixture();
  let state = f.state;
  const count = f.model.calls.length;
  const plan = globalThis.structuredClone(state.plan);
  const answer = {
    kind: 'choose-source',
    questionId: f.question.id,
    choiceId: f.question.choices[1].id,
  };
  for (const update of [
    { token: 'stale', answers: [answer] },
    { messageId: 'request-1', answers: [answer] },
    { answers: [{ ...answer, questionId: 'unknown' }] },
    { answers: [{ ...answer, choiceId: 'unknown' }] },
    { answers: [answer, answer] },
    {
      answers: [
        {
          kind: 'bind-source',
          questionId: f.question.id,
          sourceNodeId: f.question.choices[1].sourceNodeId,
          sourcePointer: '/enabled',
        },
      ],
    },
  ]) {
    state = await f.resume(state, {
      action: 'answer-api-bindings',
      messageId: 'invalid-answer',
      ...update,
    });
    assert(state.issues.length);
    assert.deepEqual(state.plan, plan);
    assert.equal(f.model.calls.length, count);
    assert(state.questions.some((question) => question.id === f.question.id));
    assert(!state.messages.some((message) => message.id === 'invalid-answer'));
  }
  state = await f.resume(state, { action: 'cancel' });
  assert.equal(state.phase, 'cancelled');
});
