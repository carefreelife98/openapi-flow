import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';
import { z } from 'zod';
import { createJsonOutputCapability } from '@openapi-flow/n8n';
import { editDecision } from './workflow-draft-edit-fixture.mjs';

const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const response = (properties) => ({
  200: {
    description: 'Actual fixture JSON',
    content: { 'application/json': { schema: object(properties) } },
  },
});
const parameter = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string' },
};
export const assemblyBodySchema = object({
  name: { type: 'string' },
  config: object({
    enabled: { type: 'boolean' },
    count: { type: 'integer' },
    0: { type: 'string' },
    'a.b': { type: 'string' },
  }),
  lines: {
    type: 'array',
    items: object({ id: { type: 'string' }, quantity: { type: 'integer' } }),
  },
  nullable: { type: ['string', 'null'] },
  marker: { type: 'string' },
});
export const assemblyBodyValue = {
  name: 'existing',
  config: { enabled: false, count: 0, 0: 'zero-key', 'a.b': 'dotted-key' },
  lines: [
    { id: 'first', quantity: 2 },
    { id: 'second', quantity: 3 },
  ],
  nullable: null,
  marker: '={{ literal }}',
};
export async function workflowDraftEditAssemblyFixture(
  text = 'Change only the count.',
) {
  const catalog = await createApiCatalog([
    {
      id: 'edit-assembly-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Explicit edit contracts', version: '1' },
        paths: {
          '/items/{id}': {
            post: {
              parameters: [parameter],
              requestBody: {
                required: true,
                content: {
                  'application/json': { schema: assemblyBodySchema },
                  'application/x-www-form-urlencoded': {
                    schema: object({ sku: { type: 'string' } }),
                  },
                },
              },
              responses: response({ value: { type: 'string' } }),
            },
          },
          '/lookup/{id}': {
            get: {
              parameters: [
                parameter,
                { in: 'query', name: 'locale', schema: { type: 'string' } },
                { in: 'query', name: 'view', schema: { type: 'string' } },
              ],
              responses: response({ value: { type: 'string' } }),
            },
          },
          '/replacement/{id}': {
            get: {
              parameters: [parameter],
              responses: response({ renamed: { type: 'string' } }),
            },
          },
        },
      },
    },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const producer = operations.find(
    (operation) => operation.path === '/items/{id}',
  );
  const lookup = operations.find(
    (operation) => operation.path === '/lookup/{id}',
  );
  const replacement = operations.find(
    (operation) => operation.path === '/replacement/{id}',
  );
  const context = {
    operations,
    capabilities: [
      createJsonOutputCapability({
        name: 'typed-context',
        description: 'Explicit typed context',
        parametersSchema: z.strictObject({
          count: z.number().int(),
          enabled: z.boolean(),
          nested: z.strictObject({ value: z.string() }),
        }),
      }),
    ],
    messages: [
      {
        id: 'initial',
        text: 'Call source, then follow; independent is separate.',
      },
      { id: 'edit-1', text },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'edit-assembly',
      requirements: [],
      nativeNodes: [],
      apiCalls: [
        {
          id: 'source',
          operation: producer.key,
          values: { path: { id: 'original-id' }, body: assemblyBodyValue },
          bindings: [],
          requestMediaType: 'application/json',
        },
        {
          id: 'follow',
          operation: lookup.key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'source',
              sourcePointer: '/value',
              targetPointer: '/path/id',
            },
          ],
        },
        {
          id: 'independent',
          operation: lookup.key,
          values: { path: { id: 'independent-id' } },
          bindings: [],
        },
      ],
      edges: [{ from: 'source', output: 'main', to: 'follow', input: 'main' }],
    },
  });
  return {
    draft,
    context,
    requestMessageIds: ['edit-1'],
    producer,
    lookup,
    replacement,
  };
}
export function assemblyPlan(input, decisions) {
  return createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: decisions.map((fields) =>
        editDecision(
          fields,
          input.context.messages.find((message) => message.id === 'edit-1')
            .text,
        ),
      ),
    },
  });
}
