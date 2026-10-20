import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createSchemaResourceContext } from '../packages/core/dist/bindings/resources/create-schema-resource-context.js';

const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');

test('local model resource links preserve lexical IDs, anchors, recursive static references and assertion siblings without changing data literals', () => {
  const literal = {
    $ref: 'https://literal.invalid/not-a-schema',
    $id: 'verbatim-data',
  };
  const original = {
    $id: 'https://schema.invalid/root',
    type: 'object',
    $defs: {
      'a/b': {
        $id: 'child',
        $anchor: 'entry',
        type: 'object',
        properties: {
          value: { type: 'integer', minimum: 0 },
          next: { $ref: '#entry' },
          literal: { const: literal },
        },
        required: ['value'],
        additionalProperties: false,
      },
    },
    properties: { child: { $ref: 'child#entry', maxProperties: 2 } },
    required: ['child'],
    additionalProperties: false,
  };
  const resources = createSchemaResourceContext(original);
  const bundle = resources.bundleStaticProjections({
    root: resources.reference(resources.root),
  });
  const schema = { ...bundle.projections.root, $defs: bundle.definitions };
  const before = new Ajv2020({ strict: false }).compile(original);
  const after = new Ajv2020({ strict: false }).compile(schema);
  for (const value of [
    { child: { value: 0 } },
    { child: { value: 1, next: { value: 2, literal } } },
    { child: { value: -1 } },
    { child: { value: '1' } },
    { child: { value: 0, extra: true } },
    { child: { value: 0, next: { value: -1 } } },
    { child: { value: 0, next: { value: 1 }, literal } },
  ])
    assert.equal(after(value), before(value));
  assert.deepEqual(
    Object.values(bundle.definitions).find(
      (definition) => definition.properties?.literal,
    ).properties.literal.const,
    literal,
  );
  for (const definition of Object.values(bundle.definitions))
    assert.equal(Object.hasOwn(definition, '$id'), false);
  assert.match(schema.$ref, /^#\/\$defs\/schema-[a-f0-9]+$/);
  assert.equal(original.$id, 'https://schema.invalid/root');
});

test('boolean references and original allOf siblings remain rejecting, and dynamic scope is never silently rewritten', () => {
  const resources = createSchemaResourceContext({
    $defs: { denied: false },
    $ref: '#/$defs/denied',
    allOf: [{ type: 'string' }],
  });
  const bundle = resources.bundleStaticProjections({
    root: resources.reference(resources.root),
  });
  const validate = new Ajv2020({ strict: false }).compile({
    ...bundle.projections.root,
    $defs: bundle.definitions,
  });
  assert.equal(validate('anything'), false);
  const dynamic = createSchemaResourceContext({
    $dynamicAnchor: 'node',
    type: 'object',
    properties: { child: { $dynamicRef: '#node' } },
  });
  assert.throws(
    () => dynamic.bundleStaticProjections({ root: dynamic.root }),
    /dynamic/,
  );
});
