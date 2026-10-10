import { z } from 'zod';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createNativeArrayCapability,
  createN8nNativeOutputSources,
  createHttpRequestNode,
  createItemJoinCapability,
  createResponseCollectionCapability,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const childSchema = z.strictObject({
  id: z.string(),
  amount: z.number(),
  payload: z.union([
    z.strictObject({ 'a.b': z.null(), text: z.string() }),
    z.array(z.union([z.null(), z.boolean(), z.string(), z.array(z.string())])),
  ]),
});
export const groupSchema = z.strictObject({
  id: z.string(),
  marker: z.string(),
  children: z.array(childSchema),
});
export const contextSchema = z.strictObject({
  groups: z.array(groupSchema),
  marker: z.literal('original'),
});
export const referencedContextSchema = contextSchema.extend({
  groups: z.array(
    groupSchema.extend({
      children: z.array(childSchema.extend({ payload: z.json() })),
    }),
  ),
});
export const context = {
  marker: 'original',
  groups: [
    {
      id: 'same',
      marker: 'first',
      children: [
        {
          id: 'same',
          amount: 8,
          payload: { 'a.b': null, text: '={{ untouched }}' },
        },
        { id: 'same', amount: 2, payload: [null, false, '42', ['nested']] },
      ],
    },
    { id: 'same', marker: 'empty', children: [] },
    {
      id: 'same',
      marker: 'last',
      children: [
        {
          id: 'same',
          amount: 8,
          payload: { 'a.b': null, text: '={{ untouched }}' },
        },
      ],
    },
  ],
};
const childJson = z.toJSONSchema(childSchema);
const groupJson = z.toJSONSchema(groupSchema);
const combinedSchema = {
  type: 'object',
  required: ['left', 'right', 'parent'],
  additionalProperties: false,
  properties: { left: childJson, right: childJson, parent: groupJson },
};
const response = (schema) => ({
  200: {
    description: 'Original JSON',
    content: { 'application/json': { schema } },
  },
});
const operation = (schema) => ({
  requestBody: { required: true, content: { 'application/json': { schema } } },
  responses: response(schema),
});
const spec = {
  openapi: '3.1.0',
  info: { title: 'Native nested arrays contract', version: '1' },
  paths: {
    '/parent': { post: operation(groupJson) },
    '/left': { post: operation(childJson) },
    '/right': { post: operation(childJson) },
    '/combine': { post: operation(combinedSchema) },
    '/submit': { post: operation({ type: 'array', items: combinedSchema }) },
  },
};
const catalog = await createApiCatalog([{ id: 'native-iteration', spec }]);
const contracts = await resolveApiOperations(
  catalog,
  catalog.operations.map((entry) => entry.key),
);
const bind = (targetPointer, sourceNodeId, sourcePointer) => ({
  kind: 'node-output',
  targetPointer,
  sourceNodeId,
  sourcePointer,
});

export function createNativeIterationInput(
  baseUrl = 'https://fixture.test',
  value = context,
  producerSchema = contextSchema,
) {
  const producer = createJsonOutputCapability({
    name: 'scenario-context',
    description: 'Explicit scenario groups, without invented values.',
    parametersSchema: producerSchema,
  });
  const contextNode = {
    id: 'context',
    capability: producer.name,
    parameters: value,
  };
  const contextSources = createN8nNativeOutputSources({
    nativeNodes: [contextNode],
    capabilities: [producer],
    apiNodeNames: {},
  });
  const firstArray = createNativeArrayCapability({
    sources: contextSources,
    itemMode: 'linked',
  });
  const parents = {
    id: 'each-parent',
    capability: firstArray.name,
    parameters: { sourceNodeId: 'context', pointer: '/groups' },
  };
  const parentSources = createN8nNativeOutputSources({
    nativeNodes: [parents],
    capabilities: [firstArray],
    apiNodeNames: {},
  });
  const array = createNativeArrayCapability({
    sources: [...contextSources, ...parentSources],
    itemMode: 'linked',
  });
  const children = {
    id: 'each-child',
    capability: array.name,
    parameters: { sourceNodeId: parents.id, pointer: '/item/children' },
  };
  const selected = contracts.map((operation) => ({
    callId: operation.path.slice(1),
    operation,
  }));
  const names = Object.fromEntries(
    selected.map((material) => [material.callId, 'Request ' + material.callId]),
  );
  const outputs = createN8nNativeOutputSources({
    nativeNodes: [contextNode, parents, children],
    capabilities: [producer, array],
    apiNodeNames: names,
  });
  const join = createItemJoinCapability({
    materials: selected,
    scopes: outputs.filter((source) => source.nodeId === children.id),
  });
  const joined = {
    id: 'joined',
    capability: join.name,
    parameters: { scopeNodeId: children.id, sourceCallIds: ['left', 'right'] },
  };
  const collect = createResponseCollectionCapability({ materials: selected });
  const collected = {
    id: 'collected',
    capability: collect.name,
    parameters: { sourceNodeId: 'combine', pointer: '' },
  };
  const capabilities = [producer, array, join, collect];
  const nativeNodes = [contextNode, parents, children, joined, collected];
  const nativeSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities,
    apiNodeNames: names,
  });
  const materials = selected.map((material) => ({
    operation: material.operation,
    arguments: {
      callId: material.callId,
      values: {},
      unresolvedInputs: [],
      bindings:
        material.callId === 'parent'
          ? [bind('/body', parents.id, '/item')]
          : ['left', 'right'].includes(material.callId)
            ? [bind('/body', children.id, '/item')]
            : material.callId === 'combine'
              ? [
                  bind('/body/left', 'joined', '/responses/left'),
                  bind('/body/right', 'joined', '/responses/right'),
                  bind('/body/parent', 'parent', ''),
                ]
              : [bind('/body', 'collected', '/items')],
    },
  }));
  const apiNodes = materials.map((material) =>
    createHttpRequestNode({
      ...material,
      baseUrl,
      position: [300, 0],
      apiNodeNames: names,
      nativeOutputSources: nativeSources,
      apiResponseContracts: Object.fromEntries(
        selected.map((source) => [source.callId, source.operation]),
      ),
      ...(material.arguments.callId === 'submit' ? {} : { itemMode: 'linked' }),
    }),
  );
  const edges = [
    ['context', 'each-parent', 'main', 'main'],
    ['each-parent', 'parent', 'main', 'main'],
    ['parent', 'each-child', 'main', 'main'],
    ['each-child', 'left', 'main', 'main'],
    ['each-child', 'right', 'main', 'main'],
    ['left', 'joined', 'main', 'input1'],
    ['right', 'joined', 'main', 'input2'],
    ['joined', 'combine', 'main', 'main'],
    ['combine', 'collected', 'main', 'main'],
    ['collected', 'submit', 'main', 'main'],
  ].map(([from, to, output, input]) => ({ from, to, output, input }));
  return {
    id: 'native-array-iteration',
    name: 'Native arrays and five REST APIs',
    materials,
    apiNodes,
    capabilities,
    plan: { nativeNodes, starts: ['context'], edges, gaps: [] },
  };
}
export function compileNativeIteration(
  baseUrl,
  value = context,
  producerSchema = contextSchema,
) {
  return compilePlannedN8nWorkflow(
    createNativeIterationInput(baseUrl, value, producerSchema),
  );
}
