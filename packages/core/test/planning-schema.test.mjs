import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentParser } from '@langchain/core/language_models/structured_output';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { createOperationPlanSchema } from '../dist/schemas/operation-plan-schema.js';
import { createOperationSelectionSchema } from '../dist/schemas/operation-selection-schema.js';

test('Zod selection schema describes and validates an OAS operation reference', async () => {
  const refs = ['#/paths/~1items/get', '#/paths/~1items/post'];
  const schema = createOperationSelectionSchema(refs);
  const wireSchema = toJsonSchema(schema);

  assert.equal(wireSchema.type, 'object');
  assert.ok(wireSchema.description);
  assert.ok(wireSchema.properties.operationRef.description);
  assert.deepEqual(wireSchema.properties.operationRef.enum, refs);
  assert.deepEqual(wireSchema.required, ['operationRef']);
  assert.equal(wireSchema.additionalProperties, false);
  assert.deepEqual(schema.parse({ operationRef: refs[1] }), {
    operationRef: refs[1],
  });
  assert.equal(schema.safeParse({ operationRef: 'not-in-oas' }).success, false);
  assert.equal(
    schema.safeParse({ operationRef: refs[0], extra: true }).success,
    false,
  );
  await assert.rejects(
    createContentParser(schema).invoke('{"operationRef":"not-in-oas"}'),
    /Failed to parse/,
  );
  assert.throws(() => createOperationSelectionSchema([]), /no operations/);
});

test('Zod plan schema uses OAS value types and nested request inputs', async () => {
  const schema = createOperationPlanSchema(
    {
      operationRef: '#/paths/~1items~1{id}/post',
      parameters: [
        { name: 'id', in: 'path', schema: { type: 'string', minLength: 2 } },
      ],
      body: {
        mediaTypes: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'quantity'],
              properties: {
                name: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
    '3.0.4',
  );
  const wireSchema = toJsonSchema(schema);

  assert.equal(wireSchema.type, 'object');
  assert.ok(wireSchema.description);
  assert.deepEqual(wireSchema.required, ['inputs']);
  assert.equal(wireSchema.additionalProperties, false);
  assert.equal(
    wireSchema.properties.inputs.properties.path.properties.id.type,
    'string',
  );
  assert.equal(
    wireSchema.properties.inputs.properties.body.properties.quantity.type,
    'integer',
  );
  assert.equal(
    wireSchema.properties.inputs.properties.body.properties.quantity.minimum,
    1,
  );
  assert.equal(wireSchema.properties.expectedBody, undefined);
  const valid = {
    inputs: { path: { id: 'item-42' }, body: { name: 'pencil', quantity: 3 } },
  };
  assert.deepEqual(schema.parse(valid), valid);
  assert.deepEqual(schema.parse({ inputs: { body: { name: 'pencil' } } }), {
    inputs: { body: { name: 'pencil' } },
  });
  assert.equal(
    schema.safeParse({ inputs: { path: { other: 'x' } } }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ inputs: { body: { quantity: '3' } } }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ inputs: { body: { quantity: 0 } } }).success,
    false,
  );
  assert.equal(schema.safeParse({ ...valid, extra: true }).success, false);
  await assert.rejects(
    createContentParser(schema).invoke(
      '{"inputs":{"body":{"quantity":"not a number"}}}',
    ),
    /Failed to parse/,
  );
});

test('Zod plan schema permits no values when the scenario supplies none', () => {
  const schema = createOperationPlanSchema({ parameters: [] }, '3.1.1');
  const wireSchema = toJsonSchema(schema);

  assert.deepEqual(wireSchema.properties.inputs.properties, {});
  assert.deepEqual(schema.parse({ inputs: {} }), { inputs: {} });
  assert.equal(
    schema.safeParse({ inputs: { path: { id: 'invented' } } }).success,
    false,
  );
});

test('planning preserves OAS nullable, enum, and nested types while allowing omitted scenario values', () => {
  const schema = createOperationPlanSchema(
    {
      operationRef: '#/paths/~1items/post',
      parameters: [
        {
          in: 'query',
          name: 'mode',
          schema: { type: 'string', enum: ['fast', 'safe'] },
        },
      ],
      body: {
        mediaTypes: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['details'],
              properties: {
                details: {
                  type: 'object',
                  required: ['label', 'count'],
                  properties: {
                    label: { type: 'string', nullable: true },
                    count: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '3.0.4',
  );
  const expected = {
    inputs: { query: { mode: 'fast' }, body: { details: { label: null } } },
  };
  assert.deepEqual(schema.parse(expected), expected);
  assert.deepEqual(schema.parse({ inputs: {} }), { inputs: {} });
  assert.equal(
    schema.safeParse({ inputs: { query: { mode: 'other' } } }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ inputs: { body: { details: { count: '2' } } } }).success,
    false,
  );
});
