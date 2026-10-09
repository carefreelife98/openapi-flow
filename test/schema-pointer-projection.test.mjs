import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createApiCatalog,
  resolveApiOperations,
  createResponseValueSchema,
  createResponseArrayItemSchema,
  materializeApiArguments,
} from '@openapi-flow/core';
import { schemasAtPointer } from '../packages/core/dist/bindings/schema-at-pointer.js';
import { pointerValue } from '../packages/core/dist/bindings/json-pointer.js';

const { Ajv2020 } = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
)('ajv/dist/2020.js');
const compile = (schema) =>
  new Ajv2020({ strict: false, allErrors: true }).compile(schema);
const projected = (schema, pointer) =>
  compile({ anyOf: schemasAtPointer(schema, pointer) });
async function operation(schema, openapi = '3.1.0') {
  const catalog = await createApiCatalog([
    {
      id: 'projection',
      spec: {
        openapi,
        info: { title: 'Pointer projection', version: '1' },
        paths: {
          '/source': {
            get: {
              responses: {
                200: {
                  description: 'Response',
                  content: { 'application/json': { schema } },
                },
              },
            },
          },
        },
      },
    },
  ]);
  return (await resolveApiOperations(catalog, [catalog.operations[0].key]))[0];
}

test('allOf projections keep every same-field assertion, including sibling properties', () => {
  const schema = {
    type: 'object',
    properties: { count: { type: 'integer' } },
    allOf: [
      { properties: { count: { minimum: 2 } } },
      { properties: { count: { maximum: 5 } } },
    ],
  };
  const validate = projected(schema, '/count');
  assert.equal(validate(3), true);
  for (const value of [1, 6, '3', 3.5]) assert.equal(validate(value), false);
});
test('named properties and every matching pattern apply together; additional applies only to unmatched names', () => {
  const schema = {
    type: 'object',
    properties: { 'x/y~z': { type: 'integer' } },
    patternProperties: {
      '^x': { type: 'number', minimum: 2 },
      z$: { maximum: 5 },
    },
    additionalProperties: { type: 'boolean' },
  };
  const validate = projected(schema, '/x~1y~0z');
  assert.equal(validate(3), true);
  for (const value of [1, 6, '3', true]) assert.equal(validate(value), false);
  const patterned = projected(schema, '/xyz');
  assert.equal(patterned(3), true);
  assert.equal(patterned(true), false);
  const extra = projected(schema, '/other');
  assert.equal(extra(false), true);
  assert.equal(extra(3), false);
});
test('closed allOf branches cannot expose a pointer prohibited by a different branch', () => {
  const schema = {
    allOf: [
      {
        type: 'object',
        properties: { a: { type: 'string' } },
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: { b: { type: 'number' } },
        additionalProperties: false,
      },
    ],
  };
  assert.deepEqual(schemasAtPointer(schema, '/a'), []);
});
test('projected oneOf becomes candidate alternatives, not an exclusive test after parent discriminators disappear', () => {
  const schema = {
    oneOf: [
      {
        type: 'object',
        properties: { kind: { const: 'left' }, value: { type: 'integer' } },
        required: ['kind', 'value'],
      },
      {
        type: 'object',
        properties: { kind: { const: 'right' }, value: { type: 'number' } },
        required: ['kind', 'value'],
      },
    ],
  };
  const whole = compile(schema),
    child = projected(schema, '/value');
  assert.equal(whole({ kind: 'left', value: 2 }), true);
  assert.equal(child(2), true);
  assert.equal(child('2'), false);
});
test('numeric object properties, typed array positions, boolean schemas and optional pointers stay distinct', () => {
  assert.equal(
    projected(
      {
        type: 'object',
        properties: { 0: { type: 'string' } },
        additionalProperties: false,
      },
      '/0',
    )('x'),
    true,
  );
  const tuple = {
    type: 'array',
    prefixItems: [{ type: 'string' }, { type: 'number' }],
    items: false,
  };
  assert.equal(projected(tuple, '/0')('x'), true);
  assert.equal(projected(tuple, '/1')(2), true);
  assert.deepEqual(schemasAtPointer(tuple, '/2'), []);
  assert.deepEqual(
    schemasAtPointer(
      { type: 'string', properties: { id: { type: 'string' } } },
      '/id',
    ),
    [],
  );
  assert.deepEqual(
    schemasAtPointer(
      {
        type: 'object',
        properties: { optional: false },
        additionalProperties: false,
      },
      '/optional',
    ),
    [],
  );
  assert.deepEqual(schemasAtPointer(true, '/unconstrained'), [true]);
});
test('OAS 3.0 projected response values normalize nullable and exclusive bounds before native consumers', async () => {
  const source = await operation(
    {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          nullable: true,
          minimum: 0,
          exclusiveMinimum: true,
        },
      },
    },
    '3.0.3',
  );
  const original = globalThis.structuredClone(source.operation);
  const schema = createResponseValueSchema(source, '/amount');
  const validate = compile(schema);
  assert.equal(validate(null), true);
  assert.equal(validate(1), true);
  assert.equal(validate(0), false);
  assert.deepEqual(source.operation, original);
});
test('array item projections preserve conjunctive item constraints and type-free array declarations', async () => {
  const schema = {
    allOf: [
      { type: 'array', items: { type: 'integer', minimum: 2 } },
      { items: { maximum: 5 } },
    ],
  };
  const source = await operation(schema);
  const validate = compile(createResponseArrayItemSchema(source, ''));
  assert.equal(validate(3), true);
  for (const value of [1, 6, '3', 3.5]) assert.equal(validate(value), false);
  const typeFree = await operation({ items: { type: 'string' } });
  assert.equal(compile(createResponseArrayItemSchema(typeFree, ''))('x'), true);
});

test('container kinds flow across same-location allOf branches, not down to child values', () => {
  const schema = {
    allOf: [
      { type: 'array', items: { type: 'integer', minimum: 2 } },
      { items: { maximum: 5 } },
    ],
  };
  const validate = projected(schema, '/0');
  assert.equal(validate(3), true);
  assert.equal(validate(1), false);
  assert.equal(validate(6), false);
  const nested = projected(
    { type: 'object', properties: { values: schema } },
    '/values/0',
  );
  assert.equal(nested(3), true);
  assert.equal(nested(6), false);
});

test('differential projection checks accept every existing pointer from OAS-valid samples without changing data', () => {
  const property = {
    type: 'object',
    properties: { value: { type: ['number', 'null'] } },
    additionalProperties: false,
  };
  const schemas = [
    property,
    {
      allOf: [property, { properties: { value: { minimum: 2, maximum: 5 } } }],
    },
    {
      anyOf: [
        property,
        {
          type: 'object',
          properties: { value: { type: 'string' } },
          additionalProperties: false,
        },
      ],
    },
    {
      type: 'object',
      properties: { value: { type: 'number' } },
      if: { required: ['flag'] },
      then: { properties: { value: { minimum: 4 } } },
      else: { properties: { value: { maximum: 3 } } },
    },
    {
      type: 'object',
      properties: { value: { type: 'number' } },
      unevaluatedProperties: false,
    },
    {
      allOf: [
        {
          type: 'array',
          prefixItems: [{ type: 'integer' }, { type: 'string' }],
          items: false,
        },
        { prefixItems: [{ minimum: 2 }, { minLength: 2 }] },
      ],
    },
    {
      type: 'array',
      items: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      contains: { const: 2 },
      minContains: 1,
      uniqueItems: true,
    },
    {
      type: ['object', 'array'],
      properties: { 0: { type: 'string' } },
      items: { type: 'number' },
    },
  ];
  const samples = [
    {},
    ...[null, 0, 1, 2, 3, 4, 6, 'x', 'xx', true, {}, []].flatMap((value) => [
      { value },
      { value, flag: true },
      [value],
      [value, 'xx'],
    ]),
    [2, null],
    [2, 'xx'],
    [3, 'xx'],
    [2, 2],
    { 0: 'x' },
  ];
  let checked = 0;
  for (const schema of schemas) {
    const whole = compile(schema);
    for (const sample of samples) {
      if (!whole(sample)) continue;
      const before = globalThis.structuredClone(sample);
      for (const pointer of ['/value', '/0', '/1']) {
        const value = pointerValue(sample, pointer);
        if (value === undefined) continue;
        const candidates = schemasAtPointer(schema, pointer);
        assert.ok(
          candidates.length,
          JSON.stringify({ schema, sample, pointer }),
        );
        assert.equal(
          compile({ anyOf: candidates })(value),
          true,
          JSON.stringify({ schema, sample, pointer }),
        );
        checked++;
      }
      assert.deepEqual(sample, before);
    }
  }
  assert.ok(checked >= 40);
});

test('array item contracts are necessary candidates, not a replacement for tuple positions or full oneOf validation', async () => {
  const schema = {
    allOf: [
      {
        type: 'array',
        prefixItems: [{ type: 'integer' }, { type: 'string' }],
        items: false,
      },
      { prefixItems: [{ minimum: 2 }, { minLength: 2 }] },
    ],
  };
  const source = await operation(schema);
  const candidate = compile(createResponseArrayItemSchema(source, ''));
  for (const array of [[2, 'xx'], [3, 'xx'], []]) {
    assert.equal(compile(schema)(array), true);
    for (const item of array) assert.equal(candidate(item), true);
  }
  assert.equal(compile(schema)(['xx', 2]), false);
  assert.equal(candidate('xx'), true);
  const empty = await operation({ type: 'array', items: false });
  assert.equal(compile(createResponseArrayItemSchema(empty, ''))(1), false);
});

test('request materialization reads explicit array and object kinds through composition without guessing numeric names', async () => {
  const body = {
    allOf: [
      {
        type: 'array',
        items: {
          allOf: [
            { type: 'object', properties: { amount: { type: 'integer' } } },
            { properties: { amount: { minimum: 2 } } },
          ],
        },
      },
      { maxItems: 1 },
    ],
  };
  const catalog = await createApiCatalog([
    {
      id: 'containers',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Composed request containers', version: '1' },
        paths: {
          '/sink': {
            post: {
              requestBody: {
                content: { 'application/json': { schema: body } },
              },
              responses: { 200: { description: 'OK' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const material = { callId: 'sink', operation };
  const bindings = [
    {
      kind: 'node-output',
      sourceNodeId: 'source',
      sourcePointer: '/amount',
      targetPointer: '/body/0/amount',
    },
  ];
  assert.deepEqual(
    materializeApiArguments({}, bindings, { source: { amount: 3 } }, material),
    { body: [{ amount: 3 }] },
  );
});
