import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiBindingIntent,
  resolveWorkflowDraftApiBindingIntent,
  createWorkflowDraftApiBindingIntentSchema,
} from '@openapi-flow/core';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  conversationSemantic,
  conversationEvidence,
} from './fixtures/workflow-draft-conversation-fixture.mjs';
import { apiLiteralSourceSelections } from './fixtures/api-literal-source-selections.mjs';

async function fixture(mode = 'bound', target = '/path/id') {
  const catalog = await createApiCatalog([
    {
      id: 'input-intent',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Request intent fixture', version: '1' },
        paths: {
          '/source': {
            get: {
              responses: {
                200: {
                  description: 'Original source',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          filter: { type: 'string' },
                        },
                        required: ['id', 'filter'],
                        additionalProperties: false,
                      },
                    },
                  },
                },
              },
            },
          },
          '/target/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
                ...['filter', 'q.a', 'x/y~z'].map((name) => ({
                  in: 'query',
                  name,
                  required: false,
                  schema: { type: 'string' },
                })),
              ],
              responses: { 200: { description: 'Selected target' } },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const source = operations.find((entry) => entry.path === '/source');
  const context = { operations, capabilities: [], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'intent-conversation',
      requirements: [],
      nativeNodes: [],
      edges: [],
      apiCalls: [
        { id: 'source', operation: source.key, values: {}, bindings: [] },
      ],
    },
  });
  const calls = [];
  const evidence = (call) => ({
    sourceMessageIds: call.payload.messages.map((message) => message.id),
  });
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            schema,
            name: options.name,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'add-api-call',
                  operation: call.payload.candidates.find(
                    (candidate) => candidate.operation.path === '/target/{id}',
                  ).candidateId,
                }),
              ],
            };
          if (call.name === 'select_draft_api_binding_inputs')
            return {
              targets: mode === 'empty' ? [] : [target],
              ...evidence(call),
            };
          if (call.name === 'plan_draft_api_call_bindings') {
            assert.deepEqual(
              call.payload.bindingTargets.map((entry) => entry.targetPointer),
              [target],
            );
            assert.equal('requestSchema' in call.payload, false);
            const mapping = {
              targetPointer: target,
              sourceNodeId: 'source',
              sourcePointer: target === '/path/id' ? '/id' : '/filter',
            };
            return {
              decision:
                mode === 'ask'
                  ? {
                      status: 'needs-clarification',
                      mappings: [],
                      questions: [
                        {
                          kind: 'choose-source',
                          targetPointer: target,
                          candidates: [
                            {
                              sourceNodeId: mapping.sourceNodeId,
                              sourcePointer: mapping.sourcePointer,
                            },
                          ],
                        },
                      ],
                      ...evidence(call),
                    }
                  : {
                      status: 'provided',
                      mappings: [mapping],
                      ...evidence(call),
                    },
            };
          }
          if (call.name === 'generate_draft_api_call_arguments') {
            const values =
              target === '/path/id' || mode === 'empty'
                ? {}
                : { path: { id: 'literal-id' } };
            return {
              values,
              ...evidence(call),
              ...(Object.keys(values).length
                ? {
                    literalSources: apiLiteralSourceSelections(
                      values,
                      call.payload.messages[0].id,
                    ),
                  }
                : {}),
            };
          }
          if (call.name === 'plan_draft_connection_edit')
            return {
              decisions: [
                {
                  kind: 'add',
                  source: { nodeId: 'source', port: 'main' },
                  target: {
                    nodeId: call.payload.affectedNodeIds[0],
                    port: 'main',
                  },
                  ...conversationEvidence(call),
                },
              ],
            };
          throw new Error(
            `Unexpected intent conversation model stage ${call.name}`,
          );
        },
      };
    },
  };
  const dependencies = {
    context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Input intent conversation',
    reviewPolicy: 'automatic',
    planApiBindingInputs: true,
    includeExplanations: false,
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: 'input-intent' },
    recursionLimit: 150,
  };
  const invoke = (text) =>
    graph.invoke(
      {
        input: {
          initialDraft: draft,
          request: { id: 'request', expectedRevision: 0, text },
        },
      },
      config,
    );
  return {
    graph,
    config,
    invoke,
    calls,
    dependencies,
    draft,
    context,
    operations,
  };
}

test('canonical opt-in plans only the requested predecessor input and never asks about unrelated optional filters', async () => {
  const f = await fixture();
  const result = await f.invoke(
    'Add a target lookup using the source response ID. No optional filters are requested.',
  );
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.questions, []);
  const call = result.draft.apiCalls.find((entry) => entry.id !== 'source');
  assert.deepEqual(call.values, {});
  assert.deepEqual(
    call.bindings.map((entry) => entry.targetPointer),
    ['/path/id'],
  );
  assert.deepEqual(result.bundles[0].inputIntent.targets, ['/path/id']);
  assert.ok(
    Object.values(result.stageResults).some(
      (entry) => entry.kind === 'api-binding-intent',
    ),
  );
  assert.equal(
    f.calls.filter((entry) => entry.name === 'select_draft_api_binding_inputs')
      .length,
    1,
  );
});

test('no selected dependency skips the binding model and keeps the OAS-required literal question', async () => {
  const f = await fixture('empty');
  const result = await f.invoke(
    'Add an independent target lookup. No response values or optional filters are requested.',
  );
  assert.equal(result.phase, 'questions');
  assert.deepEqual(
    result.questions.map((entry) => [
      entry.kind,
      entry.requirement.targetPointer,
    ]),
    [['api-input', '/path/id']],
  );
  assert.equal(
    f.calls.some((entry) => entry.name === 'plan_draft_api_call_bindings'),
    false,
  );
});

test('an explicitly requested optional dependency keeps its typed question and resumes without selection or binding replay', async () => {
  const f = await fixture('ask', '/query/filter');
  let state = await f.invoke(
    'Add target id "literal-id" and use the source response filter as its optional filter; let me confirm that source.',
  );
  const question = state.questions[0].bindingQuestion;
  assert.equal(question.targetPointer, '/query/filter');
  assert.equal(state.questions.length, 1);
  const before = f.calls.length;
  state = await f.graph.invoke(
    new Command({
      resume: {
        action: 'answer-api-bindings',
        token: state.__interrupt__[0].value.token,
        messageId: 'confirmation',
        answers: [
          {
            kind: 'choose-source',
            questionId: question.id,
            choiceId: question.choices[0].id,
          },
        ],
      },
    }),
    f.config,
  );
  assert.equal(state.phase, 'complete');
  assert.deepEqual(
    f.calls.slice(before).map((entry) => entry.name),
    ['generate_draft_api_call_arguments', 'plan_draft_connection_edit'],
  );
  const call = state.draft.apiCalls.find((entry) => entry.id !== 'source');
  assert.deepEqual(call.values, { path: { id: 'literal-id' } });
  assert.equal(call.bindings[0].targetPointer, '/query/filter');
});

test('OAS request names with regex and JSON Pointer escapes remain exact intent targets', async () => {
  const f = await fixture();
  const context = {
    ...f.context,
    messages: [{ id: 'edit', text: 'Use the actual declared query fields.' }],
  };
  const target = f.operations.find(
    (operation) => operation.path === '/target/{id}',
  );
  const plan = createWorkflowDraftEditPlan({
    draft: f.draft,
    context,
    requestMessageIds: ['edit'],
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: target.key,
          instruction: 'Use the actual declared query fields.',
          sources: [
            {
              kind: 'message',
              messageId: 'edit',
              quote: context.messages[0].text,
            },
          ],
        },
      ],
    },
  });
  const input = {
    draft: f.draft,
    context,
    requestMessageIds: ['edit'],
    plan,
    stepId: plan.steps[0].id,
    resolutions: [],
  };
  const fingerprint = describeWorkflowDraftApiBindingIntent(input).fingerprint;
  const resolve = (targets) =>
    resolveWorkflowDraftApiBindingIntent({
      ...input,
      fingerprint,
      proposal: { targets, sourceMessageIds: ['edit'] },
    });
  assert.deepEqual(resolve(['/query/q.a', '/query/x~1y~0z']).targets, [
    '/query/q.a',
    '/query/x~1y~0z',
  ]);
  assert.throws(() => resolve(['/query/qXa']), /Invalid|permitted/);
  assert.equal(
    createWorkflowDraftApiBindingIntentSchema(input).safeParse({
      targets: ['/query/qXa'],
      sourceMessageIds: ['edit'],
    }).success,
    false,
  );
});
