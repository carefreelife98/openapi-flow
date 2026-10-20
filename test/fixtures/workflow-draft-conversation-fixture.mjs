import { MemorySaver } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { createWorkflowDraft } from '@openapi-flow/core';
import { createPassThroughCapability } from '@openapi-flow/n8n';
import { nativeParameterEditFixture } from './workflow-draft-native-parameter-edit-fixture.mjs';

export async function draftConversationFixture({
  reviewPolicy = 'review',
  empty = false,
  respond,
  allowRuntimeInputs = false,
  allowRuntimeParameters = false,
  includeExplanations = false,
} = {}) {
  const fixture = await nativeParameterEditFixture();
  const context = {
    ...fixture.context,
    capabilities: [
      ...fixture.context.capabilities,
      createPassThroughCapability(),
    ],
  };
  const draft = empty
    ? createWorkflowDraft({
        context,
        content: {
          id: 'empty-conversation',
          apiCalls: [],
          nativeNodes: [],
          requirements: [],
          edges: [],
        },
      })
    : fixture.draft;
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          const call = {
            name: options.name,
            schema,
            options,
            payload,
            messages,
          };
          calls.push(call);
          if (!respond)
            throw new Error('Fixture requires an explicit model response');
          return respond(call, calls);
        },
      };
    },
  };
  const checkpointer = new MemorySaver();
  const dependencies = {
    context,
    model,
    checkpointer,
    name: 'Canonical draft conversation',
    reviewPolicy,
    includeExplanations,
    allowRuntimeInputs,
    allowRuntimeParameters,
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  return {
    ...fixture,
    draft,
    context,
    graph,
    model,
    calls,
    dependencies,
    checkpointer,
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 150 },
  };
}
export function currentConversationMessage(call) {
  return call.name === 'analyze_workflow_draft_edit'
    ? call.payload.messages.find(
        (message) => message.id === call.payload.requestMessageIds.at(-1),
      )
    : call.payload.messages.at(-1);
}
export function conversationEvidence(call) {
  const message = currentConversationMessage(call);
  const sources = [{ kind: 'message', messageId: message.id }];
  return {
    sources,
    ...(call.payload.includeExplanations ||
    call.payload.options?.includeExplanations
      ? {
          explanation: {
            reason:
              'The current request explicitly specifies this scoped decision.',
            evidence: sources,
          },
        }
      : {}),
  };
}
export function conversationSemantic(call, fields, instruction) {
  return {
    ...fields,
    instruction:
      instruction === undefined
        ? currentConversationMessage(call).text
        : instruction,
    ...conversationEvidence(call),
  };
}
export function nativeCountConversationModel(value) {
  return (call) => {
    if (call.name === 'analyze_workflow_draft_edit')
      return {
        decisions: [
          conversationSemantic(call, {
            kind: 'revise-native-node',
            nodeId: 'config',
          }),
        ],
      };
    if (call.name === 'select_draft_native_parameter_edit_targets')
      return {
        decision: {
          status: 'targets',
          targets: [
            { kind: 'set', pointer: '/count', ...conversationEvidence(call) },
          ],
        },
      };
    if (call.name === 'generate_draft_native_parameter_edit_values')
      return {
        values: {
          'parameter-1': {
            status: 'provided',
            value: typeof value === 'function' ? value() : value,
            ...conversationEvidence(call),
          },
        },
      };
    if (call.name === 'plan_draft_connection_edit')
      return {
        decisions: [
          { kind: 'keep-connections', ...conversationEvidence(call) },
        ],
      };
    throw new Error(`Unexpected native conversation stage ${call.name}`);
  };
}
export function apiRootConversationModel({
  value,
  includePassThrough = false,
} = {}) {
  return (call) => {
    if (call.name === 'analyze_workflow_draft_edit') {
      const candidate = call.payload.candidates.find(
        (candidate) => candidate.operation.path === '/replacement/{id}',
      );
      const decisions = [
        conversationSemantic(call, {
          kind: 'add-api-call',
          operation: candidate.candidateId,
        }),
      ];
      if (includePassThrough)
        decisions.push(
          conversationSemantic(
            call,
            { kind: 'add-native-node', capability: 'pass-through' },
            'Add a separate independent pass-through role.',
          ),
        );
      return { decisions };
    }
    if (call.name === 'plan_draft_api_call_bindings')
      return {
        decision: {
          status: 'provided',
          ...(call.payload.sourceCandidates.length ? { mappings: [] } : {}),
          sourceMessageIds: call.payload.messages.map((message) => message.id),
        },
      };
    if (call.name === 'generate_draft_api_call_arguments')
      return {
        values: value === undefined ? {} : { path: { id: value } },
        sourceMessageIds: call.payload.messages.map((message) => message.id),
      };
    if (call.name === 'plan_draft_connection_edit')
      return {
        decisions: [
          { kind: 'keep-connections', ...conversationEvidence(call) },
        ],
      };
    throw new Error(`Unexpected API conversation stage ${call.name}`);
  };
}
export function conversationTurn(draft, id, text, initial = false) {
  return {
    input: {
      request: { id, text, expectedRevision: draft.revision },
      ...(initial ? { initialDraft: draft } : {}),
    },
  };
}
export function conversationBoundary(result) {
  if (!result.__interrupt__?.length)
    throw new Error('Expected one actual LangGraph interrupt');
  return result.__interrupt__[0].value;
}
