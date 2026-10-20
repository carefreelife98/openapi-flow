import { z } from 'zod';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  resolveN8nNativeFeatures,
  N8nNativeFeature,
  createN8nNativeOutputSources,
  createHttpRequestNode,
} from '@openapi-flow/n8n';

export const runtimeNativeSchema = z.strictObject({
  id: z.string().min(1),
  count: z.number().int().min(0),
  enabled: z.boolean(),
  nested: z.strictObject({
    'a.b': z.array(z.union([z.null(), z.string(), z.number()])),
  }),
  marker: z.string(),
});
export const runtimeNativeValue = {
  id: 'native/actual',
  count: 0,
  enabled: false,
  nested: { 'a.b': [null, '={{ literal text }}', 2] },
  marker: '42',
};

export async function nativeRuntimeInputFixture() {
  const schema = z.toJSONSchema(runtimeNativeSchema);
  const response = (original) => ({
    200: {
      description: 'Original JSON',
      content: { 'application/json': { schema: original } },
    },
  });
  const catalog = await createApiCatalog([
    {
      id: 'runtime-native-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Native runtime input contracts', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema } },
              },
              responses: response(schema),
            },
          },
          '/health': {
            get: {
              responses: response({
                type: 'object',
                properties: { ok: { const: true } },
                required: ['ok'],
                additionalProperties: false,
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
  const producer = createJsonOutputCapability({
    name: 'runtime-context',
    description: 'Typed actual input, not invented scenario values.',
    parametersSchema: runtimeNativeSchema,
  });
  const capabilities = [
    ...resolveN8nNativeFeatures({
      features: [N8nNativeFeature.MergeAppend, N8nNativeFeature.StopAndError],
    }).capabilities,
    producer,
  ];
  const context = { operations, capabilities, messages: [] };
  const nativeNode = {
    id: 'context',
    capability: producer.name,
    parameters: {},
    runtimeParameters: true,
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'runtime-native-workflow',
      requirements: [],
      nativeNodes: [
        nativeNode,
        {
          id: 'join',
          capability: N8nNativeFeature.MergeAppend,
          parameters: { numberInputs: 2 },
        },
      ],
      apiCalls: [
        {
          id: 'echo',
          operation: operations.find((operation) => operation.path === '/echo')
            .key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'context',
              sourcePointer: '',
              targetPointer: '/body',
            },
          ],
        },
        {
          id: 'health',
          operation: operations.find(
            (operation) => operation.path === '/health',
          ).key,
          values: {},
          bindings: [],
        },
      ],
      edges: [
        { from: 'context', output: 'main', to: 'echo', input: 'main' },
        { from: 'echo', output: 'main', to: 'join', input: 'input1' },
        { from: 'health', output: 'main', to: 'join', input: 'input2' },
      ],
    },
  });
  return {
    draft,
    context,
    name: 'Native runtime parameter verification',
    deployments: [
      { documentId: 'runtime-native-fixture', baseUrl: 'https://fixture.test' },
    ],
  };
}

/** Actual compiled sources and the unchanged OAS/DAG, without constructing a template draft. */
export async function nativeRuntimeCompilationFixture(options = {}) {
  const fixture = await nativeRuntimeInputFixture();
  if (options.baseUrl !== undefined)
    fixture.deployments[0].baseUrl = options.baseUrl;
  let nativeNodes = globalThis.structuredClone(fixture.draft.nativeNodes);
  if (options.partial) {
    const { count, marker, ...parameters } = runtimeNativeValue;
    assertFixtureRuntimeFields(count, marker);
    nativeNodes = nativeNodes.map((node) =>
      node.id === 'context'
        ? {
            ...node,
            parameters,
            runtimeParameters: { pointers: ['/count', '/marker'] },
          }
        : node,
    );
  }
  const materials = fixture.draft.apiCalls.map((call) => {
    const operation = fixture.context.operations.find(
      (operation) => operation.key.operationRef === call.operation.operationRef,
    );
    if (!operation)
      throw new Error('Native fixture lost its original operation');
    return {
      status: 'ready',
      operation,
      arguments: {
        callId: call.id,
        values: call.values,
        bindings: call.bindings,
        unresolvedInputs: [],
        ...(operation.operation.requestBody === undefined
          ? {}
          : { requestMediaType: 'application/json' }),
      },
    };
  });
  const gaps = options.gap
    ? [
        {
          id: 'missing-action',
          stage: 'api-selection',
          description: 'An explicitly missing action requires user review.',
        },
      ]
    : [];
  const plan = createReviewableWorkflowGraphPlan({
    materials,
    capabilities: fixture.context.capabilities,
    gaps,
    proposal: {
      nativeNodes,
      edges: [
        ...fixture.draft.edges,
        ...(options.gap
          ? [
              {
                from: 'join',
                output: 'main',
                to: 'missing-action',
                input: 'main',
              },
            ]
          : []),
      ],
      additionalGaps: [],
      blockedCalls: [],
    },
  });
  const nativeInputs = { revision: 7 };
  const apiResponseContracts = Object.fromEntries(
    materials.map((item) => [item.arguments.callId, item.operation]),
  );
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities: fixture.context.capabilities,
    apiNodeNames: {},
    apiResponseContracts,
    nativeInputs,
  });
  const apiNodes = materials.map((item, index) =>
    createHttpRequestNode({
      operation: item.operation,
      arguments: item.arguments,
      baseUrl: fixture.deployments[0].baseUrl,
      nativeOutputSources,
      apiNodeNames: {},
      apiResponseContracts,
      position: [600 + index * 250, 0],
    }),
  );
  return {
    fixture,
    input: {
      id: options.gap ? 'native-review-inputs' : 'native-planned-inputs',
      name: 'Compiled actual native runtime inputs',
      plan,
      materials,
      apiNodes,
      capabilities: fixture.context.capabilities,
      nativeInputs,
    },
  };
}

function assertFixtureRuntimeFields(count, marker) {
  if (count !== 0 || marker !== '42')
    throw new Error('Native fixture runtime fields changed');
}
