import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';

// Synthetic public fixture only. No model, business service, private OAS or credential.
export const pagePagination = {
  mode: 'page-number',
  output: 'per-page',
  parameter: 'page',
  start: 1,
  step: 1,
  maxRequests: 3,
  requestInterval: 0,
  termination: { kind: 'max-requests' },
};
export async function paginationInput({
  pagination = pagePagination,
  pageSchema = { type: 'integer', minimum: 1, maximum: 50 },
  cursorSchema = { type: 'string', pattern: '^[a-z]+$', maxLength: 12 },
  query = { page: 1, filter: 'A B&/' },
  parameters = [],
  method = 'get',
  requestBody,
} = {}) {
  const catalog = await createApiCatalog([
    {
      id: 'pagination-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Synthetic pagination', version: '1' },
        paths: {
          '/pages': {
            [method]: {
              ...(requestBody === undefined ? {} : { requestBody }),
              parameters: [
                { name: 'page', in: 'query', schema: pageSchema },
                { name: 'cursor', in: 'query', schema: cursorSchema },
                { name: 'filter', in: 'query', schema: { type: 'string' } },
                ...parameters,
              ],
              responses: {
                200: {
                  description: 'One original page body per HTTP response',
                  content: {
                    'application/json': { schema: { type: 'string' } },
                  },
                  headers: { 'X-Next-URL': { schema: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  return {
    operation,
    arguments: {
      callId: 'pages',
      values: { query },
      bindings: [],
      unresolvedInputs: [],
    },
    pagination: globalThis.structuredClone(pagination),
    baseUrl: 'https://example.test',
    position: [0, 0],
  };
}
