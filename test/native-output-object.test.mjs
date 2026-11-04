import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';

const sources = [
  {
    nodeId: 'responses',
    nodeName: 'Responses',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      required: ['results'],
      additionalProperties: false,
    },
  },
  {
    nodeId: 'check',
    nodeName: 'Check',
    schema: {
      type: 'object',
      properties: { pass: { const: true }, assertionCount: { const: 1 } },
      required: ['pass', 'assertionCount'],
      additionalProperties: false,
    },
  },
];
const parameters = {
  fields: [
    { name: 'responses', sourceNodeId: 'responses', pointer: '/results' },
    { name: 'priceCheck', sourceNodeId: 'check', pointer: '' },
  ],
};
function fixture() {
  return resolveN8nNativeFeatures({
    features: [N8nNativeFeature.ComposeNativeOutputs],
    nativeOutputSources: sources,
  }).capabilities[0];
}
function execute(capability, values) {
  const fragment = capability.compile({
    planned: { id: 'result', capability: capability.name, parameters },
    apiNodeNames: {},
    nativeOutputSources: sources,
    position: [0, 0],
  });
  assert.equal(fragment.nodes[0].type, 'n8n-nodes-base.merge');
  const output = fragment.exit.config.parameters.jsCode;
  const result = vm.runInNewContext(`(function(){${output}})()`, {
    $input: { all: () => [{ json: {} }] },
    $: (name) => ({ all: () => values[name] }),
  });
  return JSON.parse(JSON.stringify(result));
}
test('native object composition preserves complete typed sources in one named result and derives its actual schema', () => {
  const capability = fixture();
  const values = {
    Responses: [{ json: { results: [{ id: '001' }] } }],
    Check: [{ json: { pass: true, assertionCount: 1 } }],
  };
  const before = globalThis.structuredClone(values);
  const result = execute(capability, values);
  assert.deepEqual(result[0].json, {
    responses: [{ id: '001' }],
    priceCheck: { pass: true, assertionCount: 1 },
  });
  assert.deepEqual(values, before);
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  assert.equal(
    new Ajv2020({ strict: false }).compile(capability.outputSchema(parameters))(
      result[0].json,
    ),
    true,
  );
  assert.deepEqual(capability.inputPorts(parameters), ['input1', 'input2']);
});
test('native object composition rejects unknown pointers, duplicate names, changed contracts and ambiguous items', () => {
  const capability = fixture();
  for (const fields of [
    [{ name: 'x', sourceNodeId: 'missing', pointer: '' }],
    [{ name: 'x', sourceNodeId: 'check', pointer: '/missing' }],
    [parameters.fields[0], parameters.fields[0]],
  ])
    assert.equal(
      capability.parametersSchema.safeParse({ fields }).success,
      false,
    );
  const values = {
    Responses: [{ json: { results: [{ id: '001' }] } }],
    Check: [{ json: { pass: true, assertionCount: 1 } }],
  };
  assert.throws(
    () =>
      execute(capability, {
        ...values,
        Check: [{ json: { pass: false, assertionCount: 1 } }],
      }),
    /does not match declared schema/,
  );
  assert.throws(
    () =>
      execute(capability, {
        ...values,
        Check: [...values.Check, ...values.Check],
      }),
    /exactly one|ambiguous|one item/i,
  );
  assert.throws(
    () =>
      capability.compile({
        planned: { id: 'bad', capability: capability.name, parameters },
        apiNodeNames: {},
        nativeOutputSources: [],
        position: [0, 0],
      }),
    /matching actual compiled/,
  );
});
