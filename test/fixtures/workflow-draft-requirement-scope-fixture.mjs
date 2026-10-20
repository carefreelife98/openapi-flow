import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Command, MemorySaver } from '@langchain/langgraph';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  conversationSemantic,
  conversationEvidence,
} from './workflow-draft-conversation-fixture.mjs';

export function pendingRequirementScopeModel(
  kind = 'api',
  { ownedConcerns = false } = {},
) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            name: options.name,
            schema,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(
                  call,
                  kind === 'api'
                    ? {
                        kind: 'add-api-call',
                        operation: call.payload.candidates[0].candidateId,
                      }
                    : {
                        kind: 'add-native-node',
                        capability: N8nNativeFeature.SplitApiResponseArray,
                      },
                ),
                conversationSemantic(call, {
                  kind: 'revise-requirement',
                  requirementId: 'purpose',
                }),
                ...(ownedConcerns
                  ? [
                      conversationSemantic(
                        call,
                        {
                          kind: 'needs-clarification',
                          owner: {
                            kind: 'planning-step',
                            decisionIndex: 0,
                            stage:
                              kind === 'api'
                                ? 'api-arguments'
                                : 'native-parameters',
                          },
                        },
                        'The selected request/settings stage must resolve its required inputs without inventing values.',
                      ),
                      conversationSemantic(
                        call,
                        {
                          kind: 'needs-clarification',
                          owner: {
                            kind: 'planning-step',
                            decisionIndex: 1,
                            stage: 'requirements',
                          },
                        },
                        'The selected requirement revision owns explicit replacement text, state and scope.',
                      ),
                    ]
                  : []),
              ],
            };
          if (call.name === 'plan_draft_api_call_bindings')
            return {
              decision: {
                status: 'provided',
                ...(call.payload.sourceCandidates.length
                  ? { mappings: [] }
                  : {}),
                sourceMessageIds: call.payload.messages.map(
                  (message) => message.id,
                ),
              },
            };
          if (call.name === 'generate_draft_api_call_arguments')
            return {
              values: {},
              sourceMessageIds: call.payload.messages.map(
                (message) => message.id,
              ),
            };
          if (call.name === 'plan_draft_connection_edit')
            return {
              decisions: [
                { kind: 'keep-connections', ...conversationEvidence(call) },
              ],
            };
          throw new Error(`Unexpected requirement scope stage ${call.name}`);
        },
      };
    },
  };
}

export async function pendingRequirementScopeFixture({
  kind = 'api',
  model = pendingRequirementScopeModel(kind),
  deployments,
} = {}) {
  const catalog = await createApiCatalog([
    {
      id: 'pending-requirement-scope',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Pending request scope', version: '1' },
        paths: {
          '/records/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                200: {
                  description: 'Record',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                        additionalProperties: false,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const context = {
    operations: kind === 'api' ? operations : [],
    capabilities: resolveN8nNativePlanningFeatures({
      features: [
        N8nNativeFeature.PassThrough,
        N8nNativeFeature.SplitApiResponseArray,
      ],
    }).planningCapabilities,
    messages: [
      {
        id: 'initial-purpose',
        text: 'Keep the original pass-through; its original purpose is confirmed.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'pending-requirement-scope',
      requirements: [
        {
          id: 'purpose',
          text: 'Original purpose',
          state: 'confirmed',
          scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
          sourceMessageIds: ['initial-purpose'],
        },
      ],
      apiCalls: [],
      nativeNodes: [
        {
          id: 'unchanged-pass',
          capability: N8nNativeFeature.PassThrough,
          parameters: {},
        },
      ],
      edges: [],
    },
  });
  const graph = createWorkflowDraftConversationGraph({
    context,
    model,
    checkpointer: new MemorySaver(),
    reviewPolicy: 'review',
    includeExplanations: false,
    name: 'Pending identity scope',
    ...(deployments === undefined ? {} : { deployments }),
  });
  return {
    kind,
    model,
    context,
    draft,
    graph,
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 150 },
  };
}

export function pendingRequirementScopeEditInput(fixture, decisions) {
  const context = {
    ...fixture.context,
    messages: [
      ...fixture.context.messages,
      {
        id: 'edit-scope',
        text: 'Add the explicit role and revise its purpose. Preserve other materials.',
      },
    ],
  };
  const input = {
    draft: fixture.draft,
    context,
    requestMessageIds: ['edit-scope'],
  };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: (decisions === undefined
        ? [
            fixture.kind === 'api'
              ? { kind: 'add-api-call', operation: context.operations[0].key }
              : {
                  kind: 'add-native-node',
                  capability: N8nNativeFeature.SplitApiResponseArray,
                },
            { kind: 'revise-requirement', requirementId: 'purpose' },
          ]
        : decisions
      ).map((decision) => ({
        ...decision,
        instruction: context.messages.at(-1).text,
        sources: [
          {
            kind: 'message',
            messageId: 'edit-scope',
            quote: context.messages.at(-1).text,
          },
        ],
      })),
    },
  });
  return { ...input, plan, resolutions: [], repairs: [] };
}

export async function runPendingRequirementScope(fixture, onCheckpoint) {
  const checkpoints = [];
  const save = (label, state) => {
    const entry = { label, state: globalThis.structuredClone(state) };
    checkpoints.push(entry);
    onCheckpoint?.(entry);
    return state;
  };
  let state = save(
    'questions-before-scope',
    await beginPendingRequirementScope(fixture),
  );
  const step = state.plan.steps.find(
    (step) => step.decision.kind === 'add-api-call',
  );
  assert.ok(step);
  const question = state.questions.find(
    (question) => question.kind === 'requirement',
  );
  assert.ok(
    question,
    'The test request must select its explicit requirement revision, not only a node addition',
  );
  assert.ok(
    question.requirementEdit.nodes.some((node) => node.id === step.newNodeId),
  );
  state = save(
    'accepted-scope-still-missing-api-input',
    await resumePendingRequirementScope(fixture, state, {
      action: 'answer-requirement',
      messageId: 'typed-new-role-purpose',
      stepId: question.stepId,
      requirement: {
        text: 'The new record lookup is the confirmed purpose.',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: [step.newNodeId] },
      },
    }),
  );
  assert.deepEqual(state.issues, []);
  assert.equal(state.phase, 'questions');
  assert.equal(
    state.questions.some((question) => question.kind === 'requirement'),
    false,
  );
  assert.equal(state.candidate, undefined);
  assert.deepEqual(state.draft, fixture.draft);
  const bindingQuestions = state.questions.filter(
    (question) => question.kind === 'api-binding',
  );
  if (bindingQuestions.length) {
    state = save(
      'explicit-no-binding-answer',
      await resumePendingRequirementScope(fixture, state, {
        action: 'answer-api-bindings',
        messageId: 'typed-no-incoming-binding',
        answers: bindingQuestions.map((question) => ({
          kind: 'no-binding',
          questionId: question.id,
        })),
      }),
    );
    assert.deepEqual(state.issues, []);
    assert.equal(state.phase, 'questions');
  }
  const input = state.questions.find(
    (question) => question.kind === 'api-input',
  );
  assert.ok(input);
  state = save(
    'candidate-after-explicit-api-input',
    await resumePendingRequirementScope(fixture, state, {
      action: 'answer-inputs',
      messageId: 'typed-record-id',
      answers: [
        { requirementId: input.requirement.id, value: 'fixture-record' },
      ],
    }),
  );
  assert.equal(state.__interrupt__[0].value.phase, 'candidate');
  state = save(
    'adopted',
    await resumePendingRequirementScope(fixture, state, { action: 'approve' }),
  );
  assert.equal(state.phase, 'complete');
  assert.equal(state.artifact.draftReadiness.designReady, true);
  assert.equal(state.artifact.requestInputsReady, true);
  assert.equal(
    state.artifact.triggerConnected,
    state.artifact.deploymentConfigured,
  );
  assert.deepEqual(state.draft.apiCalls[0].values, {
    path: { id: 'fixture-record' },
  });
  assert.equal(state.draft.apiCalls[0].id, step.newNodeId);
  assert.deepEqual(state.draft.requirements[0].scope, {
    kind: 'nodes',
    nodeIds: [step.newNodeId],
  });
  assert.deepEqual(state.draft.nativeNodes, fixture.draft.nativeNodes);
  assert.deepEqual(state.draft.edges, fixture.draft.edges);
  assert.deepEqual(
    state.draft.requirementHistory.map((entry) => entry.kind),
    ['created', 'revised'],
  );
  return { state, checkpoints };
}

export async function beginPendingRequirementScope(fixture) {
  let state = await fixture.graph.invoke(
    {
      input: {
        initialDraft: fixture.draft,
        request: {
          id: 'scope-new-role',
          expectedRevision: 0,
          text:
            fixture.kind === 'api'
              ? 'Make two changes in this turn: add an independent GET /records/{id} API role, and revise the existing requirement with ID purpose. Ask me for the replacement requirement text, state and scope as a typed answer. The record ID is not supplied; ask me for its literal value. Do not bind it from any predecessor output. Keep the existing pass-through, parameters and edges unchanged.'
              : 'Make two changes in this turn: add an API response split role, and revise the existing requirement with ID purpose. Ask me for the replacement requirement text, state and scope as a typed answer. The API producer is not supplied yet. Keep existing nodes unchanged.',
        },
      },
    },
    fixture.config,
  );
  assert.equal(state.__interrupt__[0].value.phase, 'selection');
  state = await resumePendingRequirementScope(fixture, state, {
    action: 'approve',
  });
  assert.equal(state.phase, 'questions');
  return state;
}
export function resumePendingRequirementScope(fixture, state, response) {
  return fixture.graph.invoke(
    new Command({
      resume: { token: state.__interrupt__[0].value.token, ...response },
    }),
    fixture.config,
  );
}
