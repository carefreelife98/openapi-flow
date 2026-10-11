import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerializedHttpRequestNode } from '../packages/n8n/dist/nodes/request/serialization/create-serialized-http-request-node.js';

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
