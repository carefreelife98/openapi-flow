import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createApiResponseObjectCapability,
  createHttpRequestNode,
  createN8nNativeCapabilities,
  createN8nNativeOutputSources,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export async function createApiResponseObjectFixture(baseUrl) {
  const ids = ['one', 'two', 'three'];
  const catalog = await createApiCatalog([
    {
      id: 'response-object-contracts',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Response object value preservation', version: '1' },
        paths: Object.fromEntries(
          ids.map((id) => [
            `/${id}`,
            {
              get: {
                responses: {
                  200: {
                    description: 'Any unchanged JSON value',
                    content: {
                      'application/json': {
                        schema: {
                          type: [
                            'string',
                            'number',
                            'boolean',
                            'null',
                            'array',
                            'object',
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          ]),
        ),
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map(({ key }) => key),
  );
  const materials = operations.map((operation) => ({
    operation,
    arguments: {
      callId: operation.path.slice(1),
      values: {},
      bindings: [],
      unresolvedInputs: [],
    },
  }));
  const fields = [
    { name: 'first.result', sourceNodeId: 'one', pointer: '' },
    { name: 'second', sourceNodeId: 'two', pointer: '' },
    { name: 'third', sourceNodeId: 'three', pointer: '' },
    { name: 'firstAgain', sourceNodeId: 'one', pointer: '' },
  ];
  const nativeNodes = [
    {
      id: 'result',
      capability: 'compose-api-responses',
      parameters: { fields },
    },
  ];
  const valueSchema = {
    type: ['string', 'number', 'boolean', 'null', 'array', 'object'],
  };
  const resultSchema = {
    type: 'object',
    properties: Object.fromEntries(
      fields.map(({ name }) => [name, valueSchema]),
    ),
    required: fields.map(({ name }) => name),
    additionalProperties: false,
  };
  const echoCatalog = await createApiCatalog([
    {
      id: 'echo-contract',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Unchanged composed object request', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: resultSchema } },
              },
              responses: {
                200: {
                  description: 'Unchanged composed request',
                  content: { 'application/json': { schema: resultSchema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [echo] = await resolveApiOperations(
    echoCatalog,
    echoCatalog.operations.map(({ key }) => key),
  );
  const sink = {
    operation: echo,
    arguments: {
      callId: 'echo',
      values: {},
      unresolvedInputs: [],
      bindings: [
        {
          kind: 'node-output',
          targetPointer: '/body',
          sourceNodeId: 'result',
          sourcePointer: '',
        },
      ],
    },
  };
  const capabilities = [
    ...createN8nNativeCapabilities(),
    createApiResponseObjectCapability({
      materials: materials.map(({ operation, arguments: args }) => ({
        operation,
        callId: args.callId,
      })),
    }),
  ];
  const apiNodes = materials.map((material, index) =>
    createHttpRequestNode({ ...material, baseUrl, position: [0, index * 200] }),
  );
  return compilePlannedN8nWorkflow({
    id: 'response-object',
    name: 'Independent API response object',
    materials: [...materials, sink],
    capabilities,
    apiNodes: [
      ...apiNodes,
      createHttpRequestNode({
        ...sink,
        baseUrl,
        position: [1000, 0],
        nativeOutputSources: createN8nNativeOutputSources({
          nativeNodes,
          capabilities,
          apiNodeNames: Object.fromEntries(
            apiNodes.map((fragment) => [fragment.nodeId, fragment.exit.name]),
          ),
          apiResponseContracts: Object.fromEntries(
            materials.map((material) => [
              material.arguments.callId,
              material.operation,
            ]),
          ),
        }),
      }),
    ],
    plan: {
      nativeNodes,
      starts: ids,
      gaps: [],
      edges: [
        ...ids.map((from, index) => ({
          from,
          output: 'main',
          to: 'result',
          input: `input${index + 1}`,
        })),
        { from: 'result', output: 'main', to: 'echo', input: 'main' },
      ],
    },
  }).workflow;
}
