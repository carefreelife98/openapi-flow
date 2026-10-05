import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    price: { type: 'number' },
    stock: { type: 'integer' },
    labels: { type: 'array', items: { type: 'string' } },
    filter: {
      type: 'object',
      required: ['R'],
      properties: { R: { type: 'integer' } },
    },
  },
};
const response = {
  200: {
    description: 'Result',
    content: { 'application/json': { schema: resultSchema } },
  },
};
const parameter = (name, location, schema, extra = {}) => ({
  name,
  in: location,
  required: true,
  schema,
  ...extra,
});
const spec = {
  openapi: '3.1.0',
  info: { title: 'Binding fixture', version: '1' },
  paths: {
    '/source': { get: { responses: response } },
    '/detail/{id}': {
      get: {
        parameters: [parameter('id', 'path', { type: 'string' })],
        responses: response,
      },
    },
    '/price': {
      get: {
        parameters: [
          parameter('id', 'query', { type: 'string' }),
          parameter('labels', 'query', resultSchema.properties.labels, {
            style: 'pipeDelimited',
            explode: false,
          }),
          parameter('filter', 'query', resultSchema.properties.filter, {
            style: 'deepObject',
            explode: true,
          }),
        ],
        responses: response,
      },
    },
    '/stock': {
      get: {
        parameters: [parameter('id', 'query', { type: 'string' })],
        responses: response,
      },
    },
    '/summary': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                ...resultSchema,
                required: ['id', 'price', 'stock', 'labels', 'filter'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: response,
      },
    },
  },
};
const catalog = await createApiCatalog([
  { id: 'source-service', spec },
  { id: 'consumer-service', spec },
]);
const resolved = await resolveApiOperations(
  catalog,
  catalog.operations
    .filter(
      (entry) =>
        entry.key.documentId ===
        (entry.path === '/source' ? 'source-service' : 'consumer-service'),
    )
    .map((entry) => entry.key),
);
const materials = resolved.map((operation) => ({
  operation,
  callId:
    operation.path === '/detail/{id}' ? 'detail' : operation.path.slice(1),
}));
const bind = (targetPointer, sourceNodeId, sourcePointer) => ({
  kind: 'node-output',
  targetPointer,
  sourceNodeId,
  sourcePointer,
});
const bindingPlan = {
  gaps: [],
  calls: [
    { callId: 'source', bindings: [] },
    { callId: 'detail', bindings: [bind('/path/id', 'source', '/id')] },
    {
      callId: 'price',
      bindings: [
        bind('/query/id', 'source', '/id'),
        bind('/query/labels', 'source', '/labels'),
        bind('/query/filter', 'source', '/filter'),
      ],
    },
    { callId: 'stock', bindings: [bind('/query/id', 'source', '/id')] },
    {
      callId: 'summary',
      bindings: [
        bind('/body/id', 'detail', '/id'),
        bind('/body/price', 'price', '/price'),
        bind('/body/stock', 'stock', '/stock'),
        bind('/body/labels', 'source', '/labels'),
        bind('/body/filter', 'source', '/filter'),
      ],
    },
  ],
};
const graphMaterials = materials.map(({ operation, callId }) => ({
  operation,
  arguments: {
    callId,
    values: {},
    bindings: bindingPlan.calls.find((call) => call.callId === callId).bindings,
    unresolvedInputs: [],
  },
}));
const graphPlan = {
  nativeNodes: [
    { id: 'join', capability: 'merge-append', parameters: { numberInputs: 3 } },
  ],
  starts: ['source'],
  gaps: [],
  edges: [
    ...['detail', 'price', 'stock'].map((to) => ({
      from: 'source',
      output: 'main',
      to,
      input: 'main',
    })),
    ...['detail', 'price', 'stock'].map((from, index) => ({
      from,
      output: 'main',
      to: 'join',
      input: `input${index + 1}`,
    })),
    { from: 'join', output: 'main', to: 'summary', input: 'main' },
  ],
};
const names = Object.fromEntries(
  materials.map((item) => [item.callId, 'Request ' + item.callId]),
);

export { spec, materials, bind, bindingPlan, graphMaterials, graphPlan, names };
