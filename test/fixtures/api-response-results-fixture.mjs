import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createApiResponseResultsCapability,
  createHttpRequestNode,
  createN8nNativeOutputSources,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const responseResultsCalls = [
  { callId: 'one', documentId: 'first-service', path: '/one' },
  { callId: 'two', documentId: 'second-service', path: '/two' },
  { callId: 'three', documentId: 'third-service', path: '/three' },
  { callId: 'again', documentId: 'first-service', path: '/one' },
];

export async function createApiResponseResultsFixture(
  baseUrl,
  callCount = responseResultsCalls.length,
) {
  const valueSchema = {
    type: ['string', 'number', 'boolean', 'null', 'array', 'object'],
  };
  const catalog = await createApiCatalog(
    responseResultsCalls.slice(0, 3).map(({ documentId, path }) => ({
      id: documentId,
      spec: {
        openapi: '3.1.0',
        info: { title: 'Unchanged API results', version: '1' },
        paths: {
          [path]: {
            get: {
              responses: {
                200: {
                  description: 'Complete unchanged JSON body',
                  content: { 'application/json': { schema: valueSchema } },
                },
              },
            },
          },
        },
      },
    })),
  );
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map(({ key }) => key),
  );
  const calls = responseResultsCalls.slice(0, callCount);
  const materials = calls.map(({ callId, documentId, path }) => {
    const operation = operations.find(
      (entry) => entry.key.documentId === documentId && entry.path === path,
    );
    if (!operation)
      throw new Error(`Fixture operation is missing ${documentId}:${path}`);
    return {
      operation,
      arguments: { callId, values: {}, bindings: [], unresolvedInputs: [] },
    };
  });
  const capabilities = [
    createApiResponseResultsCapability({
      materials: materials.map(({ operation, arguments: args }) => ({
        callId: args.callId,
        operation,
      })),
    }),
  ];
  const nativeNodes = [
    {
      id: 'results',
      capability: 'gather-api-responses',
      parameters: { sourceNodeIds: calls.map(({ callId }) => callId) },
    },
  ];
  const outputSchema = capabilities[0].outputSchema(nativeNodes[0].parameters);
  const echoCatalog = await createApiCatalog([
    {
      id: 'echo-service',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Complete results echo', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: outputSchema } },
              },
              responses: {
                200: {
                  description: 'Unchanged result list',
                  content: { 'application/json': { schema: outputSchema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [echoOperation] = await resolveApiOperations(
    echoCatalog,
    echoCatalog.operations.map(({ key }) => key),
  );
  const echo = {
    operation: echoOperation,
    arguments: {
      callId: 'echo',
      values: {},
      unresolvedInputs: [],
      bindings: [
        {
          kind: 'node-output',
          targetPointer: '/body',
          sourceNodeId: 'results',
          sourcePointer: '',
        },
      ],
    },
  };
  const apiNodes = materials.map((material, index) =>
    createHttpRequestNode({ ...material, baseUrl, position: [0, index * 200] }),
  );
  return compilePlannedN8nWorkflow({
    id: 'api-response-results',
    name: 'Fixed API results with unchanged full bodies',
    materials: [...materials, echo],
    capabilities,
    apiNodes: [
      ...apiNodes,
      createHttpRequestNode({
        ...echo,
        baseUrl,
        position: [1000, 0],
        nativeOutputSources: createN8nNativeOutputSources({
          nativeNodes,
          capabilities,
          apiNodeNames: Object.fromEntries(
            apiNodes.map((entry) => [entry.nodeId, entry.exit.name]),
          ),
          apiResponseContracts: Object.fromEntries(
            materials.map((entry) => [entry.arguments.callId, entry.operation]),
          ),
        }),
      }),
    ],
    plan: {
      nativeNodes,
      starts: calls.map(({ callId }) => callId),
      gaps: [],
      edges: [
        ...calls.map(({ callId }, index) => ({
          from: callId,
          output: 'main',
          to: 'results',
          input: `input${index + 1}`,
        })),
        { from: 'results', output: 'main', to: 'echo', input: 'main' },
      ],
    },
  }).workflow;
}
