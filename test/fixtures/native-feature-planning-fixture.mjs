import { MemorySaver } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import { createWorkflowDraft } from '@openapi-flow/core';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { nativeFeatureRegistryFixture } from './native-feature-registry-fixture.mjs';
import {
  conversationSemantic,
  conversationEvidence,
} from './workflow-draft-conversation-fixture.mjs';

export async function nativeFeaturePlanningFixture({
  features,
  producer = false,
  respond,
} = {}) {
  const original = await nativeFeatureRegistryFixture();
  const context = {
    operations: [],
    capabilities: [],
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'registered-planning',
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
            schema,
            options,
            name: options.name,
            payload: JSON.parse(messages[1].content),
          };
          calls.push(call);
          if (!respond)
            throw new Error('An explicit model fixture response is required');
          return respond(call, calls);
        },
      };
    },
  };
  const dependencies = {
    context,
    model,
    name: 'Registered planning definitions',
    checkpointer: new MemorySaver(),
    reviewPolicy: 'automatic',
    includeExplanations: false,
    itemMode: 'linked',
    nativeFeatures: {
      ...(features === undefined ? {} : { features }),
      ...(producer ? { jsonOutput: original.jsonOutput } : {}),
    },
  };
  return {
    original,
    context,
    draft,
    calls,
    model,
    dependencies,
    graph: createWorkflowDraftConversationGraph(dependencies),
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 100 },
  };
}

export function nativeFeaturePlanningModel({ includeProducer = true } = {}) {
  return (call) => {
    if (call.name === 'analyze_workflow_draft_edit')
      return {
        decisions: [
          conversationSemantic(
            call,
            {
              kind: 'add-native-node',
              capability: 'split-native-output-array',
            },
            'Split the explicit producer rows without changing values.',
          ),
          conversationSemantic(
            call,
            { kind: 'add-native-node', capability: 'pass-through' },
            'Retain a separate independent pass-through root.',
          ),
          ...(includeProducer
            ? [
                conversationSemantic(
                  call,
                  { kind: 'add-native-node', capability: 'original-context' },
                  'Create rows [3,1] and the explicitly requested literal marker.',
                ),
              ]
            : []),
        ],
      };
    if (call.name === 'generate_draft_native_node_addition') {
      const parameters =
        call.payload.capability.name === 'original-context'
          ? { rows: [3, 1], marker: '={{ literal text }}' }
          : {
              sourceNodeId: call.payload.sourceCandidates.find(
                (source) =>
                  source.kind === 'native' &&
                  source.node.capability === 'original-context',
              ).nodeId,
              pointer: '/rows',
            };
      return {
        decision: {
          status: 'provided',
          parameters,
          sourceMessageIds: call.payload.messages.map((message) => message.id),
        },
      };
    }
    if (call.name === 'plan_draft_connection_edit') {
      const source = call.payload.nativeNodes.find(
        (node) => node.capability === 'original-context',
      );
      const target = call.payload.nativeNodes.find(
        (node) => node.capability === 'split-native-output-array',
      );
      return {
        decisions: [
          {
            kind: 'add',
            source: { nodeId: source.id, port: 'main' },
            target: { nodeId: target.id, port: 'main' },
            ...conversationEvidence(call),
          },
        ],
      };
    }
    throw new Error(`Unexpected registered native planning call ${call.name}`);
  };
}
