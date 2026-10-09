import {
  createApiCatalog,
  resolveApiOperations,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';

export const parents = [
  { id: 'same/parent', amount: 8 },
  { id: 'empty', amount: 2 },
  { id: 'same/parent', amount: 5 },
];
export function childrenFor(parent) {
  return parent.amount === 2
    ? []
    : Array.from({ length: parent.amount === 8 ? 2 : 3 }, (_, index) => ({
        id: 'same/child',
        amount: parent.amount + index,
      }));
}
const itemSchema = {
  type: 'object',
  required: ['id', 'amount'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, amount: { type: 'number' } },
};
const leafSchema = {
  type: 'object',
  required: ['parent', 'child', 'receipt'],
  additionalProperties: false,
  properties: {
    parent: itemSchema,
    child: itemSchema,
    receipt: { type: 'string' },
  },
};
const response = (schema) => ({
  200: {
    description: 'JSON response',
    content: { 'application/json': { schema } },
  },
});
const post = (request, result) => ({
  post: {
    requestBody: {
      required: true,
      content: { 'application/json': { schema: request } },
    },
    responses: response(result),
  },
});
const spec = {
  openapi: '3.1.0',
  info: { title: 'Nested array iteration contract', version: '1' },
  paths: {
    '/parents': {
      get: {
        responses: response({
          type: 'object',
          required: ['parents'],
          additionalProperties: false,
          properties: { parents: { type: 'array', items: itemSchema } },
        }),
      },
    },
    '/children': post(itemSchema, {
      type: 'object',
      required: ['receipt', 'parent', 'children'],
      additionalProperties: false,
      properties: {
        receipt: { type: 'string' },
        parent: itemSchema,
        children: { type: 'array', items: itemSchema },
      },
    }),
    '/inspect': post(leafSchema, leafSchema),
    '/confirm': post(leafSchema, leafSchema),
    '/audit': post(leafSchema, leafSchema),
  },
};
const catalog = await createApiCatalog([{ id: 'nested-service', spec }]);
const operations = await resolveApiOperations(
  catalog,
  catalog.operations.map((entry) => entry.key),
);
export const materials = [
  'parents',
  'children',
  'inspect',
  'confirm',
  'audit',
].map((callId) => ({
  callId,
  operation: operations.find((operation) => operation.path === '/' + callId),
}));
export const capabilities = [
  createResponseArrayCapability({ materials, itemMode: 'linked' }),
  ...createN8nNativeCapabilities({ itemMode: 'linked' }),
];
export const nativeNodes = [
  {
    id: 'each-parent',
    capability: 'split-api-response-array',
    parameters: { sourceNodeId: 'parents', pointer: '/parents' },
  },
  {
    id: 'each-child',
    capability: 'split-api-response-array',
    parameters: { sourceNodeId: 'children', pointer: '/children' },
  },
  {
    id: 'verify-ancestry',
    capability: 'assert-responses',
    parameters: {
      checks: [
        ...['parent', 'child'].map((field) => ({
          left: { source: 'response', nodeId: 'audit', pointer: '/' + field },
          operator: 'equals',
          right: {
            source: 'response',
            nodeId: field === 'parent' ? 'children' : 'inspect',
            pointer: '/' + field,
          },
          message: field + ' ancestry must be preserved',
        })),
        {
          left: { source: 'response', nodeId: 'audit', pointer: '/receipt' },
          operator: 'equals',
          right: {
            source: 'response',
            nodeId: 'children',
            pointer: '/receipt',
          },
          message: 'Intermediate API response ancestry must be preserved',
        },
      ],
    },
  },
];
export const outputs = createNativeOutputContracts({
  nativeNodes,
  capabilities,
});
export const names = Object.fromEntries(
  materials.map((material) => [material.callId, 'Request ' + material.callId]),
);
const binding = (targetPointer, sourceNodeId, sourcePointer) => ({
  kind: 'node-output',
  targetPointer,
  sourceNodeId,
  sourcePointer,
});
export const graphMaterials = materials.map((material) => ({
  operation: material.operation,
  arguments: {
    callId: material.callId,
    values: {},
    unresolvedInputs: [],
    bindings:
      material.callId === 'parents'
        ? []
        : material.callId === 'children'
          ? [binding('/body', 'each-parent', '/item')]
          : material.callId === 'inspect'
            ? [
                binding('/body/parent', 'each-parent', '/item'),
                binding('/body/child', 'each-child', '/item'),
                binding('/body/receipt', 'children', '/receipt'),
              ]
            : [
                binding(
                  '/body',
                  material.callId === 'confirm' ? 'inspect' : 'confirm',
                  '',
                ),
              ],
  },
}));
export const plan = {
  nativeNodes,
  starts: ['parents'],
  gaps: [],
  edges: [
    ['parents', 'each-parent'],
    ['each-parent', 'children'],
    ['children', 'each-child'],
    ['each-child', 'inspect'],
    ['inspect', 'confirm'],
    ['confirm', 'audit'],
    ['audit', 'verify-ancestry'],
  ].map(([from, to]) => ({ from, to, output: 'main', input: 'main' })),
};
export function compileNestedIteration(
  baseUrl = 'https://fixture.test',
  filtered = false,
) {
  const graphPlan = filtered
    ? {
        ...plan,
        nativeNodes: [
          ...nativeNodes,
          {
            id: 'parent-gate',
            capability: 'if',
            parameters: {
              combinator: 'and',
              conditions: [
                {
                  left: {
                    source: 'response',
                    nodeId: 'children',
                    pointer: '/parent/amount',
                  },
                  operator: 'lessThan',
                  right: { source: 'literal', value: 6 },
                },
              ],
            },
          },
        ],
        edges: [
          ...plan.edges.filter((edge) => edge.to !== 'each-child'),
          {
            from: 'children',
            to: 'parent-gate',
            output: 'main',
            input: 'main',
          },
          {
            from: 'parent-gate',
            to: 'each-child',
            output: 'true',
            input: 'main',
          },
        ],
      }
    : plan;
  const sources = createN8nNativeOutputSources({
    nativeNodes: graphPlan.nativeNodes,
    capabilities,
    apiNodeNames: names,
  });
  return compilePlannedN8nWorkflow({
    id: filtered ? 'nested-filtered-array-iteration' : 'nested-array-iteration',
    name: 'Nested array iteration',
    plan: graphPlan,
    materials: graphMaterials,
    capabilities,
    apiNodes: graphMaterials.map((material) =>
      createHttpRequestNode({
        ...material,
        baseUrl,
        credentialBindings: {},
        position: [300, 0],
        apiNodeNames: names,
        nativeOutputSources: sources,
        apiResponseContracts: Object.fromEntries(
          materials.map((source) => [source.callId, source.operation]),
        ),
        ...(material.arguments.callId === 'parents'
          ? {}
          : { itemMode: 'linked' }),
      }),
    ),
  });
}
