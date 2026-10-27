import {
  createApiCatalog,
  resolveApiOperations,
  collectNativeRuntimeInputSlots,
} from '@openapi-flow/core';
import {
  createApiResponseMapEntryCapability,
  createNativeArrayCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const selectedGroup = 'selected/group~.雪';
export const mapEntryItems = [
  { gdNo: '0007', count: 0, payload: { text: '={{ literal }}', empty: [] } },
  { gdNo: '0007', count: 2, payload: [false, null, '007'] },
  { gdNo: '0008', count: 1, payload: {} },
];
export const mapEntryItemSchema = {
  type: 'object',
  required: ['gdNo', 'count', 'payload'],
  additionalProperties: false,
  properties: {
    gdNo: { type: 'string' },
    count: { type: 'integer' },
    payload: {},
  },
};
export const mapEntryResponseSchema = {
  type: 'object',
  required: ['result'],
  additionalProperties: false,
  properties: {
    result: {
      type: 'object',
      required: ['items'],
      additionalProperties: false,
      properties: {
        items: {
          type: 'object',
          additionalProperties: { type: 'array', items: mapEntryItemSchema },
        },
      },
    },
  },
};
export const mapEntryBody = {
  result: {
    items: Object.fromEntries([
      [selectedGroup, mapEntryItems],
      ['', []],
      ['0', [mapEntryItems[2]]],
      ['constructor', [mapEntryItems[1]]],
      ['other', [mapEntryItems[0]]],
    ]),
  },
};
const verifySchema = {
  type: 'object',
  required: ['group', 'item'],
  additionalProperties: false,
  properties: { group: { type: 'string' }, item: mapEntryItemSchema },
};
const responses = (schema) => ({
  200: {
    description: 'Original JSON data',
    content: { 'application/json': { schema } },
  },
});

export async function mapEntryMaterial(schema = mapEntryResponseSchema) {
  const catalog = await createApiCatalog([
    {
      id: 'map-entry-contract',
      spec: {
        openapi: '3.1.0',
        info: {
          title: 'Generic grouped response and typed echo',
          version: '1',
        },
        paths: {
          '/groups': { get: { responses: responses(schema) } },
          '/verify': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: verifySchema } },
              },
              responses: responses(verifySchema),
            },
          },
        },
      },
    },
  ]);
  return (
    await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    )
  ).map((operation) => ({
    operation,
    callId: operation.path === '/groups' ? 'groups' : 'verify',
  }));
}

export async function compileMapEntryWorkflow(
  baseUrl,
  key = selectedGroup,
  options = {},
) {
  const selected = await mapEntryMaterial();
  const apiNodeNames = { groups: 'Request groups', verify: 'Request verify' };
  const apiResponseContracts = Object.fromEntries(
    selected.map(({ callId, operation }) => [callId, operation]),
  );
  const select = createApiResponseMapEntryCapability({
    materials: selected,
    itemMode: 'linked',
  });
  const entry = {
    id: 'selected-group',
    capability: select.name,
    parameters: {
      sourceNodeId: 'groups',
      pointer: '/result/items',
      ...(options.runtimeKey ? {} : { key }),
    },
    ...(options.runtimeKey
      ? { runtimeParameters: { pointers: ['/key'] } }
      : {}),
  };
  const runtimeSlots = options.runtimeKey
    ? collectNativeRuntimeInputSlots({
        nativeNodes: [entry],
        capabilities: [select],
      })
    : [];
  const nativeInputs = options.runtimeKey
    ? {
        revision: 0,
        ...(options.provideKey === false
          ? {}
          : { inputValues: { [runtimeSlots[0].id]: key } }),
      }
    : undefined;
  const entrySources = createN8nNativeOutputSources({
    nativeNodes: [entry],
    capabilities: [select],
    apiNodeNames,
    apiResponseContracts,
    nativeInputs,
  });
  const split = createNativeArrayCapability({
    sources: entrySources,
    itemMode: 'linked',
  });
  const each = {
    id: 'each-item',
    capability: split.name,
    parameters: { sourceNodeId: entry.id, pointer: '/value' },
  };
  const nativeNodes = [entry, each],
    capabilities = [select, split];
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities,
    apiNodeNames,
    apiResponseContracts,
    nativeInputs,
  });
  const materials = selected.map(({ callId, operation }) => ({
    operation,
    arguments: {
      callId,
      values: {},
      unresolvedInputs: [],
      ...(callId === 'verify' ? { requestMediaType: 'application/json' } : {}),
      bindings:
        callId === 'groups'
          ? []
          : [
              {
                kind: 'node-output',
                sourceNodeId: each.id,
                sourcePointer: '/item',
                targetPointer: '/body/item',
              },
              {
                kind: 'node-output',
                sourceNodeId: entry.id,
                sourcePointer: '/key',
                targetPointer: '/body/group',
              },
            ],
    },
  }));
  const apiNodes = materials.map((material) =>
    createHttpRequestNode({
      ...material,
      baseUrl,
      credentialBindings: {},
      position: [0, 0],
      apiNodeNames,
      apiResponseContracts,
      nativeOutputSources,
      itemMode: 'linked',
    }),
  );
  return compilePlannedN8nWorkflow({
    id: 'map-entry-selection',
    name: 'Select one exact group and preserve typed items',
    materials,
    apiNodes,
    capabilities,
    nativeInputs,
    plan: {
      nativeNodes,
      starts: ['groups'],
      gaps: [],
      edges: [
        { from: 'groups', output: 'main', to: entry.id, input: 'main' },
        { from: entry.id, output: 'main', to: each.id, input: 'main' },
        { from: each.id, output: 'main', to: 'verify', input: 'main' },
      ],
    },
  });
}
