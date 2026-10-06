import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createValidator } from '@scalar/json-schema-validator';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  createApiArgumentGenerationContract,
  validateApiArguments,
} from '@openapi-flow/core';
import { createOperationPlanSchema } from '../packages/core/dist/schemas/operation-plan-schema.js';
import { createOasValueSchema } from '../packages/core/dist/schemas/create-oas-value-schema.js';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';

const examples = [
  ['type-less numeric bound', { maximum: 3 }, [3, 'untyped', null], [4]],
  ['type-less string constraint', { minLength: 2 }, ['ok', 2], ['x']],
  ['type-less array constraint', { minItems: 2 }, [[1, 2], 'untyped'], [[1]]],
  [
    'type-less object constraint',
    { maxProperties: 1 },
    [{ a: 1 }, 2],
    [{ a: 1, b: 2 }],
  ],
  [
    'enum with a sibling bound',
    { enum: [1, 2, 4], maximum: 3 },
    [1, 2],
    [4, 3],
  ],
  [
    'const with a sibling constraint',
    { const: 'x', minLength: 2 },
    [],
    ['x', 'xx'],
  ],
  [
    'simultaneous compositions',
    {
      anyOf: [{ type: 'number' }, { type: 'string' }],
      allOf: [{ not: { const: 'forbidden' } }],
    },
    [2, 'ok'],
    ['forbidden', false],
  ],
  [
    'tuple positions',
    {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
    },
    [['x', 1]],
    [
      [1, 'x'],
      ['x', 1, 2],
    ],
  ],
  [
    'unevaluated properties',
    {
      type: 'object',
      allOf: [{ properties: { name: { type: 'string' } } }],
      unevaluatedProperties: false,
    },
    [{ name: 'x' }],
    [{ name: 'x', extra: true }],
  ],
  ['safe integer is not an OAS bound', { type: 'integer' }, [1e16], [1.5]],
  [
    'readOnly is not a freezing transform',
    {
      type: 'object',
      readOnly: true,
      properties: { name: { type: 'string' } },
    },
    [{ name: 'x' }],
    [{ name: 1 }],
  ],
];

for (const [name, definition, valid, invalid] of examples) {
  test(`OAS generation preserves ${name} in local parsing and the LangChain wire schema`, async () => {
    const operation = await requestOperation(definition);
    const before = globalThis.structuredClone(operation);
    const contract = createApiArgumentGenerationContract({
      operation,
      bindings: [],
      requestMediaType: 'application/json',
    });
    const wire = toJsonSchema(contract.schema);
    assert.deepEqual(wire, contract.literalInputSchema);
    assert.deepEqual(wire, z.toJSONSchema(contract.schema));
    const validate = createValidator(wire);
    for (const value of valid) {
      const proposal = { values: { body: globalThis.structuredClone(value) } };
      const parsed = contract.schema.parse(proposal);
      assert.deepEqual(parsed, proposal);
      assert.equal(validate(proposal).valid, true);
      assert.equal(
        validateApiArguments({
          operation,
          bindings: [],
          requestMediaType: 'application/json',
          values: proposal.values,
        }).valid,
        true,
      );
      if (value !== null && typeof value === 'object')
        assert.equal(Object.isFrozen(parsed.values.body), false);
    }
    for (const value of invalid) {
      const proposal = { values: { body: value } };
      assert.equal(contract.schema.safeParse(proposal).success, false);
      assert.equal(validate(proposal).valid, false);
      assert.throws(
        () =>
          validateApiArguments({
            operation,
            bindings: [],
            requestMediaType: 'application/json',
            values: proposal.values,
          }),
        /does not match the OAS schema/,
      );
    }
    assert.deepEqual(operation, before);
  });
}

test('legacy planning uses the same constraint-preserving value boundary', () => {
  const schema = createOperationPlanSchema(
    {
      operationRef: '#/paths/~1items/post',
      parameters: [{ in: 'query', name: 'quantity', schema: { maximum: 3 } }],
      body: {
        mediaTypes: {
          'application/json': { schema: { enum: [1, 2, 4], maximum: 3 } },
        },
      },
    },
    '3.1.1',
  );
  assert.equal(
    schema.safeParse({ inputs: { query: { quantity: 4 } } }).success,
    false,
  );
  assert.equal(schema.safeParse({ inputs: { body: 4 } }).success, false);
  assert.deepEqual(
    schema.parse({ inputs: { query: { quantity: 2 }, body: 2 } }),
    { inputs: { query: { quantity: 2 }, body: 2 } },
  );
});

test('OAS 3.0 nullable and exclusive bounds preserve their standard meanings', async () => {
  const definition = {
    type: 'object',
    properties: {
      quantity: {
        type: 'number',
        nullable: true,
        minimum: 1,
        exclusiveMinimum: true,
        maximum: 4,
        exclusiveMaximum: true,
      },
      mode: { type: 'string', nullable: true, enum: ['safe'] },
      file: { type: 'string', format: 'binary' },
    },
  };
  const operation = await requestOperation(definition, [], '3.0.3');
  const before = globalThis.structuredClone(operation);
  const input = {
    operation,
    bindings: [],
    requestMediaType: 'application/json',
  };
  const contract = createApiArgumentGenerationContract(input);
  const validate = createValidator(toJsonSchema(contract.schema));
  for (const body of [
    { quantity: 2, mode: 'safe', file: 'bytes' },
    { quantity: null },
  ]) {
    assert.equal(contract.schema.safeParse({ values: { body } }).success, true);
    assert.equal(validate({ values: { body } }).valid, true);
    assert.equal(
      validateApiArguments({ ...input, values: { body } }).valid,
      true,
    );
  }
  for (const body of [
    { quantity: 1 },
    { quantity: 4 },
    { mode: null },
    { file: 42 },
  ]) {
    assert.equal(
      contract.schema.safeParse({ values: { body } }).success,
      false,
    );
    assert.equal(validate({ values: { body } }).valid, false);
    assert.throws(
      () => validateApiArguments({ ...input, values: { body } }),
      /does not match the OAS schema/,
    );
  }
  assert.deepEqual(operation, before);
});

test('local fragment references remain scoped to each embedded schema resource', () => {
  const first = {
    $defs: { Value: { type: 'number' } },
    $ref: '#/$defs/Value',
    maximum: 3,
  };
  const second = {
    $defs: { Value: { type: 'string' } },
    $ref: '#/$defs/Value',
    minLength: 2,
  };
  const schema = z
    .object({
      first: createOasValueSchema(first, 'draft-2020-12', '/first'),
      second: createOasValueSchema(second, 'draft-2020-12', '/second'),
    })
    .strict();
  const wire = toJsonSchema(schema);
  const validate = createValidator(wire);
  assert.notEqual(wire.properties.first.$id, wire.properties.second.$id);
  assert.equal(validate({ first: 2, second: 'ok' }).valid, true);
  assert.deepEqual(schema.parse({ first: 2, second: 'ok' }), {
    first: 2,
    second: 'ok',
  });
  assert.equal(validate({ first: 4, second: 'x' }).valid, false);
  assert.equal(schema.safeParse({ first: 4, second: 'x' }).success, false);
});

test('OAS 3.0 normalization does not rewrite enum or example data', () => {
  const data = {
    type: 'number',
    nullable: true,
    minimum: 1,
    exclusiveMinimum: true,
  };
  const definition = {
    type: 'object',
    enum: [data],
    example: data,
    properties: { nullable: { type: 'boolean' } },
  };
  const before = globalThis.structuredClone(definition);
  const schema = createOasValueSchema(definition, 'openapi-3.0', '/data');
  const wire = z.toJSONSchema(schema);
  assert.deepEqual(wire.enum, [data]);
  assert.deepEqual(wire.example, data);
  assert.deepEqual(schema.parse(data), data);
  assert.deepEqual(definition, before);
});

test('boolean schemas, literal strings and non-JSON values are not coerced', () => {
  assert.equal(
    createOasValueSchema(true, 'draft-2020-12', '/any').safeParse(2).success,
    true,
  );
  assert.equal(
    createOasValueSchema(false, 'draft-2020-12', '/never').safeParse(2).success,
    false,
  );
  const schema = createOasValueSchema(
    { enum: ['null', '42', 'true'] },
    'draft-2020-12',
    '/string',
  );
  for (const value of ['null', '42', 'true'])
    assert.equal(schema.parse(value), value);
  for (const value of [null, 42, true])
    assert.equal(schema.safeParse(value).success, false);
  const any = createOasValueSchema(true, 'draft-2020-12', '/json');
  for (const value of [undefined, Infinity, NaN, () => 1, new Date()])
    assert.equal(any.safeParse(value).success, false);
});

test('an uncompileable value schema fails before model invocation with its source', () => {
  assert.throws(
    () =>
      createOasValueSchema(
        { type: 'string', pattern: '[' },
        'draft-2020-12',
        'items.query.code',
      ),
    /items.query.code cannot compile its OAS value schema/,
  );
  assert.throws(
    () =>
      createOasValueSchema(
        { $ref: '#/$defs/Missing' },
        'draft-2020-12',
        'items.body',
      ),
    /items.body cannot compile its OAS value schema/,
  );
  assert.throws(
    () => createOasValueSchema(null, 'draft-2020-12', 'items.body'),
    /items.body must be an OAS schema/,
  );
  assert.throws(
    () => createOasValueSchema({}, 'unsupported', 'items.body'),
    /items.body has an unsupported OAS schema dialect/,
  );
});
