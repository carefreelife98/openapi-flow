import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import {
  projectNativeValueSchema,
  createNativeValueSchema,
  createNativeArrayItemSchema,
  createNativeObjectEntrySchema,
} from '@openapi-flow/core';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const output = {
  nodeId: 'declared-source',
  schema: {
    type: 'object',
    additionalProperties: false,
    $defs: {
      row: {
        type: 'object',
        properties: {
          qty: { type: ['number', 'null'] },
          tags: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
    properties: {
      data: { type: 'array', items: { $ref: '#/$defs/row' } },
      map: { type: 'object', additionalProperties: { $ref: '#/$defs/row' } },
      count: { type: 'integer' },
    },
  },
};
function chain(steps) {
  let schema = output.schema;
  for (const step of steps) {
    const root = { nodeId: output.nodeId, schema };
    if (step.kind === 'value')
      schema = createNativeValueSchema(root, step.pointer);
    else if (step.kind === 'array-items')
      schema = createNativeArrayItemSchema(root, '');
    else if (step.kind === 'object-entries')
      schema = createNativeObjectEntrySchema(root, '');
    else createNativeArrayItemSchema(root, '');
  }
  return schema;
}
function validator(schema) {
  return new Ajv2020({ strict: false }).compile(schema);
}
const corpus = [
  null,
  false,
  true,
  0,
  1,
  1.5,
  '0',
  '',
  {},
  [],
  ['x'],
  [1],
  { qty: 0 },
  { qty: null },
  { qty: '0' },
  { tags: [] },
  { tags: ['x'] },
];
for (const [name, steps] of [
  [
    'array item value',
    [
      { kind: 'value', pointer: '/data' },
      { kind: 'array-items' },
      { kind: 'value', pointer: '/qty' },
    ],
  ],
  [
    'object entry value',
    [
      { kind: 'value', pointer: '/map' },
      { kind: 'object-entries' },
      { kind: 'value', pointer: '/qty' },
    ],
  ],
  [
    'array measurement shape',
    [
      { kind: 'value', pointer: '/data' },
      { kind: 'array-items' },
      { kind: 'value', pointer: '/tags' },
      { kind: 'require-array' },
    ],
  ],
  ['whole source', [{ kind: 'value', pointer: '' }]],
])
  test(`one-context ${name} projection preserves the original repeated-projection value domain`, () => {
    const before = globalThis.structuredClone(output);
    const old = chain(steps);
    const result = projectNativeValueSchema({ output, steps });
    const legacy = validator(old),
      current = validator(result);
    for (const value of corpus)
      assert.equal(
        current(value),
        legacy(value),
        JSON.stringify({ name, value }),
      );
    assert.deepEqual(output, before);
    if (steps.length > 1)
      assert(
        JSON.stringify(result).length < JSON.stringify(old).length,
        'No intermediate schema bundle should be re-embedded',
      );
  });

test('empty or false domains and missing declarations do not become replacement values', () => {
  for (const steps of [
    [{ kind: 'value', pointer: '/absent' }],
    [{ kind: 'value', pointer: '/count' }, { kind: 'array-items' }],
    [{ kind: 'value', pointer: '/count' }, { kind: 'object-entries' }],
    [{ kind: 'value', pointer: '/count' }, { kind: 'require-array' }],
    [{ kind: 'value', pointer: 'malformed' }],
    [{ kind: 'guessed' }],
  ])
    assert.throws(() => projectNativeValueSchema({ output, steps }));
  assert.throws(
    () =>
      projectNativeValueSchema({
        output: { nodeId: 'false-domain', schema: false },
        steps: [],
      }),
    /no declared value/,
  );
});

test('tuple alternatives and nullable source siblings stay in their original resource context', () => {
  const source = {
    nodeId: 'tuple',
    schema: {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: ['number', 'null'] }],
      items: false,
      maxItems: 2,
    },
  };
  const result = projectNativeValueSchema({
    output: source,
    steps: [{ kind: 'array-items' }, { kind: 'value', pointer: '' }],
  });
  const validate = validator(result);
  for (const value of ['text', 0, null]) assert.equal(validate(value), true);
  for (const value of [false, {}, []]) assert.equal(validate(value), false);
});
