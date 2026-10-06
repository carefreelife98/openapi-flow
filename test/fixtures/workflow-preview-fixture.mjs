import { createApiCatalog } from '@openapi-flow/core';

function spec(title, path) {
  return {
    openapi: '3.1.0',
    info: { title, version: '1' },
    servers: [{ url: 'https://not-for-preview.example.test' }],
    paths: {
      [path]: {
        get: {
          responses: {
            200: {
              description: 'Success',
              content: {
                'application/json': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  };
}

export const sources = [
  { id: 'inventory', spec: spec('Public inventory fixture', '/items') },
  { id: 'pricing', spec: spec('Public pricing fixture', '/prices') },
];

export const generationInput = {
  workflowId: 'public-review-preview',
  workflowName: 'Inventory and pricing review',
  scenario: 'Read items and prices, then refund the item',
  sources,
  trace: [],
};

export async function previewInput() {
  const catalog = await createApiCatalog(sources);
  return {
    id: generationInput.workflowId,
    name: generationInput.workflowName,
    scenario: generationInput.scenario,
    catalog,
    selection: {
      operations: catalog.operations.map((operation) => ({
        key: operation.key,
        purpose: 'Read ' + operation.path,
      })),
      gaps: [
        { kind: 'missing_operation', description: 'Refund API needs review' },
      ],
    },
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
                        kind: 'missing_operation',
                        description: 'Refund API needs review',
                        candidateId: null,
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
                  ? [{ description: 'Request needs an unavailable transform' }]
                  : [],
            };
          } else if (options.name === 'generate_api_arguments') {
            output = { values: {} };
          } else if (options.name === 'plan_workflow_graph') {
            const ids = payload.materials.map((item) => item.arguments.callId);
            output = {
              nativeNodes: [],
              edges: ids.slice(1).map((id, index) => ({
                from: ids[index],
                output: 'main',
                to: id,
                input: 'main',
              })),
              gaps:
                mode === 'graph-gap'
                  ? [{ description: 'No registered refund capability' }]
                  : [],
            };
            if (mode === 'graph-gap') {
              output.nativeNodes = [
                {
                  id: 'review-stop',
                  capability: 'stop-and-error',
                  parameters: { message: 'not copied into preview' },
                },
              ];
              output.edges.push({
                from: 'unresolved-api',
                output: 'main',
                to: 'review-stop',
                input: 'main',
              });
            }
            if (mode === 'invalid-graph') output.edges[0].from = 'unknown';
          } else {
            throw new Error('Unexpected model call: ' + options.name);
          }
          if (mode !== 'invalid-selection') schema.parse(output);
          return output;
        },
      };
    },
  };
}
