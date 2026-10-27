import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createApiResponseKeyJoinCapability,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const keyJoinParameters = {
  left: { sourceNodeId: 'left-api', pointer: '/rows', keyPointer: '/id' },
  right: {
    sourceNodeId: 'right-api',
    pointer: '/entries',
    keyPointer: '/lookup/code',
  },
  joinMode: 'full',
  missingKeys: 'error',
};
export const keyJoinLeftRows = [
  {
    id: 0,
    marker: 'left-zero',
    data: { literal: '={{ not code }}', items: [] },
  },
  { id: '0', marker: 'left-string', data: [false, null, '007'] },
  { id: 'duplicate', marker: 'left-duplicate-1', data: {} },
  { id: 'duplicate', marker: 'left-duplicate-2', data: null },
  { id: 'left-only', marker: 'left-only', data: '' },
  { id: { a: [0, false] }, marker: 'left-object', data: 0 },
];
export const keyJoinRightRows = [
  { lookup: { code: 'duplicate' }, marker: 'right-duplicate-2', data: 2 },
  { lookup: { code: 'right-only' }, marker: 'right-only', data: [] },
  { lookup: { code: '0' }, marker: 'right-string', data: '007' },
  { lookup: { code: 'duplicate' }, marker: 'right-duplicate-1', data: 1 },
  { lookup: { code: 0 }, marker: 'right-zero', data: false },
  { lookup: { code: { a: [0, false] } }, marker: 'right-object', data: null },
];
const leftRow = {
  type: 'object',
  properties: { id: {}, marker: { type: 'string' }, data: {} },
  required: ['marker', 'data'],
  additionalProperties: false,
};
const rightRow = {
  type: 'object',
  properties: {
    lookup: {
      type: 'object',
      properties: { code: {} },
      additionalProperties: false,
    },
    marker: { type: 'string' },
    data: {},
  },
  required: ['lookup', 'marker', 'data'],
  additionalProperties: false,
};
export const keyJoinLeftSchema = {
  type: 'object',
  properties: {
    rows: { type: 'array', items: leftRow },
    checksum: { type: 'integer' },
  },
  required: ['rows', 'checksum'],
  additionalProperties: false,
};
export const keyJoinRightSchema = {
  type: 'object',
  properties: {
    entries: { type: 'array', items: rightRow },
    checksum: { type: 'integer' },
  },
  required: ['entries', 'checksum'],
  additionalProperties: false,
};

export async function keyJoinMaterials(
  leftSchema = keyJoinLeftSchema,
  rightSchema = keyJoinRightSchema,
) {
  const response = (schema) => ({
    200: {
      description: 'Unchanged response',
      content: { 'application/json': { schema } },
    },
  });
  const catalog = await createApiCatalog([
    {
      id: 'key-join-contracts',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Generic business key comparison', version: '1' },
        paths: {
          '/left': { get: { responses: response(leftSchema) } },
          '/right': { get: { responses: response(rightSchema) } },
        },
      },
    },
  ]);
  return (
    await resolveApiOperations(
      catalog,
      catalog.operations.map((operation) => operation.key),
    )
  ).map((operation) => ({
    callId: operation.path === '/left' ? 'left-api' : 'right-api',
    operation,
  }));
}

export async function compileKeyJoinWorkflow(
  baseUrl,
  parameters = keyJoinParameters,
) {
  const selected = await keyJoinMaterials();
  const materials = selected.map(({ callId, operation }) => ({
    operation,
    arguments: { callId, values: {}, bindings: [], unresolvedInputs: [] },
  }));
  const apiNodeNames = {
    'left-api': 'Request left-api',
    'right-api': 'Request right-api',
  };
  const apiResponseContracts = Object.fromEntries(
    selected.map(({ callId, operation }) => [callId, operation]),
  );
  const apiNodes = materials.map((material) =>
    createHttpRequestNode({
      ...material,
      baseUrl,
      credentialBindings: {},
      position: [0, 0],
      apiNodeNames,
      apiResponseContracts,
      itemMode: 'linked',
    }),
  );
  const capability = createApiResponseKeyJoinCapability({
    materials: selected,
  });
  return compilePlannedN8nWorkflow({
    id: 'key-join-comparison',
    name: 'Match unchanged rows by original business key',
    materials,
    apiNodes,
    capabilities: [capability],
    plan: {
      nativeNodes: [
        { id: 'matched-results', capability: capability.name, parameters },
      ],
      starts: ['left-api', 'right-api'],
      gaps: [],
      edges: [
        {
          from: 'left-api',
          output: 'main',
          to: 'matched-results',
          input: 'left',
        },
        {
          from: 'right-api',
          output: 'main',
          to: 'matched-results',
          input: 'right',
        },
      ],
    },
  });
}
