import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode } from '@openapi-flow/n8n';

test('standalone request formats execute rather than serializing a foreign Code object', async () => {
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Standalone formats', version: '1' },
    paths: {
      '/consume': {
        get: {
          parameters: [
            {
              name: 'id',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'max',
              in: 'query',
              required: true,
              schema: { type: 'integer', format: 'int32' },
            },
            {
              name: 'time',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'date-time' },
            },
          ],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  };
  const catalog = await createApiCatalog([{ id: 'formats', spec }]);
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const fragment = createHttpRequestNode({
    operation,
    arguments: {
      callId: 'consumer',
      values: { query: { max: 20 } },
      unresolvedInputs: [],
      bindings: [
        {
          kind: 'node-output',
          targetPointer: '/query/id',
          sourceNodeId: 'producer',
          sourcePointer: '/id',
        },
        {
          kind: 'node-output',
          targetPointer: '/query/time',
          sourceNodeId: 'producer',
          sourcePointer: '/time',
        },
      ],
    },
    apiNodeNames: { producer: 'Producer' },
    baseUrl: 'https://fixture.test',
    position: [0, 0],
  });
  const code = fragment.entry.config.parameters.jsCode;
  assert.equal(code.includes('_items'), false);
  const execute = (time) =>
    vm.runInNewContext(`(function(){${code}})()`, {
      $: () => ({ all: () => [{ json: { body: { id: 'actual-id', time } } }] }),
    });
  const result = execute('2026-10-07T08:00:00Z')[0].json;
  assert.match(result.url, /max=20/);
  assert.match(result.url, /id=actual-id/);
  assert.throws(() => execute('not-a-date'), /date-time|contract|OAS|format/);
});
