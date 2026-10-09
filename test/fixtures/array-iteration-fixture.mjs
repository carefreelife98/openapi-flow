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
  createResponseCollectionCapability,
} from '@openapi-flow/n8n';

export const itemSchema = {
  type: 'object',
  required: ['id', 'amount'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    amount: { type: 'number', minimum: 0 },
  },
};
const receiptSchema = {
  type: 'object',
  required: ['receipt', 'input'],
  additionalProperties: false,
  properties: { receipt: { type: 'string' }, input: itemSchema },
};
const response = (schema) => ({
  200: {
    description: 'JSON response',
    content: { 'application/json': { schema } },
  },
});
export const spec = {
  openapi: '3.1.0',
  info: { title: 'Item iteration contract', version: '1' },
  paths: {
    '/records': {
      get: {
        responses: response({
          type: 'object',
          required: ['records'],
          additionalProperties: false,
          properties: { records: { type: 'array', items: itemSchema } },
        }),
      },
    },
    '/details': {
      post: {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: itemSchema } },
        },
        responses: response(receiptSchema),
      },
    },
    '/confirm/{receipt}': {
      post: {
        parameters: [
          {
            in: 'path',
            name: 'receipt',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: itemSchema } },
        },
        responses: response(itemSchema),
      },
    },
    '/submit': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'array', items: itemSchema },
            },
          },
        },
        responses: response({
          type: 'object',
          required: ['accepted'],
          properties: { accepted: { type: 'integer' } },
        }),
      },
    },
  },
};
const catalog = await createApiCatalog([{ id: 'iteration-service', spec }]);
const contracts = await resolveApiOperations(
  catalog,
  catalog.operations.map((entry) => entry.key),
);
const refs = {
  records: '/records',
  details: '/details',
  confirm: '/confirm/{receipt}',
};
export const materials = Object.entries(refs).map(([callId, path]) => ({
  callId,
  operation: contracts.find((operation) => operation.path === path),
}));
export const capabilities = [
  createResponseArrayCapability({ materials }),
  ...createN8nNativeCapabilities({ itemMode: 'linked' }),
];
export const nativeNodes = [
  {
    id: 'each-record',
    capability: 'split-api-response-array',
    parameters: { sourceNodeId: 'records', pointer: '/records' },
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
      material.callId === 'records'
        ? []
        : material.callId === 'details'
          ? [binding('/body', 'each-record', '/item')]
          : [
              binding('/path/receipt', 'details', '/receipt'),
              binding('/body', 'each-record', '/item'),
            ],
  },
}));
export const plan = {
  nativeNodes,
  starts: ['records'],
  gaps: [],
  edges: [
    ['records', 'each-record'],
    ['each-record', 'details'],
    ['details', 'confirm'],
  ].map(([from, to]) => ({ from, to, output: 'main', input: 'main' })),
};
export const sources = createN8nNativeOutputSources({
  nativeNodes,
  capabilities,
  apiNodeNames: names,
});
export function requestNode(callId, baseUrl = 'https://fixture.test') {
  const material = graphMaterials.find(
    (material) => material.arguments.callId === callId,
  );
  return createHttpRequestNode({
    ...material,
    baseUrl,
    credentialBindings: {},
    position: [300, 0],
    apiNodeNames: names,
    nativeOutputSources: sources,
    apiResponseContracts: Object.fromEntries(
      materials.map((source) => [source.callId, source.operation]),
    ),
    ...(callId === 'records' ? {} : { itemMode: 'linked' }),
  });
}
export function compileIteration(baseUrl = 'https://fixture.test') {
  return compileScenario(baseUrl, false);
}
export function compileConditionalIteration(baseUrl = 'https://fixture.test') {
  return compileScenario(baseUrl, true);
}
export function compileCollectedIteration(
  baseUrl = 'https://fixture.test',
  conditional = false,
) {
  return compileScenario(baseUrl, conditional, true);
}
function compileScenario(baseUrl, conditional, collected = false) {
  const collection = {
    id: 'collected-results',
    capability: 'collect-api-responses',
    parameters: { sourceNodeId: 'confirm', pointer: '' },
  };
  const assertion = {
    id: 'verify-item',
    capability: 'assert-responses',
    parameters: {
      checks: [
        {
          left: { source: 'response', nodeId: 'confirm', pointer: '/amount' },
          operator: 'equals',
          right: {
            source: 'response',
            nodeId: 'details',
            pointer: '/input/amount',
          },
          message: 'Current item amount must be preserved',
        },
      ],
    },
  };
  const gate = {
    id: 'amount-gate',
    capability: 'if',
    parameters: {
      combinator: 'and',
      conditions: [
        {
          left: {
            source: 'response',
            nodeId: 'details',
            pointer: '/input/amount',
          },
          operator: 'greaterThan',
          right: { source: 'literal', value: 3 },
        },
      ],
    },
  };
  const graphPlan = {
    ...plan,
    nativeNodes: [
      ...plan.nativeNodes,
      ...(conditional ? [gate] : []),
      assertion,
      ...(collected ? [collection] : []),
    ],
    edges: [
      ...plan.edges.filter((edge) => !conditional || edge.to !== 'confirm'),
      ...(conditional
        ? [
            {
              from: 'details',
              output: 'main',
              to: 'amount-gate',
              input: 'main',
            },
            {
              from: 'amount-gate',
              output: 'true',
              to: 'confirm',
              input: 'main',
            },
          ]
        : []),
      { from: 'confirm', output: 'main', to: 'verify-item', input: 'main' },
      ...(collected
        ? [
            {
              from: 'verify-item',
              output: 'main',
              to: 'collected-results',
              input: 'main',
            },
            {
              from: 'collected-results',
              output: 'main',
              to: 'submit',
              input: 'main',
            },
          ]
        : []),
    ],
  };
  const registered = collected
    ? [...capabilities, createResponseCollectionCapability({ materials })]
    : capabilities;
  const selected = collected
    ? [
        ...graphMaterials,
        {
          operation: contracts.find(
            (operation) => operation.path === '/submit',
          ),
          arguments: {
            callId: 'submit',
            values: {},
            unresolvedInputs: [],
            bindings: [binding('/body', 'collected-results', '/items')],
          },
        },
      ]
    : graphMaterials;
  const requestFragments = materials.map((material) =>
    requestNode(material.callId, baseUrl),
  );
  if (collected)
    requestFragments.push(
      createHttpRequestNode({
        ...selected.at(-1),
        baseUrl,
        credentialBindings: {},
        position: [1000, 0],
        nativeOutputSources: createN8nNativeOutputSources({
          nativeNodes: graphPlan.nativeNodes,
          capabilities: registered,
          apiNodeNames: names,
        }),
      }),
    );
  return compilePlannedN8nWorkflow({
    id: collected
      ? conditional
        ? 'array-conditional-collection'
        : 'array-collection'
      : conditional
        ? 'array-conditional'
        : 'array-iteration',
    name: 'Array iteration',
    plan: graphPlan,
    materials: selected,
    capabilities: registered,
    apiNodes: requestFragments,
  });
}
