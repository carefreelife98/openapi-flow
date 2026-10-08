import {
  createApiCatalog,
  resolveApiOperations,
  createReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  createHttpRequestNode,
} from '@openapi-flow/n8n';

function spec(title, path) {
  return {
    openapi: '3.1.0',
    info: { title, version: '1' },
    paths: {
      [path]: {
        get: {
          parameters: [
            { in: 'query', name: 'mode', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    additionalProperties: false,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export const sources = [
  { id: 'inventory', spec: spec('Public inventory', '/items') },
  { id: 'pricing', spec: spec('Public pricing', '/prices') },
];
export const generationInput = {
  workflowId: 'public-review',
  workflowName: 'Inventory and pricing review',
  scenario: 'Read items and prices, then refund the item',
  sources,
  trace: [],
};
export const edge = (from, to) => ({ from, output: 'main', to, input: 'main' });

export async function compilationInput() {
  const catalog = await createApiCatalog(sources);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const materials = operations.map((operation, index) => ({
    status: 'ready',
    operation,
    arguments: {
      callId: 'call-' + (index + 1),
      values: {},
      bindings: [],
      unresolvedInputs: [],
    },
  }));
  const gaps = [
    {
      id: 'refund',
      stage: 'api-selection',
      description: 'Refund API needs review',
    },
  ];
  const capabilities = createN8nNativeCapabilities();
  const proposal = {
    nativeNodes: [],
    edges: [edge('call-1', 'refund'), edge('refund', 'call-2')],
    additionalGaps: [],
    blockedCalls: [],
  };
  const plan = createReviewableWorkflowGraphPlan({
    materials,
    gaps,
    proposal,
    capabilities,
  });
  return {
    id: generationInput.workflowId,
    name: generationInput.workflowName,
    materials,
    capabilities,
    plan,
    apiNodes: materials.map((item, index) =>
      createHttpRequestNode({
        ...item,
        baseUrl: 'https://example.test',
        position: [300, index * 200],
      }),
    ),
  };
}

export function scriptedReviewModel(mode = 'selection-gap') {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push(options.name);
          const payload = JSON.parse(messages[1].content);
          let output;
          if (options.name === 'select_api_operations') {
            output = {
              operations: payload.candidates.map((candidate) => ({
                candidateId: candidate.candidateId,
                purpose: 'Read ' + candidate.path,
              })),
              gaps:
                mode === 'selection-gap'
                  ? [
                      {
                        description: 'Refund API needs review',
                      },
                    ]
                  : [],
            };
            if (mode === 'invalid-selection')
              output.operations[0].candidateId = 'unknown';
          } else if (options.name === 'plan_api_bindings') {
            output = {
              calls: payload.materials.map((material) => ({
                callId: material.callId,
                bindings: [],
              })),
              gaps:
                mode === 'binding-gap'
                  ? [
                      {
                        callId: payload.materials[1].callId,
                        targetPointer: '/query/mode',
                        description:
                          'Request needs an unavailable transformation',
                      },
                    ]
                  : [],
            };
          } else if (options.name === 'generate_api_arguments') {
            output = { values: {} };
          } else if (options.name === 'plan_workflow_graph') {
            const ids = payload.materials.map((item) => item.arguments.callId);
            output = {
              additionalNativeNodes: [],
              edges: [edge(ids[0], ids[1])],
              gaps:
                mode === 'graph-gap'
                  ? [{ description: 'Refund requirement is not implemented' }]
                  : [],
            };
            if (mode === 'invalid-graph') output.edges[0].from = 'unknown';
          } else if (options.name === 'plan_reviewable_workflow_graph') {
            const ids = payload.materials.map((item) =>
              item.status === 'ready' ? item.arguments.callId : item.callId,
            );
            const gapIds = payload.gaps.map((gap) => gap.id);
            output = {
              additionalNativeNodes: [],
              edges: [],
              additionalGaps: [],
              blockedCalls: [],
            };
            const chain = [ids[0], ...gapIds, ...ids.slice(1)];
            output.edges = chain
              .slice(1)
              .map((id, index) => edge(chain[index], id));
            if (mode === 'graph-gap') {
              output.additionalGaps = [
                {
                  id: 'refund-step',
                  description: 'No registered refund capability',
                },
              ];
              output.additionalNativeNodes = [
                {
                  id: 'review-stop',
                  capability: 'stop-and-error',
                  parameters: { message: 'Explicit scenario failure' },
                },
              ];
              output.edges.push(
                edge(ids.at(-1), 'refund-step'),
                edge('refund-step', 'review-stop'),
              );
            }
            if (mode === 'invalid-graph') output.edges[0].from = 'unknown';
          } else throw new Error('Unexpected model call: ' + options.name);
          if (mode !== 'invalid-selection') schema.parse(output);
          return output;
        },
      };
    },
  };
}
