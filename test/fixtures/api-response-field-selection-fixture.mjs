import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createApiResponseObjectCapability,
  createHttpRequestNode,
  createN8nNativeOutputSources,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

// Synthetic contracts exercise source-specific pointers; no company OAS is copied here.
export async function responseFieldSelectionMaterials() {
  const schemas = {
    text: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        'a/b~c': { type: 'boolean' },
      },
      additionalProperties: false,
    },
    list: {
      type: 'object',
      properties: {
        alternatives: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    dictionary: {
      type: 'object',
      properties: {
        groups: { type: 'object', additionalProperties: { type: 'string' } },
      },
      additionalProperties: false,
    },
    scalar: { type: 'number' },
    empty: undefined,
  };
  const catalog = await createApiCatalog([
    {
      id: 'field-selection',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Source-specific field selection', version: '1' },
        paths: Object.fromEntries(
          Object.entries(schemas).map(([id, schema]) => [
            `/${id}`,
            {
              get: {
                responses: {
                  200: {
                    description: 'Original response',
                    ...(schema === undefined
                      ? {}
                      : {
                          content: { 'application/json': { schema } },
                        }),
                  },
                },
              },
            },
          ]),
        ),
      },
    },
  ]);
  return (
    await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    )
  ).map((operation) => ({ callId: operation.path.slice(1), operation }));
}

export const responseSelectionFields = [
  { name: 'text', sourceNodeId: 'text', pointer: '/text' },
  { name: 'candidates', sourceNodeId: 'list', pointer: '/alternatives' },
  { name: 'flag', sourceNodeId: 'text', pointer: '/a~1b~0c' },
  {
    name: 'dictionary',
    sourceNodeId: 'dictionary',
    pointer: '/groups/selection',
  },
  { name: 'number', sourceNodeId: 'scalar', pointer: '' },
  { name: 'element', sourceNodeId: 'list', pointer: '/alternatives/1' },
];

export async function compileResponseFieldSelectionWorkflow(baseUrl, fields) {
  const sources = (await responseFieldSelectionMaterials()).filter(
    (entry) => entry.callId !== 'empty',
  );
  const capability = createApiResponseObjectCapability({ materials: sources });
  const nativeNodes = [
    {
      id: 'selected-fields',
      capability: capability.name,
      parameters: { fields },
    },
  ];
  const outputSchema = capability.outputSchema({ fields });
  const echoCatalog = await createApiCatalog([
    {
      id: 'field-selection-echo',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Typed selected field consumer', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: outputSchema } },
              },
              responses: {
                200: {
                  description: 'Original selected values',
                  content: { 'application/json': { schema: outputSchema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(
    echoCatalog,
    echoCatalog.operations.map((entry) => entry.key),
  );
  const materials = sources.map(({ callId, operation }) => ({
    operation,
    arguments: { callId, values: {}, bindings: [], unresolvedInputs: [] },
  }));
  const apiNodes = materials.map((material, index) =>
    createHttpRequestNode({ ...material, baseUrl, position: [0, index * 220] }),
  );
  const sink = {
    operation,
    arguments: {
      callId: 'echo',
      values: {},
      unresolvedInputs: [],
      bindings: [
        {
          kind: 'node-output',
          sourceNodeId: 'selected-fields',
          sourcePointer: '',
          targetPointer: '/body',
        },
      ],
    },
  };
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities: [capability],
    apiNodeNames: Object.fromEntries(
      apiNodes.map((fragment) => [fragment.nodeId, fragment.exit.name]),
    ),
    apiResponseContracts: Object.fromEntries(
      sources.map((entry) => [entry.callId, entry.operation]),
    ),
  });
  return compilePlannedN8nWorkflow({
    id: 'response-field-selection',
    name: 'Typed OAS field selection and follow-up request',
    materials: [...materials, sink],
    apiNodes: [
      ...apiNodes,
      createHttpRequestNode({
        ...sink,
        baseUrl,
        position: [1400, 0],
        nativeOutputSources,
      }),
    ],
    capabilities: [capability],
    plan: {
      nativeNodes,
      starts: sources.map((entry) => entry.callId),
      gaps: [],
      edges: [
        ...sources.map((entry, index) => ({
          from: entry.callId,
          output: 'main',
          to: 'selected-fields',
          input: `input${index + 1}`,
        })),
        { from: 'selected-fields', output: 'main', to: 'echo', input: 'main' },
      ],
    },
  }).workflow;
}
