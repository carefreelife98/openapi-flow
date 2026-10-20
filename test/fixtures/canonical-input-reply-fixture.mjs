import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
} from '@openapi-flow/core';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { clarificationSpec } from './api-clarification-fixture.mjs';
import { jsonInputSource } from './api-input-source-selection-fixture.mjs';
import {
  conversationSemantic,
  conversationEvidence,
} from './workflow-draft-conversation-fixture.mjs';

export async function canonicalInputReplyFixture({
  twoInputs = false,
  includeExplanations = true,
  extract,
  model: actualModel,
  spec = clarificationSpec,
  deployments,
  capabilities = [],
  allowRuntimeParameters = false,
} = {}) {
  const source = globalThis.structuredClone(spec);
  if (twoInputs)
    source.paths['/members/{id}'].get.parameters.push({
      in: 'header',
      name: 'tenant',
      required: true,
      schema: { type: 'string' },
    });
  const catalog = await createApiCatalog([{ id: 'source', spec: source }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const context = { operations, capabilities, messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'canonical-input-reply',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const calls = [];
  const model =
    actualModel === undefined
      ? {
          withStructuredOutput(schema, options) {
            return {
              async invoke(messages) {
                const payload = JSON.parse(messages[1].content);
                const call = { schema, options, name: options.name, payload };
                calls.push(call);
                if (options.name === 'analyze_workflow_draft_edit')
                  return {
                    decisions: [
                      conversationSemantic(call, {
                        kind: 'add-api-call',
                        operation: payload.candidates[0].candidateId,
                      }),
                    ],
                  };
                if (options.name === 'extract_api_input_answers') {
                  const selections =
                    extract === undefined
                      ? payload.reply === '없어요.'
                        ? []
                        : [
                            {
                              requirementId: payload.questions.find(
                                (question) =>
                                  question.targetPointer === '/path/id',
                              ).id,
                              source: jsonInputSource(payload, '"member-01"'),
                            },
                          ]
                      : extract(call);
                  return {
                    answers: selections.map((selection) => ({
                      ...selection,
                      ...(includeExplanations
                        ? {
                            reason:
                              '현재 답변에 해당 입력값이 명시되어 있습니다.',
                          }
                        : {}),
                    })),
                    ...(includeExplanations
                      ? {
                          reason: '답변에 명시된 현재 API 입력만 선택했습니다.',
                        }
                      : {}),
                  };
                }
                const evidence = conversationEvidence(call);
                const apiEvidence = {
                  sourceMessageIds: evidence.sources.map(
                    (entry) => entry.messageId,
                  ),
                  ...(evidence.explanation === undefined
                    ? {}
                    : { explanation: evidence.explanation }),
                };
                if (options.name === 'plan_draft_api_call_bindings')
                  return {
                    decision: {
                      status: 'provided',
                      ...(payload.sourceCandidates.length
                        ? { mappings: [] }
                        : {}),
                      ...apiEvidence,
                    },
                  };
                if (options.name === 'generate_draft_api_call_arguments')
                  return { values: {}, ...apiEvidence };
                if (options.name === 'plan_draft_connection_edit')
                  return {
                    decisions: [
                      {
                        kind: 'keep-connections',
                        ...conversationEvidence(call),
                      },
                    ],
                  };
                throw new Error(`Unexpected model stage ${options.name}`);
              },
            };
          },
        }
      : actualModel;
  const dependencies = {
    context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Natural API input replies',
    reviewPolicy: 'review',
    includeExplanations,
    allowRuntimeParameters,
    ...(deployments === undefined ? {} : { deployments }),
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: randomUUID() },
    recursionLimit: 160,
  };
  const resume = (state, response) =>
    graph.invoke(
      new Command({
        resume: { token: state.__interrupt__[0].value.token, ...response },
      }),
      config,
    );
  return { draft, context, graph, model, config, calls, dependencies, resume };
}

export async function pauseCanonicalInputReply(
  fixture,
  text = '회원 간단 정보를 조회하는 워크플로우를 만들어줘.',
) {
  const selected = await fixture.graph.invoke(
    {
      input: {
        initialDraft: fixture.draft,
        request: {
          id: 'short-request',
          text,
          expectedRevision: fixture.draft.revision,
        },
      },
    },
    fixture.config,
  );
  const pending = await fixture.resume(selected, { action: 'approve' });
  return { selected, pending };
}
