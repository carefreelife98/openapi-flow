import assert from 'node:assert/strict';
import { apiLiteralSourcesFromMessages } from './api-literal-source-selections.mjs';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
} from '@openapi-flow/core';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import {
  conversationSemantic,
  conversationEvidence,
} from './workflow-draft-conversation-fixture.mjs';

export async function requestMediaDecisionFixture(
  mediaTypes = ['application/x-www-form-urlencoded', 'application/json'],
) {
  const bodySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'count'],
    properties: {
      label: { type: 'string', description: 'User-provided label' },
      count: { type: 'integer', minimum: 1 },
    },
  };
  const spec = {
    openapi: '3.1.1',
    info: { title: 'Request media decisions', version: '1' },
    paths: {
      '/validate': {
        post: {
          summary: 'Validate a label and count without persisting them',
          ...(mediaTypes === null
            ? {}
            : {
                requestBody: {
                  required: true,
                  content: Object.fromEntries(
                    mediaTypes.map((type) => [type, { schema: bodySchema }]),
                  ),
                },
              }),
          responses: {
            200: {
              description: 'Validation result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { valid: { type: 'boolean' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'media-decision', spec }]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return {
    spec,
    catalog,
    operation,
    scenario: '검증 API에 label은 "fixture-label", count는 숫자 3으로 보내줘.',
  };
}

export function requestMediaDecisionModel(output, observe = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          await observe({ schema, options, payload });
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

export async function requestMediaConversationFixture({
  model,
  includeExplanations = true,
  deployments,
} = {}) {
  const f = await requestMediaDecisionFixture();
  const context = { operations: [f.operation], capabilities: [], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'media-draft',
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      requirements: [],
    },
  });
  const checkpointer = new MemorySaver();
  const graph = createWorkflowDraftConversationGraph({
    context,
    model,
    checkpointer,
    name: 'Request media provenance',
    reviewPolicy: 'automatic',
    includeExplanations,
    ...(deployments === undefined ? {} : { deployments }),
  });
  return {
    ...f,
    context,
    draft,
    graph,
    checkpointer,
    config: { configurable: { thread_id: randomUUID() }, recursionLimit: 100 },
  };
}

export function requestMediaConversationModel(choice) {
  const calls = [];
  return {
    calls,
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
          const enabled =
            call.payload.includeExplanations === true ||
            call.payload.options?.includeExplanations === true;
          const apiEvidence = () => ({
            sourceMessageIds: call.payload.messages.map(
              (message) => message.id,
            ),
            ...(enabled
              ? {
                  explanation: {
                    reason: 'The request explicitly supplies this decision.',
                    evidence: call.payload.messages.map((message) => ({
                      kind: 'message',
                      messageId: message.id,
                    })),
                  },
                }
              : {}),
          });
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'add-api-call',
                  operation: call.payload.candidates[0].candidateId,
                }),
              ],
            };
          if (call.name === 'select_api_request_media_type') {
            const withReason = Object.hasOwn(schema.properties, 'explanation');
            return {
              requestMediaType: choice,
              ...(withReason
                ? {
                    explanation: {
                      reason:
                        choice === null
                          ? '요청이 형식을 지정하지 않았습니다.'
                          : '요청한 형식이 OAS에 선언되어 있습니다.',
                    },
                  }
                : {}),
            };
          }
          if (call.name === 'plan_draft_api_call_bindings')
            return {
              decision: {
                status: 'provided',
                ...(call.payload.sourceCandidates.length
                  ? { mappings: [] }
                  : {}),
                ...apiEvidence(),
              },
            };
          if (call.name === 'generate_draft_api_call_arguments')
            return {
              values: { body: { label: 'fixture-label', count: 3 } },
              literalSources: apiLiteralSourcesFromMessages(
                { body: { label: 'fixture-label', count: 3 } },
                [...call.payload.messages, ...call.payload.backgroundMessages],
              ),
              ...apiEvidence(),
            };
          if (call.name === 'plan_draft_connection_edit')
            return {
              decisions: [
                { kind: 'keep-connections', ...conversationEvidence(call) },
              ],
            };
          throw new Error(`Unexpected media conversation stage ${call.name}`);
        },
      };
    },
  };
}
