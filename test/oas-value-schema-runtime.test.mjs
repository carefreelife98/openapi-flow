import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createHttpRequestNode } from '@openapi-flow/n8n';
import {
  requestOperation,
  outputBinding,
} from './fixtures/api-argument-generation-fixture.mjs';

test('standalone n8n request validation keeps OAS 3.0 exclusive bounds after response binding', async () => {
  const operation = await requestOperation(
    {
      type: 'object',
      properties: {
        quantity: {
          type: 'number',
          minimum: 1,
          exclusiveMinimum: true,
          maximum: 4,
          exclusiveMaximum: true,
        },
      },
      required: ['quantity'],
    },
    [],
    '3.0.3',
  );
  const before = globalThis.structuredClone(operation);
  const fragment = createHttpRequestNode({
    operation,
    arguments: {
      callId: 'consumer',
      values: {},
      bindings: [outputBinding('/body/quantity')],
      requestMediaType: 'application/json',
      unresolvedInputs: [],
    },
    baseUrl: 'https://fixture.test',
    credentialBindings: {},
    apiNodeNames: { source: 'Source' },
    position: [0, 0],
  });
  const code = fragment.entry.config.parameters.jsCode;
  const execute = (quantity) =>
    vm.runInNewContext(`(function(){${code}})()`, {
      $: () => ({
        all: () => [{ json: { body: { result: { value: quantity } } } }],
      }),
    });
  assert.deepEqual(JSON.parse(execute(2)[0].json.body.value), { quantity: 2 });
  for (const quantity of [1, 4, '2'])
    assert.throws(
      () => execute(quantity),
      /Runtime request consumer does not match the OAS schema/,
    );
  assert.deepEqual(operation, before);
});
