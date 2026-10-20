import { apiLiteralSourcesFromMessages } from './api-literal-source-selections.mjs';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';

export const responseSourceBranches = [
  {
    path: '/profiles/{personId}',
    name: 'personId',
    in: 'path',
    targetPointer: '/path/personId',
    sourcePointer: '/accountId',
    response: { name: { type: 'string' } },
  },
  {
    path: '/email/{mailbox}',
    name: 'mailbox',
    in: 'path',
    targetPointer: '/path/mailbox',
    sourcePointer: '/email',
    response: { valid: { type: 'boolean' } },
  },
  {
    path: '/addresses',
    name: 'owner',
    in: 'query',
    targetPointer: '/query/owner',
    sourcePointer: '/accountId',
    response: { count: { type: 'integer' } },
  },
  {
    path: '/history/{personId}',
    name: 'personId',
    in: 'path',
    targetPointer: '/path/personId',
    sourcePointer: '/accountId',
    response: { total: { type: 'integer' } },
  },
];
export const responseSourceScenario =
  '두 OAS를 사용해 seedId 문자열 "seed"로 원본 회원 조회 API GET /seed/{seedId}를 호출하는 워크플로우를 만들어줘. 응답 enabled가 boolean true일 때만 IF의 true 출력에서 프로필·이메일·주소·이력 API 네 개를 독립적으로 실행해줘. IF 결합 방식은 and야. 프로필과 이력의 personId 및 주소의 owner에는 원본 응답 accountId를 그대로 사용하고, 이메일 mailbox에는 원본 응답 email을 그대로 사용해. 최초 seedId는 후속 입력에 사용하지 마. 네 분기를 Merge append의 서로 다른 네 입력으로 모은 다음 pass-through를 연결해줘. 요청하지 않은 값은 추가하지 마.';

function responseOperation(properties) {
  return {
    responses: {
      200: {
        description: 'Declared fixture response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties,
              required: Object.keys(properties),
              additionalProperties: false,
            },
          },
        },
      },
    },
  };
}
export async function apiResponseSourcesFixture({
  withNative = true,
  text = responseSourceScenario,
} = {}) {
  const catalog = await createApiCatalog([
    {
      id: 'directory-source',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Directory source', version: '1' },
        paths: {
          '/seed/{seedId}': {
            get: {
              ...responseOperation({
                accountId: { type: 'string' },
                email: { type: 'string' },
                enabled: { type: 'boolean' },
              }),
              summary:
                'Load original member identity and email by the supplied seed ID',
              parameters: [
                {
                  name: 'seedId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
            },
          },
        },
      },
    },
    {
      id: 'directory-follow-ups',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Directory follow-ups', version: '1' },
        paths: Object.fromEntries(
          responseSourceBranches.map((branch) => [
            branch.path,
            {
              get: {
                ...responseOperation(branch.response),
                summary: `Read ${branch.path} using the original member response, not the initial seed`,
                parameters: [
                  {
                    name: branch.name,
                    in: branch.in,
                    required: true,
                    schema: { type: 'string' },
                  },
                ],
              },
            },
          ]),
        ),
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const context = {
    operations,
    capabilities: resolveN8nNativeFeatures({
      features: withNative
        ? [
            N8nNativeFeature.If,
            N8nNativeFeature.MergeAppend,
            N8nNativeFeature.PassThrough,
          ]
        : [],
    }).capabilities,
    messages: [{ id: 'request-1', text }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'all-selected-response-contracts',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const byPath = new Map(
    operations.map((operation) => [operation.path, operation]),
  );
  const decisions = [
    ...(withNative
      ? [
          {
            kind: 'add-native-node',
            capability: 'if',
            instruction:
              'Compare the original seed API response enabled to literal boolean true with combinator and.',
          },
          {
            kind: 'add-native-node',
            capability: 'merge-append',
            instruction:
              'Wait for the four independent branches using four distinct inputs.',
          },
          {
            kind: 'add-native-node',
            capability: 'pass-through',
            instruction: 'Pass through the joined results unchanged.',
          },
        ]
      : []),
    ...responseSourceBranches.map((branch) => ({
      kind: 'add-api-call',
      operation: byPath.get(branch.path).key,
      instruction: `Call ${branch.path}; bind ${branch.targetPointer} from the original seed API response ${branch.sourcePointer}.`,
    })),
    {
      kind: 'add-api-call',
      operation: byPath.get('/seed/{seedId}').key,
      instruction:
        'Call the original seed API using literal seedId "seed". No predecessor data.',
    },
  ].map((decision) => ({
    ...decision,
    sources: [{ kind: 'message', messageId: 'request-1', quote: text }],
  }));
  const input = { draft, context, requestMessageIds: ['request-1'] };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: { decisions },
  });
  return { ...input, plan, resolutions: [], byPath, decisions };
}

export function responseSourcesModel() {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          const message = payload.messages.at(-1);
          const sources = [{ kind: 'message', messageId: message.id }];
          if (options.name === 'analyze_workflow_draft_edit') {
            const candidate = (path) =>
              payload.candidates.find((item) => item.operation.path === path)
                .candidateId;
            return {
              decisions: [
                {
                  kind: 'add-native-node',
                  capability: 'if',
                  instruction:
                    'Compare original seed response enabled to true using combinator and.',
                  sources,
                },
                {
                  kind: 'add-native-node',
                  capability: 'merge-append',
                  instruction:
                    'Wait for four independent branches on four distinct inputs.',
                  sources,
                },
                {
                  kind: 'add-native-node',
                  capability: 'pass-through',
                  instruction: 'Pass the joined results unchanged.',
                  sources,
                },
                ...responseSourceBranches.map((branch) => ({
                  kind: 'add-api-call',
                  operation: candidate(branch.path),
                  instruction: `Call ${branch.path} with ${branch.targetPointer} bound to the original seed response ${branch.sourcePointer}.`,
                  sources,
                })),
                {
                  kind: 'add-api-call',
                  operation: candidate('/seed/{seedId}'),
                  instruction:
                    'Use the explicitly supplied literal seedId "seed" without predecessor data.',
                  sources,
                },
              ],
            };
          }
          if (options.name === 'generate_draft_native_node_addition') {
            const parameters =
              payload.capability.name === 'merge-append'
                ? { numberInputs: 4 }
                : {
                    combinator: 'and',
                    conditions: [
                      {
                        left: {
                          source: 'response',
                          nodeId: payload.sourceCandidates.find(
                            (item) =>
                              item.kind === 'api' &&
                              item.operation.path === '/seed/{seedId}',
                          ).nodeId,
                          pointer: '/enabled',
                        },
                        operator: 'equals',
                        right: { source: 'literal', value: true },
                      },
                    ],
                  };
            return {
              decision: {
                status: 'provided',
                parameters,
                sourceMessageIds: [message.id],
              },
            };
          }
          if (options.name === 'plan_draft_api_call_bindings') {
            const branch = responseSourceBranches.find(
              (item) => item.path === payload.operation.path,
            );
            return {
              decision: {
                status: 'provided',
                mappings: branch
                  ? [
                      {
                        targetPointer: branch.targetPointer,
                        sourceNodeId: payload.sourceCandidates.find(
                          (item) =>
                            item.kind === 'api' &&
                            item.operation.path === '/seed/{seedId}',
                        ).nodeId,
                        sourcePointer: branch.sourcePointer,
                      },
                    ]
                  : [],
                sourceMessageIds: [message.id],
              },
            };
          }
          if (options.name === 'generate_draft_api_call_arguments')
            return {
              values: { path: { seedId: 'seed' } },
              literalSources: apiLiteralSourcesFromMessages(
                { path: { seedId: 'seed' } },
                [...payload.messages, ...payload.backgroundMessages],
              ),
              sourceMessageIds: [message.id],
            };
          if (options.name === 'plan_draft_connection_edit') {
            const api = (path) =>
              payload.apiInstances.find((item) => item.path === path).nodeId;
            const native = (name) =>
              payload.nativeNodes.find((item) => item.capability === name).id;
            const edges = [
              {
                from: api('/seed/{seedId}'),
                output: 'main',
                to: native('if'),
                input: 'main',
              },
              ...responseSourceBranches.flatMap((branch, index) => [
                {
                  from: native('if'),
                  output: 'true',
                  to: api(branch.path),
                  input: 'main',
                },
                {
                  from: api(branch.path),
                  output: 'main',
                  to: native('merge-append'),
                  input: `input${index + 1}`,
                },
              ]),
              {
                from: native('merge-append'),
                output: 'main',
                to: native('pass-through'),
                input: 'main',
              },
            ];
            return {
              decisions: edges.map((edge) => ({
                kind: 'add',
                source: { nodeId: edge.from, port: edge.output },
                target: { nodeId: edge.to, port: edge.input },
                sources,
              })),
            };
          }
          throw new Error(
            `Unexpected all-selected response stage ${options.name}`,
          );
        },
      };
    },
  };
}
