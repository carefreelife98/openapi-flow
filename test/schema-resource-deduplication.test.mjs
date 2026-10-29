import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { deduplicateCanonicalSchemaResources } from '@openapi-flow/core';
import { createResponseEvaluationCapability } from '@openapi-flow/n8n';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const identifier = 'https://schemas.example.test/original';
const resource = {
  $id: identifier,
  type: 'object',
  properties: { a: { type: 'number' }, b: { type: 'string' } },
  additionalProperties: false,
};
const projection = (pointer) => ({
  $ref: identifier + pointer,
  $defs: { resource: globalThis.structuredClone(resource) },
});

test('repeated canonical resources retain one declaration and original URI-based property contracts', () => {
  const schema = {
    type: 'object',
    properties: {
      a: projection('#/properties/a'),
      b: projection('#/properties/b'),
    },
    additionalProperties: false,
  };
  const before = globalThis.structuredClone(schema);
  assert.throws(
    () => new Ajv2020({ strict: false }).compile(schema),
    /more than one schema/,
  );
  const result = deduplicateCanonicalSchemaResources(schema);
  const validate = new Ajv2020({ strict: false }).compile(result);
  for (const value of [{ a: 0, b: 'x' }, { a: 1 }, { b: '' }])
    assert.equal(validate(value), true);
  for (const value of [{ a: '0', b: 'x' }, { a: 0, b: 1 }, { extra: true }])
    assert.equal(validate(value), false);
  assert.deepEqual(schema, before);
  assert.equal(result.properties.a.$ref, schema.properties.a.$ref);
  assert.equal(result.properties.b.$ref, schema.properties.b.$ref);
  assert.deepEqual(result.properties.a.$defs.resource, resource);
  assert.deepEqual(result.properties.b.$defs.resource, { $ref: identifier });
});

test('conflicting declarations of one resource URI fail instead of choosing or merging definitions', () => {
  const left = projection('#/properties/a');
  const right = projection('#/properties/b');
  right.$defs.resource.properties.a.type = 'string';
  assert.throws(
    () => deduplicateCanonicalSchemaResources({ anyOf: [left, right] }),
    /Conflicting schema resources/,
  );
});

test('relative resource IDs use their declared parent without inventing a retrieval base', () => {
  const child = { $id: 'child.json', type: 'integer' };
  const schema = {
    $id: 'https://schemas.example.test/parent/root.json',
    $defs: { one: child, two: globalThis.structuredClone(child) },
    $ref: 'child.json',
  };
  const result = deduplicateCanonicalSchemaResources(schema);
  const validate = new Ajv2020({ strict: false }).compile(result);
  assert.equal(validate(1), true);
  assert.equal(validate('1'), false);
  assert.equal(
    result.$defs.two.$ref,
    'https://schemas.example.test/parent/child.json',
  );
  assert.throws(
    () =>
      deduplicateCanonicalSchemaResources({
        $defs: { unknown: { $id: 'relative.json', type: 'string' } },
      }),
    /absolute URI or an identified parent/,
  );
});

test('resource-looking literal data in const, enum, defaults and examples is never interpreted as schema metadata', () => {
  const literal = {
    $id: identifier,
    $ref: 'literal',
    properties: { $id: 'data' },
  };
  const schema = {
    type: 'object',
    properties: { a: projection('#/properties/a') },
    const: literal,
    enum: [literal],
    default: literal,
    examples: [literal],
  };
  const result = deduplicateCanonicalSchemaResources(schema);
  for (const field of ['const', 'enum', 'default', 'examples'])
    assert.deepEqual(result[field], schema[field]);
});

test('recursive dynamic references keep their original resource identity across multiple consumers', () => {
  const node = {
    $id: identifier,
    $dynamicAnchor: 'node',
    type: 'object',
    properties: {
      value: { type: 'integer' },
      children: { type: 'array', items: { $dynamicRef: '#node' } },
    },
    required: ['value'],
    additionalProperties: false,
  };
  const from = () => ({
    $ref: identifier,
    $defs: { resource: globalThis.structuredClone(node) },
  });
  const result = deduplicateCanonicalSchemaResources({
    type: 'object',
    properties: { left: from(), right: from() },
    required: ['left', 'right'],
  });
  const validate = new Ajv2020({ strict: false }).compile(result);
  assert.equal(
    validate({
      left: { value: 1, children: [{ value: 2 }] },
      right: { value: 3 },
    }),
    true,
  );
  assert.equal(
    validate({
      left: { value: 1 },
      right: { value: 3, children: [{ value: 'wrong' }] },
    }),
    false,
  );
});

test('two evaluations of the same native output compile and retain original values and source pointers at runtime', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'string' } },
    required: ['a', 'b'],
    additionalProperties: false,
  };
  const source = { nodeId: 'original', schema };
  const body = { a: 1, b: 'x' };
  const parameters = {
    checks: ['a', 'b'].map((field) => ({
      kind: 'compare',
      source: {
        source: 'node-output',
        nodeId: 'original',
        pointer: '/' + field,
      },
      scope: 'value',
      valuePointer: '',
      measurement: 'value',
      cases: [{ operator: 'equals', expected: body[field], status: 'normal' }],
      otherwise: 'abnormal',
    })),
  };
  const capability = createResponseEvaluationCapability({
    sources: { apiMaterials: [], nativeOutputs: [source] },
  });
  const validate = new Ajv2020({ strict: false }).compile(
    capability.outputSchema(parameters),
  );
  const fragment = capability.compile({
    planned: { id: 'evaluate', capability: capability.name, parameters },
    apiNodeNames: {},
    nativeOutputSources: [{ ...source, nodeName: 'Original native' }],
    position: [0, 0],
  });
  const original = globalThis.structuredClone(body);
  const result = vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => [{ json: body }] },
      $: () => ({ all: () => [{ json: body }] }),
    },
  );
  const report = JSON.parse(JSON.stringify(result[0].json));
  assert.equal(validate(report), true);
  assert.equal(report.summary.normal, 2);
  assert.deepEqual(
    report.checks.map((x) => x.actualValue),
    [1, 'x'],
  );
  assert.deepEqual(
    report.checks.map((x) => x.source.pointer),
    ['/a', '/b'],
  );
  assert.deepEqual(body, original);
});
