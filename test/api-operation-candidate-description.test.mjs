import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  describeApiOperationCandidate,
} from '@openapi-flow/core';

for (const version of ['3.0.3', '3.1.1', '3.2.0']) {
  test(`operation discovery preserves every candidate and source contract in OAS ${version}`, async () => {
    const get = {
      description: 'Read records',
      responses: {
        200: {
          description: 'Read',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { type: 'string', enum: ['', '=literal', '雪'] },
              },
            },
          },
        },
      },
    };
    const post = {
      description: 'Create record',
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                quantity: { type: 'integer', minimum: 0 },
                enabled: { type: 'boolean' },
              },
              required: ['quantity', 'enabled'],
            },
          },
        },
      },
      responses: { 201: { description: 'Created' } },
    };
    const metadata = {
      summary: 'Shared path',
      description: 'Path meaning',
      parameters: [
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 0, default: 0 },
        },
      ],
      servers: [{ url: 'https://api.example.test/' }],
      'x-domain': { enabled: false, priority: 0 },
    };
    const spec = {
      openapi: version,
      info: { title: 'Projection fixture', version: '1' },
      paths: {
        '/records': {
          ...metadata,
          get,
          post,
          ...(version === '3.2.0'
            ? { query: get, additionalOperations: { PROPFIND: get } }
            : {}),
        },
      },
    };
    const catalog = await createApiCatalog([{ id: 'projection', spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map(({ key }) => key),
    );
    const before = globalThis.structuredClone(operations);
    assert.equal(operations.length, version === '3.2.0' ? 4 : 2);
    for (const operation of operations) {
      const projected = describeApiOperationCandidate(operation);
      for (const field of ['key', 'source', 'method', 'path'])
        assert.deepEqual(projected[field], operation[field], field);
      assert.deepEqual(
        projected,
        catalog.operations.find(
          ({ key }) => key.operationRef === operation.key.operationRef,
        ),
      );
      assert.equal(Object.hasOwn(projected, 'pathItem'), false);
      assert.equal(Object.hasOwn(projected, 'operation'), false);
      assert.equal(Object.hasOwn(projected, 'effective'), false);
      projected.key.documentId = 'Changed copy only';
      assert.notEqual(operation.key.documentId, 'Changed copy only');
    }
    assert.deepEqual(operations, before);
  });
}
