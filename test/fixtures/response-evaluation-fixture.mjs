import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createResponseEvaluationCapability,
  createHttpRequestNode,
  createN8nNativeOutputSources,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';

export const evaluationDocument = {
  openapi: '3.1.0',
  info: { title: 'Synthetic diagnostic values', version: '1' },
  paths: {
    '/snapshot': {
      get: {
        responses: {
          200: {
            description: 'Original snapshot',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    state: {
                      type: 'string',
                      enum: ['done', 'working', 'aborted'],
                    },
                    pools: {
                      type: 'object',
                      additionalProperties: {
                        $ref: '#/components/schemas/Pool',
                      },
                    },
                    records: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                        additionalProperties: false,
                      },
                    },
                    opaque: { type: 'object' },
                  },
                  required: ['state', 'pools', 'records', 'opaque'],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pool: {
        type: 'object',
        properties: { waiting: { type: 'integer' } },
        additionalProperties: false,
      },
    },
  },
};

const source = (pointer) => ({
  source: 'response',
  nodeId: 'snapshot',
  pointer,
});
export const evaluationParameters = {
  checks: [
    {
      kind: 'compare',
      source: source('/state'),
      scope: 'value',
      valuePointer: '',
      measurement: 'value',
      cases: [
        { operator: 'equals', expected: 'done', status: 'normal' },
        { operator: 'equals', expected: 'working', status: 'warning' },
        { operator: 'equals', expected: 'aborted', status: 'abnormal' },
      ],
      otherwise: 'undetermined',
    },
    {
      kind: 'compare',
      source: source('/pools'),
      scope: 'object-values',
      valuePointer: '/waiting',
      measurement: 'value',
      cases: [
        { operator: 'equals', expected: 0, status: 'normal' },
        { operator: 'greaterThan', expected: 0, status: 'warning' },
      ],
      otherwise: 'undetermined',
    },
    {
      kind: 'compare',
      source: source('/records'),
      scope: 'value',
      valuePointer: '',
      measurement: 'array-length',
      cases: [
        { operator: 'equals', expected: 0, status: 'normal' },
        { operator: 'greaterThan', expected: 0, status: 'abnormal' },
      ],
      otherwise: 'undetermined',
    },
    { kind: 'unassessed', source: source('/opaque') },
  ],
};

export const evaluationBody = {
  state: 'working',
  pools: { primary: { waiting: 0 }, 'a/b~c': { waiting: 2 } },
  records: [{ id: '={{ original literal }}' }],
  opaque: {},
};

export async function createEvaluationOperation() {
  const catalog = await createApiCatalog([
    { id: 'synthetic-diagnostics', spec: evaluationDocument },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return operation;
}

/** Generic transport proof: real HTTP -> evaluation -> original typed report echoed by HTTP. */
export async function createResponseEvaluationWorkflow(baseUrl) {
  const operation = await createEvaluationOperation();
  const material = {
    operation,
    arguments: {
      callId: 'snapshot',
      values: {},
      bindings: [],
      unresolvedInputs: [],
    },
  };
  const capability = createResponseEvaluationCapability({
    sources: {
      apiMaterials: [{ callId: 'snapshot', operation }],
      nativeOutputs: [],
    },
  });
  const nativeNodes = [
    {
      id: 'evaluate',
      capability: capability.name,
      parameters: evaluationParameters,
    },
  ];
  // A consumer OAS owns its request contract independently of a native producer.
  // Exact policy/value preservation is checked after the consumer receives this report.
  const echoSchema = {
    type: 'object',
    required: ['checks', 'summary'],
    properties: {
      checks: { type: 'array', minItems: 1, items: { type: 'object' } },
      summary: {
        type: 'object',
        properties: Object.fromEntries(
          ['normal', 'warning', 'abnormal', 'undetermined'].map((key) => [
            key,
            { type: 'integer', minimum: 0 },
          ]),
        ),
        required: ['normal', 'warning', 'abnormal', 'undetermined'],
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
  const catalog = await createApiCatalog([
    {
      id: 'echo',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Evaluation report echo', version: '1' },
        paths: {
          '/echo': {
            post: {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: echoSchema } },
              },
              responses: {
                200: {
                  description: 'Unchanged evaluation report',
                  content: { 'application/json': { schema: echoSchema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [echoOperation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
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
          sourceNodeId: 'evaluate',
          sourcePointer: '',
        },
      ],
    },
  };
  const request = createHttpRequestNode({
    ...material,
    baseUrl,
    position: [0, 0],
  });
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes,
    capabilities: [capability],
    apiNodeNames: { snapshot: request.exit.name },
    apiResponseContracts: { snapshot: operation },
  });
  return compilePlannedN8nWorkflow({
    id: 'response-evaluation',
    name: 'Per-check response evaluation with original values',
    materials: [material, echo],
    capabilities: [capability],
    apiNodes: [
      request,
      createHttpRequestNode({
        ...echo,
        baseUrl,
        position: [1000, 0],
        nativeOutputSources,
      }),
    ],
    plan: {
      nativeNodes,
      starts: ['snapshot'],
      gaps: [],
      edges: [
        { from: 'snapshot', output: 'main', to: 'evaluate', input: 'main' },
        { from: 'evaluate', output: 'main', to: 'echo', input: 'main' },
      ],
    },
  }).workflow;
}
