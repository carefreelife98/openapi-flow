import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerializedHttpRequestNode } from '../packages/n8n/dist/nodes/request/serialization/create-serialized-http-request-node.js';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { createHttpRequestNode } from '@openapi-flow/n8n';

for (const mediaType of [
  'application/json',
  'application/x-www-form-urlencoded',
]) {
  test(`literal transport sends the selected OAS body media type ${mediaType} explicitly`, async () => {
    const catalog = await createApiCatalog([
      {
        id: 'echo',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Request media fixture', version: '1' },
          paths: {
            '/echo': {
              post: {
                requestBody: {
                  required: true,
                  content: {
                    [mediaType]: {
                      schema: {
                        type: 'object',
                        required: ['name'],
                        properties: { name: { type: 'string' } },
                      },
                    },
                  },
                },
                responses: { 200: { description: 'Echo' } },
              },
            },
          },
        },
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const fragment = createHttpRequestNode({
      operation,
      arguments: {
        callId: 'echo',
        values: { body: { name: 'A B' } },
        bindings: [],
        unresolvedInputs: [],
        requestMediaType: mediaType,
      },
      baseUrl: 'https://example.test',
      position: [0, 0],
    });
    const transport = fragment.entry.config.parameters;
    assert.equal(transport.sendHeaders, true);
    assert.deepEqual(transport.headerParameters.parameters, [
      { name: 'Content-Type', value: mediaType },
    ]);
  });
}

for (const method of ['POST', 'DELETE']) {
  for (const body of [
    'ordinary string',
    '42',
    '{"id":42}',
    '',
    42,
    false,
    null,
    { id: 42 },
    [null, '42'],
  ]) {
    test(`${method} literal JSON transport encodes its node parameter separately from the unchanged wire value ${JSON.stringify(body)}`, () => {
      const wireText = JSON.stringify(body);
      const request = createSerializedHttpRequestNode({
        operation: {
          source: 'paths',
          operationRef: `#/paths/~1echo/${method.toLowerCase()}`,
          method,
        },
        id: 'echo-transport',
        name: 'Receive echo',
        position: [0, 0],
        url: 'https://example.com/echo',
        headers: [],
        shouldAssert: false,
        body: { contentType: 'json', value: wireText },
        bodySource: 'literal',
      });
      assert.equal(request.config.parameters.contentType, 'json');
      assert.equal(JSON.parse(request.config.parameters.jsonBody), wireText);
      assert.deepEqual(
        JSON.parse(JSON.parse(request.config.parameters.jsonBody)),
        body,
      );
    });
  }
}

test('materialized JSON transport encodes only its parameter envelope and does not re-serialize a response value', () => {
  const request = createSerializedHttpRequestNode({
    operation: {
      source: 'paths',
      operationRef: '#/paths/~1echo/post',
      method: 'POST',
    },
    id: 'echo-transport',
    name: 'Receive echo',
    position: [0, 0],
    url: '={{ $json.url }}',
    headers: [],
    shouldAssert: false,
    body: { contentType: 'json', value: '={{ $json.body.value }}' },
    bodySource: 'materialized',
  });
  assert.equal(
    request.config.parameters.jsonBody,
    '={{ JSON.stringify($json.body.value) }}',
  );
});
