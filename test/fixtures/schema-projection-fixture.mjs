import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createResponseArrayCapability,
  createResponseCollectionCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const projectionRows = [{ amount: 2 }, { amount: 4 }];
const rowSchema = {
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: { amount: { type: 'integer' } },
  patternProperties: { '^amount$': { minimum: 2 } },
  allOf: [{ properties: { amount: { maximum: 5 } } }],
};
const nullableNumber = {
  type: 'number',
  nullable: true,
  minimum: 0,
  exclusiveMinimum: true,
};
const response = (schema) => ({
  200: {
    description: 'Contract response',
    content: { 'application/json': { schema } },
  },
});

export async function createSchemaProjectionFixture(baseUrl, kind) {
  const nullable = kind === 'nullable';
  const sourceSchema = nullable
    ? {
        type: 'object',
        required: ['amount'],
        properties: { amount: nullableNumber },
        additionalProperties: false,
      }
    : {
        type: 'object',
        required: ['records'],
        additionalProperties: false,
        properties: {
          records: {
            allOf: [
              { type: 'array', items: rowSchema },
              { items: { properties: { amount: { maximum: 5 } } } },
            ],
          },
        },
      };
  const sinkSchema = nullable
    ? { type: 'array', items: nullableNumber }
    : rowSchema;
  const catalog = await createApiCatalog([
    {
      id: 'projection',
      spec: {
        openapi: nullable ? '3.0.3' : '3.1.0',
        info: { title: 'Schema projection execution', version: '1' },
        paths: {
          '/source': { get: { responses: response(sourceSchema) } },
          '/sink': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: sinkSchema } },
              },
              responses: response({
                type: 'object',
                required: ['accepted'],
                properties: { accepted: { type: 'boolean' } },
              }),
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const selected = operations.map((operation) => ({
    callId: operation.path.slice(1),
    operation,
  }));
  const apiNodeNames = { source: 'Request source', sink: 'Request sink' };
  const apiResponseContracts = Object.fromEntries(
    selected.map((material) => [material.callId, material.operation]),
  );
  const capability = nullable
    ? createResponseCollectionCapability({ materials: selected })
    : createResponseArrayCapability({ materials: selected });
  const native = {
    id: 'projected',
    capability: capability.name,
    parameters: {
      sourceNodeId: 'source',
      pointer: nullable ? '/amount' : '/records',
    },
  };
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes: [native],
    capabilities: [capability],
    apiNodeNames,
  });
  const materials = selected.map((material) => ({
    operation: material.operation,
    arguments: {
      callId: material.callId,
      values: {},
      unresolvedInputs: [],
      bindings:
        material.callId === 'source'
          ? []
          : [
              {
                kind: 'node-output',
                sourceNodeId: 'projected',
                sourcePointer: nullable ? '/items' : '/item',
                targetPointer: '/body',
              },
            ],
    },
  }));
  const apiNodes = materials.map((material) =>
    createHttpRequestNode({
      ...material,
      baseUrl,
      position: [300, 0],
      apiNodeNames,
      apiResponseContracts,
      nativeOutputSources,
      ...(material.arguments.callId === 'sink' && !nullable
        ? { itemMode: 'linked' }
        : {}),
    }),
  );
  return compilePlannedN8nWorkflow({
    id: 'schema-projection-' + kind,
    name: 'Schema projection ' + kind,
    materials,
    apiNodes,
    capabilities: [capability],
    plan: {
      starts: ['source'],
      gaps: [],
      nativeNodes: [native],
      edges: [
        { from: 'source', output: 'main', to: 'projected', input: 'main' },
        { from: 'projected', output: 'main', to: 'sink', input: 'main' },
      ],
    },
  });
}
