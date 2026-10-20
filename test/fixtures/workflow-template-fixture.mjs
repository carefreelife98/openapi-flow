import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
} from '@openapi-flow/core';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';

export const requestBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['quantity', 'enabled', 'labels', 'metadata', 'nullable'],
  properties: {
    quantity: { type: 'integer', minimum: 0, maximum: 100, example: 8 },
    enabled: { type: 'boolean', default: true },
    labels: { type: 'array', items: { type: 'string' }, minItems: 1 },
    metadata: {
      type: 'object',
      required: ['0'],
      additionalProperties: false,
      properties: { 0: { type: 'string' } },
    },
    nullable: { type: ['string', 'null'] },
  },
};
export async function workflowTemplateFixture(
  capabilities = createN8nNativeCapabilities(),
) {
  const response = {
    200: {
      description: 'Read result',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
    },
  };
  const catalog = await createApiCatalog([
    {
      id: 'template-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Input template fixture', version: '1' },
        paths: {
          '/seed': {
            get: {
              parameters: [
                {
                  in: 'query',
                  name: 'id',
                  required: true,
                  schema: { type: 'string', pattern: '^input-' },
                },
              ],
              responses: response,
            },
          },
          '/submit/{id}': {
            post: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              requestBody: {
                required: true,
                content: { 'application/json': { schema: requestBodySchema } },
              },
              responses: response,
            },
          },
          '/health': { get: { responses: response } },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const byPath = (path) =>
    operations.find((operation) => operation.path === path);
  const context = {
    operations,
    capabilities,
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'input-template',
      requirements: [],
      apiCalls: [
        {
          id: 'seed',
          operation: byPath('/seed').key,
          values: {},
          bindings: [],
        },
        {
          id: 'submit',
          operation: byPath('/submit/{id}').key,
          values: { body: {} },
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'seed',
              sourcePointer: '/id',
              targetPointer: '/path/id',
            },
          ],
        },
        {
          id: 'health',
          operation: byPath('/health').key,
          values: {},
          bindings: [],
        },
      ],
      nativeNodes: [
        {
          id: 'join',
          capability: 'merge-append',
          parameters: { numberInputs: 2 },
        },
      ],
      edges: [
        { from: 'seed', output: 'main', to: 'submit', input: 'main' },
        { from: 'submit', output: 'main', to: 'join', input: 'input1' },
        { from: 'health', output: 'main', to: 'join', input: 'input2' },
      ],
    },
  });
  return {
    draft,
    context,
    name: '입력 템플릿 검증',
    deployments: [
      {
        documentId: 'template-fixture',
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
  };
}

export function actualTemplateInputs(slots) {
  const actual = {
    '/query/id': 'input-actual',
    '/body/quantity': 0,
    '/body/enabled': false,
    '/body/labels': ['={{ this is literal data }}'],
    '/body/metadata': { 0: 'actual' },
    '/body/nullable': null,
  };
  return Object.fromEntries(
    slots.map((slot) => {
      if (!Object.hasOwn(actual, slot.targetPointer))
        throw new Error('Missing fixture input ' + slot.targetPointer);
      return [slot.id, actual[slot.targetPointer]];
    }),
  );
}
