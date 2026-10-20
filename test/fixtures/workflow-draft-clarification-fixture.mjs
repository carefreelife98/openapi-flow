import { apiLiteralSourcesFromMessages } from './api-literal-source-selections.mjs';
import {
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftClarificationScopes,
  resolveWorkflowDraftClarificationScopes,
} from '@openapi-flow/core';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import { apiResponseSourcesFixture } from './workflow-draft-api-response-sources-fixture.mjs';
import { clarificationLimits } from './workflow-clarification-fixture.mjs';

export const draftClarificationRequest =
  '원본 회원 정보를 seedId 문자열 "seed"로 조회하는 워크플로우를 만들어줘. 주소 조회도 붙일지 아직 정하지 않았어.';
export function draftClarificationProposal(message, withQuestion = true) {
  return {
    statements: [
      {
        text: '원본 회원 정보를 seedId 문자열 "seed"로 조회한다.',
        sources: [
          { kind: 'message', messageId: message.id, quote: message.text },
        ],
      },
    ],
    categories: withQuestion
      ? [
          {
            title: '후속 조회',
            questions: [
              {
                message: '원본 응답의 회원 식별자로 주소 조회도 추가할까요?',
                answer: {
                  kind: 'single-choice',
                  choices: [
                    { label: '주소 조회 추가' },
                    { label: '원본 조회만' },
                  ],
                },
              },
            ],
          },
        ]
      : [],
  };
}
export async function draftClarificationFixture({
  reply = 'defer',
  withQuestion = true,
} = {}) {
  const base = await apiResponseSourcesFixture({
    withNative: false,
    text: draftClarificationRequest,
  });
  const originalContext = {
    ...base.context,
    entrypoint: describeN8nManualTrigger(),
  };
  const round = createWorkflowClarificationRound({
    context: originalContext,
    limits: clarificationLimits,
    options: { includeExplanations: false, includeSuggestions: false },
    proposal: draftClarificationProposal(
      originalContext.messages[0],
      withQuestion,
    ),
  });
  const question = round.categories[0]?.questions[0];
  const replies =
    !question || reply === 'pending'
      ? []
      : [
          reply === 'defer'
            ? { kind: 'defer', questionId: question.id }
            : {
                kind: 'single-choice',
                questionId: question.id,
                choiceId: question.answer.choices[0].id,
              },
        ];
  const resolution = resolveWorkflowClarificationReplies({
    context: originalContext,
    round,
    replies,
  });
  const clarification = prepareWorkflowDraftClarification({
    context: originalContext,
    round,
    resolution,
  });
  const context = {
    ...originalContext,
    clarification,
    messages: [...originalContext.messages, ...clarification.answerMessages],
  };
  const input = {
    draft: base.draft,
    context,
    requestMessageIds: context.messages.map((message) => message.id),
  };
  const decisions = [
    {
      kind: 'add-api-call',
      operation: base.byPath.get('/seed/{seedId}').key,
      instruction:
        'Use explicitly supplied literal seedId string seed for the original member lookup.',
    },
    ...(withQuestion
      ? [
          {
            kind: 'add-api-call',
            operation: base.byPath.get('/addresses').key,
            instruction:
              'Use original response accountId as query owner for the requested address lookup, once that decision is confirmed.',
          },
        ]
      : []),
  ].map((decision) => ({
    ...decision,
    sources: [
      {
        kind: 'message',
        messageId: 'request-1',
        quote: draftClarificationRequest,
      },
    ],
  }));
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: { decisions },
  });
  const scopeInput = { ...input, plan };
  const description = describeWorkflowDraftClarificationScopes(scopeInput);
  const rootId = plan.steps[0].newNodeId;
  const addressId = plan.steps[1]?.newNodeId;
  const scopes = Object.fromEntries(
    description.requirements.map((requirement) => [
      requirement.id,
      {
        scope: {
          kind: 'nodes',
          nodeIds: [
            requirement.origin.sourceId === round.statements[0].id
              ? rootId
              : addressId,
          ],
        },
      },
    ]),
  );
  const clarificationScopes = resolveWorkflowDraftClarificationScopes({
    ...scopeInput,
    fingerprint: description.fingerprint,
    proposal: { scopes },
  });
  return {
    ...scopeInput,
    originalContext,
    round,
    resolution,
    clarification,
    clarificationScopes,
    resolutions: [],
    rootId,
    addressId,
    question,
    byPath: base.byPath,
  };
}

export function draftClarificationModel({ withQuestion = true } = {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          if (options.name === 'clarify_workflow_requirements')
            return modelMessageEvidenceSelections(
              draftClarificationProposal(payload.messages.at(-1), withQuestion),
            );
          if (options.name === 'analyze_workflow_draft_edit') {
            const source = payload.messages.find(
              (message) => message.id === payload.requestMessageIds[0],
            );
            return {
              decisions: [
                {
                  kind: 'add-api-call',
                  operation: payload.candidates.find(
                    (candidate) =>
                      candidate.operation.path === '/seed/{seedId}',
                  ).candidateId,
                  instruction:
                    'Use explicitly supplied seedId string seed for original member lookup.',
                },
                ...(withQuestion &&
                payload.clarification.deferredQuestions.length === 0
                  ? [
                      {
                        kind: 'add-api-call',
                        operation: payload.candidates.find(
                          (candidate) =>
                            candidate.operation.path === '/addresses',
                        ).candidateId,
                        instruction:
                          'Use original response accountId as address query owner after the clarified address decision is confirmed.',
                      },
                    ]
                  : []),
              ].map((decision) => ({
                ...decision,
                sources: [{ kind: 'message', messageId: source.id }],
              })),
            };
          }
          if (options.name === 'scope_workflow_draft_clarification') {
            const root = payload.nodes.find(
              (node) =>
                node.kind === 'api' &&
                node.instruction !== undefined &&
                node.operation.path === '/seed/{seedId}',
            );
            const address = payload.nodes.find(
              (node) =>
                node.kind === 'api' && node.operation.path === '/addresses',
            );
            return {
              scopes: Object.fromEntries(
                payload.requirements.map((requirement, index) => [
                  requirement.id,
                  {
                    scope:
                      index !== 0 && address === undefined
                        ? { kind: 'unselected-work' }
                        : {
                            kind: 'nodes',
                            nodeIds: [index === 0 ? root.id : address.id],
                          },
                  },
                ]),
              ),
            };
          }
          if (options.name === 'plan_draft_api_call_bindings') {
            const mappings =
              payload.operation.path === '/addresses'
                ? [
                    {
                      targetPointer: '/query/owner',
                      sourceNodeId: payload.sourceCandidates.find(
                        (source) =>
                          source.kind === 'api' &&
                          source.operation.path === '/seed/{seedId}',
                      ).nodeId,
                      sourcePointer: '/accountId',
                    },
                  ]
                : [];
            return {
              decision: {
                status: 'provided',
                ...(payload.sourceCandidates.length ? { mappings } : {}),
                sourceMessageIds: [payload.messages[0].id],
              },
            };
          }
          if (options.name === 'generate_draft_api_call_arguments') {
            if (payload.operation.path !== '/seed/{seedId}')
              throw new Error(
                'A wholly bound consumer must not ask the literal model',
              );
            return {
              values: { path: { seedId: 'seed' } },
              literalSources: apiLiteralSourcesFromMessages(
                { path: { seedId: 'seed' } },
                [...payload.messages, ...payload.backgroundMessages],
              ),
              sourceMessageIds: [payload.messages[0].id],
            };
          }
          if (options.name === 'plan_draft_connection_edit') {
            const source = payload.messages[0];
            const sources = [{ kind: 'message', messageId: source.id }];
            if (!withQuestion)
              return { decisions: [{ kind: 'keep-connections', sources }] };
            return {
              decisions: [
                {
                  kind: 'add',
                  source: {
                    nodeId: payload.apiInstances.find(
                      (call) => call.path === '/seed/{seedId}',
                    ).nodeId,
                    port: 'main',
                  },
                  target: {
                    nodeId: payload.apiInstances.find(
                      (call) => call.path === '/addresses',
                    ).nodeId,
                    port: 'main',
                  },
                  sources,
                },
              ],
            };
          }
          throw new Error(
            `Unexpected draft clarification stage ${options.name}`,
          );
        },
      };
    },
  };
}
export { clarificationLimits };
import { modelMessageEvidenceSelections } from './model-message-evidence-selections.mjs';
