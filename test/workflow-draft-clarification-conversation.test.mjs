import assert from 'node:assert/strict';
import test from 'node:test';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  createWorkflowDraft,
  readClarificationQuestionLimits,
} from '@openapi-flow/core';
import { createPassThroughCapability } from '@openapi-flow/n8n';
import { expandLocalSchemaReferences } from './fixtures/expand-local-schema-references.mjs';
import {
  draftClarificationFixture,
  draftClarificationModel,
  draftClarificationRequest,
  clarificationLimits,
} from './fixtures/workflow-draft-clarification-fixture.mjs';

async function hostFixture({
  withQuestion = true,
  reviewPolicy = 'review',
  model: suppliedModel,
  limits = clarificationLimits,
  includeExplanations = false,
} = {}) {
  const fixture = await draftClarificationFixture({ withQuestion });
  const model =
    suppliedModel === undefined
      ? draftClarificationModel({ withQuestion })
      : suppliedModel;
  const dependencies = {
    model,
    checkpointer: new MemorySaver(),
    context: { ...fixture.originalContext, messages: [] },
    name: 'Clarified workflow conversation',
    reviewPolicy,
    includeExplanations,
    clarification: { limits, includeSuggestions: false },
    deployments: [
      ...new Set(
        fixture.context.operations.map((operation) => operation.key.documentId),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://contract.example.test',
    })),
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: 'clarified-conversation' },
    recursionLimit: 200,
  };
  const text = withQuestion
    ? draftClarificationRequest
    : '원본 회원 정보를 seedId 문자열 "seed"로 GET /seed/{seedId}에서 조회하는 독립 워크플로우를 만들어줘. 다른 API는 추가하지 마.';
  const start = () =>
    graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: { id: 'request-1', text, expectedRevision: 0 },
        },
      },
      config,
    );
  const resume = (state, fields) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...fields },
      }),
      config,
    );
  return { ...fixture, model, graph, config, dependencies, start, resume };
}

test('initial clarification exposes the same optional planning view without inventing a plan or stage result', async () => {
  for (const includeExplanations of [false, true]) {
    let calls = 0;
    const model = {
      withStructuredOutput(_schema, options) {
        assert.equal(options.name, 'clarify_workflow_requirements');
        return {
          async invoke(messages) {
            calls++;
            const source = JSON.parse(messages[1].content).messages.at(-1);
            const fields = includeExplanations
              ? {
                  explanation: {
                    reason:
                      'The request leaves the follow-up scope unresolved.',
                    evidence: [{ kind: 'message', messageId: source.id }],
                  },
                }
              : {};
            return {
              statements: [],
              categories: [
                {
                  title: 'Follow-up scope',
                  ...fields,
                  questions: [
                    {
                      message: 'Which follow-up should this workflow include?',
                      answer: { kind: 'text' },
                      ...fields,
                    },
                  ],
                },
              ],
            };
          },
        };
      },
    };
    const fixture = await hostFixture({ model, includeExplanations });
    const state = await fixture.start();
    const boundary = state.__interrupt__[0].value;
    assert.equal(boundary.kind, 'requirements-clarification');
    assert.equal(
      Object.hasOwn(boundary, 'planningResults'),
      includeExplanations,
    );
    if (includeExplanations) {
      assert.deepEqual(boundary.planningResults, {
        stageResults: {},
        inputAnswerHistory: [],
      });
      assert.equal(
        boundary.round.categories[0].questions[0].explanation.evidence[0].quote,
        draftClarificationRequest,
      );
    }
    assert.equal(calls, 1);
    assert.deepEqual(state.draft, fixture.draft);
  }
});

test('explicit environment budgets reach the actual host model schema; oversized choices fail without truncation or retry', async () => {
  const environment = {
    OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES: '1',
    OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_CATEGORY: '1',
    OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION: '2',
    OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND: '1',
  };
  const limits = readClarificationQuestionLimits(environment);
  const fixture = await hostFixture({ limits });
  const state = await fixture.start();
  assert.equal(state.__interrupt__[0].value.kind, 'requirements-clarification');
  assert.deepEqual(state.clarification.round.limits, limits);
  assert.equal(fixture.model.calls.length, 1);
  const call = fixture.model.calls[0];
  assert.deepEqual(call.payload.limits, limits);
  const inspected = expandLocalSchemaReferences(call.schema);
  assert.equal(inspected.properties.categories.maxItems, 1);
  assert.equal(
    inspected.properties.categories.items.properties.questions.maxItems,
    1,
  );
  assert.equal(
    state.clarification.round.categories[0].questions[0].answer.choices.length,
    2,
  );

  const limited = await hostFixture({
    limits: readClarificationQuestionLimits({
      ...environment,
      OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION: '1',
    }),
  });
  await assert.rejects(limited.start(), /model workflow requirements/);
  assert.equal(limited.model.calls.length, 1);
});

test('a clear request has no question interruption; structured facts are scoped and adopted only after final review', async () => {
  const fixture = await hostFixture({ withQuestion: false });
  const selected = await fixture.start();
  assert.equal(selected.__interrupt__[0].value.phase, 'selection');
  assert.equal(selected.clarification.round.categories.length, 0);
  assert.equal(selected.draft.requirements.length, 0);
  assert.deepEqual(
    fixture.model.calls.map((call) => call.options.name),
    [
      'clarify_workflow_requirements',
      'analyze_workflow_draft_edit',
      'scope_workflow_draft_clarification',
    ],
  );
  const candidate = await fixture.resume(selected, { action: 'approve' });
  assert.equal(candidate.__interrupt__[0].value.phase, 'candidate');
  assert.deepEqual(candidate.draft.apiCalls, []);
  const result = await fixture.resume(candidate, { action: 'approve' });
  assert.equal(result.phase, 'complete');
  assert.equal(result.draft.apiCalls.length, 1);
  assert.equal(result.draft.requirements.length, 1);
  assert.equal(result.draft.requirements[0].origin.kind, 'clarification-fact');
  assert.equal(result.artifact.revision, result.draft.revision);
  const literal = fixture.model.calls.find(
    (call) => call.options.name === 'generate_draft_api_call_arguments',
  );
  assert.deepEqual(
    literal.payload.clarification.facts,
    result.clarification.resolution.facts,
  );
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'clarify_workflow_requirements',
    ).length,
    1,
  );
});

test('repeated malformed/stale/unknown replies keep the original question and never replay its model', async () => {
  const fixture = await hostFixture();
  let state = await fixture.start();
  assert.equal(state.__interrupt__[0].value.kind, 'requirements-clarification');
  const question = state.clarification.round.categories[0].questions[0];
  for (const response of [
    { action: 'approve' },
    {
      action: 'answer-clarification',
      token: 'stale',
      messageId: 'wrong',
      replies: [{ kind: 'defer', questionId: question.id }],
    },
    {
      action: 'answer-clarification',
      messageId: 'wrong',
      replies: [
        { kind: 'single-choice', questionId: question.id, choiceId: 'unknown' },
      ],
    },
    {
      action: 'answer-clarification',
      messageId: 'wrong',
      replies: [
        {
          kind: 'multiple-choice',
          questionId: question.id,
          choiceIds: [question.answer.choices[0].id],
        },
      ],
    },
  ]) {
    state = await fixture.resume(state, response);
    assert.equal(
      state.__interrupt__[0].value.kind,
      'requirements-clarification',
    );
    assert.ok(state.issues.length);
    assert.equal(fixture.model.calls.length, 1);
    assert.deepEqual(state.draft.apiCalls, []);
  }
  const chosen = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'accepted',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(chosen.__interrupt__[0].value.phase, 'selection');
  assert.equal(chosen.clarification.resolution.readyForPlanning, true);
  assert.equal(chosen.clarification.answerMessages.length, 1);
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'clarify_workflow_requirements',
    ).length,
    1,
  );
});

test('the reference conversation preserves a custom answer to its original choice question without repeating clarification', async () => {
  const fixture = await hostFixture();
  const initial = await fixture.start();
  const question = initial.clarification.round.categories[0].questions[0];
  const text = '  제시한 보기 밖의 조회를 원해. "0007"은 그대로 둬.  ';
  const next = await fixture.resume(initial, {
    action: 'answer-clarification',
    messageId: 'custom-human-answer',
    replies: [{ kind: 'text', questionId: question.id, text }],
  });
  assert.equal(next.__interrupt__[0].value.phase, 'selection');
  assert.deepEqual(next.clarification.resolution.replies, [
    { kind: 'text', questionId: question.id, text },
  ]);
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'clarify_workflow_requirements',
    ).length,
    1,
  );
  assert.deepEqual(initial.clarification.resolution.replies, []);
  assert.deepEqual(next.draft.apiCalls, []);
});

test('deferral designs independent work, then an explicit answer supersedes the plan without losing its prepared evidence or changing canonical state', async () => {
  const fixture = await hostFixture();
  const questionState = await fixture.start();
  const question = questionState.clarification.round.categories[0].questions[0];
  const selected = await fixture.resume(questionState, {
    action: 'answer-clarification',
    messageId: 'deferred',
    replies: [{ kind: 'defer', questionId: question.id }],
  });
  assert.equal(selected.__interrupt__[0].value.phase, 'selection');
  const pending = await fixture.resume(selected, { action: 'approve' });
  assert.equal(pending.__interrupt__[0].value.kind, 'draft-questions');
  assert.equal(pending.resolutions.length, 1);
  assert.deepEqual(pending.resolutions[0].values, { path: { seedId: 'seed' } });
  assert.equal(
    pending.questions.some((item) => item.kind === 'clarification'),
    true,
  );
  assert.deepEqual(pending.draft.apiCalls, []);
  const oldPlanId = pending.plan.id;
  const revised = await fixture.resume(pending, {
    action: 'answer-clarification',
    messageId: 'confirmed',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.notEqual(revised.plan.id, oldPlanId);
  assert.equal(revised.__interrupt__[0].value.phase, 'selection');
  const history = revised.clarificationHistory.find(
    (item) => item.plan?.id === oldPlanId,
  );
  assert.equal(history.resolutions.length, 1);
  assert.equal(history.reason, 'requirements-changed');
  assert.deepEqual(revised.draft.apiCalls, []);
  const candidate = await fixture.resume(revised, { action: 'approve' });
  const result = await fixture.resume(candidate, { action: 'approve' });
  assert.equal(result.phase, 'complete');
  assert.equal(result.draft.apiCalls.length, 2);
  assert.equal(result.draft.edges.length, 1);
  assert.equal(result.draft.requirements.length, 2);
  assert.ok(
    result.draft.requirements.every((item) => item.state === 'confirmed'),
  );
  const answer = result.draft.requirements.find((item) =>
    item.origin.sourceId.endsWith(':answer'),
  );
  assert.deepEqual(answer.sourceMessageIds, [
    result.clarification.answerMessages[0].id,
  ]);
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'clarify_workflow_requirements',
    ).length,
    1,
  );
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'analyze_workflow_draft_edit',
    ).length,
    2,
  );
});

test('automatic review mode still asks consequential clarification and never creates fake human approval records', async () => {
  const fixture = await hostFixture({ reviewPolicy: 'automatic' });
  const state = await fixture.start();
  const question = state.clarification.round.categories[0].questions[0];
  const result = await fixture.resume(state, {
    action: 'answer-clarification',
    messageId: 'approved-intent',
    replies: [
      {
        kind: 'single-choice',
        questionId: question.id,
        choiceId: question.answer.choices[0].id,
      },
    ],
  });
  assert.equal(result.phase, 'complete');
  assert.equal(result.draft.apiCalls.length, 2);
  assert.deepEqual(result.draft.approvals, []);
  assert.equal(result.artifact.revision, result.draft.revision);
});

test('cancel/revise at the initial question are explicit and never force a dummy answer or overwrite the original draft', async () => {
  const cancelledFixture = await hostFixture();
  const question = await cancelledFixture.start();
  const cancelled = await cancelledFixture.resume(question, {
    action: 'cancel',
  });
  assert.equal(cancelled.phase, 'cancelled');
  assert.deepEqual(cancelled.draft, cancelledFixture.draft);
  const fixture = await hostFixture();
  const first = await fixture.start();
  const revised = await fixture.resume(first, {
    action: 'revise',
    message: {
      id: 'new-intent',
      text: '주소 조회 여부는 원래 질문의 선택지로 다시 확인하고 싶어.',
    },
  });
  assert.equal(
    revised.__interrupt__[0].value.kind,
    'requirements-clarification',
  );
  assert.notEqual(revised.clarification.round.id, first.clarification.round.id);
  assert.equal(
    revised.clarificationHistory.at(-1).reason,
    'request-superseded',
  );
  assert.deepEqual(revised.draft, fixture.draft);
  assert.equal(fixture.model.calls.length, 2);
});

test('a subsequent completed turn gets a fresh round and fact lineage while preserving earlier requirements and instance identities', async () => {
  const fixture = await hostFixture({
    withQuestion: false,
    reviewPolicy: 'automatic',
  });
  const first = await fixture.start();
  const original = globalThis.structuredClone(first.draft);
  const result = await fixture.graph.invoke(
    {
      input: {
        request: {
          id: 'request-2',
          text: '다른 독립 역할로 원본 회원 정보를 seedId 문자열 "seed"로 다시 조회하는 API 하나를 추가해줘.',
          expectedRevision: first.draft.revision,
        },
      },
    },
    fixture.config,
  );
  assert.equal(result.phase, 'complete');
  assert.equal(result.draft.apiCalls.length, 2);
  assert.notEqual(result.clarification.round.id, first.clarification.round.id);
  assert.deepEqual(result.draft.apiCalls[0], original.apiCalls[0]);
  assert.deepEqual(result.draft.requirements[0], original.requirements[0]);
  assert.equal(result.draft.requirements.length, 2);
  assert.equal(result.clarificationHistory.at(-1).reason, 'next-turn');
  assert.equal(
    fixture.model.calls.filter(
      (call) => call.options.name === 'clarify_workflow_requirements',
    ).length,
    2,
  );
});

test('clarification configuration and transport failures remain original, with no retry or partial canonical mutation', async () => {
  const fixture = await hostFixture();
  assert.throws(() =>
    createWorkflowDraftConversationGraph({
      ...fixture.dependencies,
      clarification: { limits: { ...clarificationLimits, maxCategories: 0 } },
    }),
  );
  const original = new Error('Explicit clarification transport failure');
  let calls = 0;
  const failing = await hostFixture({
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            calls++;
            throw original;
          },
        };
      },
    },
  });
  await assert.rejects(
    () => failing.start(),
    (error) => error === original,
  );
  assert.equal(calls, 1);
  const snapshot = await failing.graph.getState(failing.config);
  assert.deepEqual(snapshot.values.draft, failing.draft);
  assert.deepEqual(snapshot.values.plan, undefined);
});

test('native-only clarification keeps OAS absent, scopes the real native instance and never fabricates an API or parameters', async () => {
  const context = {
    operations: [],
    capabilities: [createPassThroughCapability()],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'clarified-native-only',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const names = [];
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          names.push(options.name);
          const message = payload.messages[0];
          const sources = [{ kind: 'message', messageId: message.id }];
          if (options.name === 'clarify_workflow_requirements')
            return {
              statements: [{ text: message.text, sources }],
              categories: [],
            };
          if (options.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                {
                  kind: 'add-native-node',
                  capability: 'pass-through',
                  instruction: message.text,
                  sources,
                },
              ],
            };
          if (options.name === 'scope_workflow_draft_clarification')
            return {
              scopes: Object.fromEntries(
                payload.requirements.map((requirement) => [
                  requirement.id,
                  { scope: { kind: 'nodes', nodeIds: [payload.nodes[0].id] } },
                ]),
              ),
            };
          if (options.name === 'plan_draft_connection_edit')
            return { decisions: [{ kind: 'keep-connections', sources }] };
          throw new Error(
            `Unexpected native-only clarified call ${options.name}`,
          );
        },
      };
    },
  };
  const graph = createWorkflowDraftConversationGraph({
    context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Clarified native-only',
    reviewPolicy: 'automatic',
    includeExplanations: false,
    clarification: { limits: clarificationLimits, includeSuggestions: false },
  });
  const result = await graph.invoke(
    {
      input: {
        initialDraft: draft,
        request: {
          id: 'native-request',
          text: '수동 실행 후 받은 입력을 Pass-through로 그대로 전달하는 워크플로우를 만들어줘.',
          expectedRevision: 0,
        },
      },
    },
    {
      configurable: { thread_id: 'clarified-native-only' },
      recursionLimit: 100,
    },
  );
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.draft.apiCalls, []);
  assert.equal(result.draft.nativeNodes.length, 1);
  assert.deepEqual(result.draft.nativeNodes[0].parameters, {});
  assert.equal(result.draft.requirements.length, 1);
  assert.equal(result.artifact.triggerConnected, true);
  assert.equal(names.includes('generate_draft_native_node_addition'), false);
});
