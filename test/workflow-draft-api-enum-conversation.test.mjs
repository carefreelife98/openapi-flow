import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
} from '@openapi-flow/core';
import {
  createApiEnumEditFixture,
  enumEditIntent,
} from './fixtures/workflow-draft-api-enum-edit-fixture.mjs';
import {
  conversationTurn,
  conversationBoundary,
  conversationEvidence,
  conversationSemantic,
  currentConversationMessage,
} from './fixtures/workflow-draft-conversation-fixture.mjs';

test('the host rejects a non-Boolean enum policy before any model call', async () => {
  const input = await createApiEnumEditFixture();
  assert.throws(
    () =>
      createWorkflowDraftConversationGraph({
        context: input.context,
        model: {
          withStructuredOutput() {
            throw new Error('Model must not be called');
          },
        },
        checkpointer: new MemorySaver(),
        name: 'Invalid enum option',
        reviewPolicy: 'review',
        selectOasEnums: 'true',
      }),
    /selectOasEnums.*boolean/,
  );
});

test('new API enum attribution survives an unrelated typed input answer in the actual LangGraph without another value/enum call', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'enum-add-conversation',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Ranking', version: '1' },
        paths: {
          '/ranking/{sort}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'sort',
                  required: true,
                  schema: { type: 'string', enum: ['NEW', 'VIEWS'] },
                },
                {
                  in: 'query',
                  name: 'customer',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { 200: { description: 'Fixture response' } },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const context = { operations, capabilities: [], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'enum-add-draft',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            name: options.name,
            schema,
            options,
            payload: JSON.parse(messages[1].content),
            messages,
          };
          calls.push(call);
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'add-api-call',
                  operation: call.payload.candidates[0].candidateId,
                }),
              ],
            };
          const evidence = {
            sourceMessageIds: call.payload.messages.map(
              (message) => message.id,
            ),
          };
          if (call.name === 'plan_draft_api_call_bindings')
            return { decision: { status: 'provided', ...evidence } };
          if (call.name === 'generate_draft_api_call_arguments')
            return {
              values: {},
              requestedInputs: ['/path/sort', '/query/customer'],
              ...evidence,
            };
          if (call.name === 'select_draft_api_enum_choices') {
            const candidate = call.payload.candidates.find(
              (item) => item.value === 'VIEWS',
            );
            assert(candidate);
            return {
              selections: [
                {
                  candidateId: candidate.id,
                  messageId: call.payload.messages[0].id,
                  sourceText: call.payload.messages[0].text,
                  reason: '요청한 조회수 정렬을 OAS 후보에서 선택했습니다.',
                },
              ],
            };
          }
          if (call.name === 'plan_draft_connection_edit')
            return {
              decisions: [
                { kind: 'keep-connections', ...conversationEvidence(call) },
              ],
            };
          throw new Error(`Unexpected initial enum stage ${call.name}`);
        },
      };
    },
  };
  const graph = createWorkflowDraftConversationGraph({
    context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Initial enum conversation',
    reviewPolicy: 'automatic',
    includeExplanations: false,
    selectOasEnums: true,
    trackRequestedApiInputs: true,
  });
  const config = {
    configurable: { thread_id: randomUUID() },
    recursionLimit: 150,
  };
  const waiting = await graph.invoke(
    conversationTurn(
      draft,
      'initial-enum',
      '조회수 순으로 조회해줘. customer 값은 질문해줘.',
      true,
    ),
    config,
  );
  const question = conversationBoundary(waiting);
  assert.equal(question.enumSelections.length, 1);
  assert.equal(question.enumSelections[0].value, 'VIEWS');
  assert.deepEqual(
    question.questions.map((item) => item.requirement.targetPointer),
    ['/query/customer'],
  );
  const requirement = question.questions[0].requirement;
  const completed = await graph.invoke(
    new Command({
      resume: {
        action: 'answer-inputs',
        token: question.token,
        messageId: 'customer-answer',
        answers: [{ requirementId: requirement.id, value: '0007' }],
      },
    }),
    config,
  );
  assert.equal(completed.phase, 'complete');
  assert.deepEqual(completed.draft.apiCalls[0].values, {
    path: { sort: 'VIEWS' },
    query: { customer: '0007' },
  });
  const result = Object.values(completed.apiArgumentResults)[0];
  assert.deepEqual(result.enumSelections, question.enumSelections);
  assert.deepEqual(result.proposal.values, {});
  assert.equal(
    calls.filter((call) => call.name === 'generate_draft_api_call_arguments')
      .length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.name === 'select_draft_api_enum_choices')
      .length,
    1,
  );
});
for (const includeExplanations of [false, true])
  test(`actual LangGraph enum edit survives questions, typed resume, stale approvals and final review without regenerating values, explanations=${includeExplanations}`, async () => {
    const input = await createApiEnumEditFixture({
      pointers: ['/body/sort', '/body/note'],
      includeExplanations,
    });
    const before = globalThis.structuredClone(input.draft);
    const calls = [];
    const model = {
      withStructuredOutput(schema, options) {
        return {
          async invoke(messages) {
            const call = {
              name: options.name,
              schema,
              options,
              payload: JSON.parse(messages[1].content),
              messages,
            };
            calls.push(call);
            if (call.name === 'analyze_workflow_draft_edit')
              return {
                decisions: [
                  conversationSemantic(call, {
                    kind: 'revise-api-inputs',
                    nodeId: 'source',
                  }),
                ],
              };
            if (call.name === 'select_draft_api_input_edit_targets')
              return {
                targets: ['/body/sort', '/body/note'].map((pointer) => ({
                  kind: 'set',
                  pointer,
                  ...conversationEvidence(call),
                })),
              };
            if (call.name === 'generate_draft_api_input_edit_values') {
              const candidate = call.payload.enumChoices.candidates.find(
                (item) =>
                  item.targetPointer === '/body/sort' && item.value === 'VIEWS',
              );
              assert(candidate);
              const message = currentConversationMessage(call);
              return {
                values: {
                  'value-1': {
                    status: 'oas-enum',
                    selection: {
                      candidateId: candidate.id,
                      messageId: message.id,
                      sourceText: message.text,
                      reason: '요청한 정렬 의미에 맞는 OAS 값을 선택했습니다.',
                    },
                  },
                  'value-2': {
                    status: 'needs-input',
                    ...(includeExplanations
                      ? { explanation: conversationEvidence(call).explanation }
                      : {}),
                  },
                },
              };
            }
            if (call.name === 'plan_draft_connection_edit')
              return {
                decisions: [
                  { kind: 'keep-connections', ...conversationEvidence(call) },
                ],
              };
            throw new Error(`Unexpected enum conversation stage ${call.name}`);
          },
        };
      },
    };
    const graph = createWorkflowDraftConversationGraph({
      context: input.context,
      model,
      checkpointer: new MemorySaver(),
      name: 'Enum edit conversation',
      reviewPolicy: 'review',
      includeExplanations,
      selectOasEnums: true,
    });
    const config = {
      configurable: { thread_id: randomUUID() },
      recursionLimit: 150,
    };
    const selection = await graph.invoke(
      conversationTurn(input.draft, 'enum-turn', enumEditIntent, true),
      config,
    );
    assert.equal(conversationBoundary(selection).phase, 'selection');
    const waiting = await graph.invoke(
      new Command({
        resume: {
          action: 'approve',
          token: conversationBoundary(selection).token,
        },
      }),
      config,
    );
    const question = conversationBoundary(waiting);
    assert.equal(question.kind, 'draft-questions');
    assert.deepEqual(
      question.questions.map((item) => item.apiInputEditTarget.pointer),
      ['/body/note'],
    );
    assert.equal(question.enumSelections.length, 1);
    assert.equal(question.enumSelections[0].value, 'VIEWS');
    assert.equal(question.enumSelections[0].messageId, 'enum-turn');
    assert.equal(
      Object.hasOwn(question, 'planningResults'),
      includeExplanations,
    );
    assert.deepEqual(waiting.draft, before);
    const checkpoint = await graph.getState(config);
    assert.deepEqual(checkpoint.values.stageResults, waiting.stageResults);
    const callsBeforeAnswer = calls.length;
    const target = question.questions[0];
    const candidate = await graph.invoke(
      new Command({
        resume: {
          action: 'answer-api-input-edits',
          token: question.token,
          stepId: target.stepId,
          messageId: 'note-answer',
          confirmedAnswers: {
            contractId: target.apiInputEditContractId,
            answers: [
              { targetId: target.apiInputEditTarget.id, value: '0007' },
            ],
          },
        },
      }),
      config,
    );
    const review = conversationBoundary(candidate);
    assert.equal(review.phase, 'candidate');
    assert.deepEqual(review.enumSelections, question.enumSelections);
    assert.notEqual(review.token, question.token);
    assert.equal(
      candidate.candidate.result.draft.apiCalls[0].values.body.sort,
      'VIEWS',
    );
    assert.equal(
      candidate.candidate.result.draft.apiCalls[0].values.body.note,
      '0007',
    );
    assert.deepEqual(candidate.draft, before);
    assert(
      !calls
        .slice(callsBeforeAnswer)
        .some((call) => call.name === 'generate_draft_api_input_edit_values'),
    );
    const stale = await graph.invoke(
      new Command({ resume: { action: 'approve', token: question.token } }),
      config,
    );
    assert(
      conversationBoundary(stale).issues.some((issue) =>
        issue.includes('토큰'),
      ),
    );
    assert.deepEqual(stale.draft, before);
    const completed = await graph.invoke(
      new Command({
        resume: { action: 'approve', token: conversationBoundary(stale).token },
      }),
      config,
    );
    assert.equal(completed.phase, 'complete');
    assert.deepEqual(completed.draft.apiCalls[0].values.body, {
      sort: 'VIEWS',
      note: '0007',
      untouched: 'kept',
    });
    assert.equal(
      calls.filter(
        (call) => call.name === 'generate_draft_api_input_edit_values',
      ).length,
      1,
    );
    const receipt = Object.values(completed.stageResults).find(
      (result) => result.enumSelections?.length,
    )?.enumSelections;
    assert.deepEqual(receipt, question.enumSelections);
  });
