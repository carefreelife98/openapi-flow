import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { requestedApiInputFixture } from './fixtures/requested-api-inputs-fixture.mjs';
import { conversationSemantic } from './fixtures/workflow-draft-conversation-fixture.mjs';

async function conversation(options = {}) {
  const fixture = await requestedApiInputFixture();
  const calls = [];
  const model = {
    withStructuredOutput(schema, config) {
      return {
        async invoke(messages) {
          const call = {
            name: config.name,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'add-api-call',
                  operation: call.payload.candidates.find(
                    (candidate) => candidate.operation.path === '/search',
                  ).candidateId,
                }),
              ],
            };
          if (call.name === 'select_draft_api_binding_inputs')
            return {
              targets: [],
              sourceMessageIds: call.payload.messages.map(
                (message) => message.id,
              ),
            };
          if (call.name === 'plan_draft_api_call_bindings')
            return {
              decision: {
                status: 'provided',
                sourceMessageIds: call.payload.messages.map(
                  (message) => message.id,
                ),
              },
            };
          if (call.name === 'generate_draft_api_call_arguments')
            return {
              values: {},
              requestedInputs: ['/query/filter'],
              sourceMessageIds: call.payload.messages.map(
                (message) => message.id,
              ),
            };
          throw new Error('Unexpected model stage ' + call.name);
        },
      };
    },
  };
  const dependencies = {
    context: { ...fixture.input.context, messages: [] },
    checkpointer: new MemorySaver(),
    model,
    reviewPolicy: 'automatic',
    includeExplanations: false,
    name: '선택 필터 입력',
    planApiBindingInputs: true,
    trackRequestedApiInputs: true,
    deployments: [
      {
        documentId: fixture.operation.key.documentId,
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
    ...options,
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: 'requested-inputs' },
    recursionLimit: 100,
  };
  const initial = () =>
    graph.invoke(
      {
        input: {
          initialDraft: fixture.input.draft,
          request: {
            id: 'turn-1',
            expectedRevision: 0,
            text: fixture.input.context.messages[0].text,
          },
        },
      },
      config,
    );
  return { graph, config, initial, calls, dependencies };
}

test('canonical host asks for requested optional input and resumes the same proposal without replaying any model', async () => {
  const fixture = await conversation();
  const pending = await fixture.initial();
  assert.equal(pending.phase, 'questions');
  const [question] = pending.questions;
  assert.equal(question.requirement.kind, 'requested-input');
  assert.equal(question.requirement.targetPointer, '/query/filter');
  const count = fixture.calls.length;
  const complete = await fixture.graph.invoke(
    new Command({
      resume: {
        token: pending.__interrupt__[0].value.token,
        action: 'answer-inputs',
        messageId: 'answer-1',
        answers: [{ requirementId: question.id, value: '' }],
      },
    }),
    fixture.config,
  );
  assert.equal(complete.phase, 'complete');
  assert.equal(fixture.calls.length, count);
  assert.deepEqual(complete.draft.apiCalls[0].values, {
    query: { filter: '' },
  });
  assert.deepEqual(complete.draft.apiCalls[0].requestedInputs, [
    '/query/filter',
  ]);
  assert.equal(complete.artifact.requestInputsReady, true);
});

test('opted-in runtime mode exports a typed slot for the missing optional filter rather than silently dropping it', async () => {
  const fixture = await conversation({ allowRuntimeInputs: true });
  const result = await fixture.initial();
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.draft.apiCalls[0].values, {});
  assert.deepEqual(result.draft.apiCalls[0].requestedInputs, ['/query/filter']);
  assert.equal(result.artifact.requestInputsReady, false);
  assert.deepEqual(
    result.artifact.inputSlots.map((slot) => slot.targetPointer),
    ['/query/filter'],
  );
  assert.equal(
    fixture.calls.filter(
      (call) => call.name === 'generate_draft_api_call_arguments',
    ).length,
    1,
  );
});

test('host requires an explicit boolean option instead of inferring an opt-in from other configuration', async () => {
  const fixture = await conversation();
  assert.throws(
    () =>
      createWorkflowDraftConversationGraph({
        ...fixture.dependencies,
        trackRequestedApiInputs: 'true',
      }),
    /trackRequestedApiInputs.*boolean/,
  );
});
