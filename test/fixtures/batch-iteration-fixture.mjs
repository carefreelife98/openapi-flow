import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createResponseCollectionCapability,
  createN8nNativeCapabilities,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compileBatchedN8nWorkflow,
} from '@openapi-flow/n8n';
import { spec as arraySpec, itemSchema } from './array-iteration-fixture.mjs';

const spec = {
  ...arraySpec,
  paths: {
    ...arraySpec.paths,
    '/audit': {
      post: {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: itemSchema } },
        },
        responses: {
          200: {
            description: 'Unchanged item',
            content: { 'application/json': { schema: itemSchema } },
          },
        },
      },
    },
  },
};
const catalog = await createApiCatalog([{ id: 'batch-service', spec }]);
const contracts = await resolveApiOperations(
  catalog,
  catalog.operations.map((entry) => entry.key),
);
const paths = {
  records: '/records',
  details: '/details',
  confirm: '/confirm/{receipt}',
  audit: '/audit',
  submit: '/submit',
};
export const materials = Object.entries(paths).map(([callId, path]) => ({
  callId,
  operation: contracts.find((operation) => operation.path === path),
}));
export const capabilities = [
  createResponseArrayCapability({ materials }),
  createResponseCollectionCapability({ materials }),
  ...createN8nNativeCapabilities({ itemMode: 'linked' }),
];
const binding = (targetPointer, sourceNodeId, sourcePointer) => ({
  kind: 'node-output',
  targetPointer,
  sourceNodeId,
  sourcePointer,
});
export function createBatchIterationInput(
  batchSize,
  baseUrl = 'https://fixture.test',
) {
  const nativeNodes = [
    {
      id: 'each-record',
      capability: 'split-api-response-array',
      parameters: { sourceNodeId: 'records', pointer: '/records' },
    },
    {
      id: 'verify-item',
      capability: 'assert-responses',
      parameters: {
        checks: [
          {
            left: { source: 'response', nodeId: 'audit', pointer: '/amount' },
            operator: 'equals',
            right: {
              source: 'response',
              nodeId: 'details',
              pointer: '/input/amount',
            },
            message: 'Batched API values must match their original item',
          },
        ],
      },
    },
    {
      id: 'collected-results',
      capability: 'collect-api-responses',
      parameters: { sourceNodeId: 'audit', pointer: '' },
    },
  ];
  const graphMaterials = materials.map((material) => ({
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
            : material.callId === 'confirm'
              ? [
                  binding('/path/receipt', 'details', '/receipt'),
                  binding('/body', 'each-record', '/item'),
                ]
              : material.callId === 'audit'
                ? [binding('/body', 'confirm', '')]
                : [binding('/body', 'collected-results', '/items')],
    },
  }));
  const names = Object.fromEntries(
    materials.map((material) => [
      material.callId,
      'Request ' + material.callId,
    ]),
  );
  const sources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities,
    apiNodeNames: names,
  });
  return {
    id: 'batch-iteration-' + batchSize,
    name: 'Batch iteration ' + batchSize,
    materials: graphMaterials,
    capabilities,
    plan: {
      nativeNodes,
      starts: ['records'],
      gaps: [],
      edges: [
        ['records', 'each-record'],
        ['each-record', 'details'],
        ['details', 'confirm'],
        ['confirm', 'audit'],
        ['audit', 'verify-item'],
        ['verify-item', 'collected-results'],
        ['collected-results', 'submit'],
      ].map(([from, to]) => ({ from, to, output: 'main', input: 'main' })),
    },
    apiNodes: graphMaterials.map((material) =>
      createHttpRequestNode({
        ...material,
        baseUrl,
        credentialBindings: {},
        apiNodeNames: names,
        nativeOutputSources: sources,
        apiResponseContracts: Object.fromEntries(
          materials.map((source) => [source.callId, source.operation]),
        ),
        position: [300, 0],
        ...(['details', 'confirm', 'audit'].includes(material.arguments.callId)
          ? { itemMode: 'linked' }
          : {}),
      }),
    ),
    batchScopes: [
      {
        id: 'process-record-batches',
        batchSize,
        nodeIds: ['details', 'confirm', 'audit', 'verify-item'],
        entryNodeId: 'details',
        exitNodeId: 'verify-item',
      },
    ],
  };
}
export function compileBatchIteration(
  batchSize,
  baseUrl = 'https://fixture.test',
) {
  return compileBatchedN8nWorkflow(
    createBatchIterationInput(batchSize, baseUrl),
  );
}
