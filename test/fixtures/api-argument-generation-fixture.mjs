import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';

export const outputBinding = (targetPointer) => ({
  kind: 'node-output',
  sourceNodeId: 'source',
  sourcePointer: '/result/value',
  targetPointer,
});

export async function requestOperation(
  schema,
  parameters = [],
  openapiVersion = '3.1.0',
) {
  const spec = {
    openapi: openapiVersion,
    info: { title: 'Literal ownership fixture', version: '1' },
    paths: {
      '/consumer': {
        post: {
          parameters,
          requestBody: {
            required: true,
            content: { 'application/json': { schema } },
          },
          responses: { 200: { description: 'Result' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'fixture', spec }]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return operation;
}

export function noInvocationModel() {
  return {
    withStructuredOutput() {
      throw new Error(
        'No literal decision remains: the model must not be invoked',
      );
    },
  };
}
