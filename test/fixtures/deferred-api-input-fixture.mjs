import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';

export async function deferredInputMaterial(schema, options = {}) {
  const spec = {
    openapi: options.openapi ?? '3.1.0',
    info: { title: 'Deferred API inputs', version: '1' },
    paths: {
      '/requests': {
        post: {
          requestBody: {
            required: options.required ?? true,
            content: { 'application/json': { schema } },
          },
          responses: { 200: { description: 'Accepted' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'inputs', spec }]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return {
    operation,
    callId: options.callId ?? 'submit',
    values: options.values ?? {},
    bindings: options.bindings ?? [],
    requestMediaType: 'application/json',
  };
}
