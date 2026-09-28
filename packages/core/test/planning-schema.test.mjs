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

test('Zod plan schema preserves OAS-derived keys and validates JSON literal strings', async () => {
  const schema = createOperationPlanSchema(
    ['path.id', 'body.name'],
    ['id', 'ok'],
  );
  const wireSchema = toJsonSchema(schema);

  assert.equal(wireSchema.type, 'object');
  assert.ok(wireSchema.description);
  assert.deepEqual(wireSchema.required, ['inputs', 'expectedBody']);
  assert.equal(wireSchema.additionalProperties, false);

  for (const field of ['inputs', 'expectedBody']) {
    const arraySchema = wireSchema.properties[field];
    assert.equal(arraySchema.type, 'array');
    assert.ok(arraySchema.description);
    assert.ok(arraySchema.items.description);
    assert.deepEqual(arraySchema.items.required, ['key', 'valueJson']);
    assert.equal(arraySchema.items.additionalProperties, false);
    assert.ok(arraySchema.items.properties.key.description);
    assert.ok(arraySchema.items.properties.valueJson.description);
    assert.match(arraySchema.items.properties.valueJson.description, /JSON/);
  }

  assert.deepEqual(wireSchema.properties.inputs.items.properties.key.enum, [
    'path.id',
    'body.name',
  ]);
  assert.deepEqual(
    wireSchema.properties.expectedBody.items.properties.key.enum,
    ['id', 'ok'],
  );
  const valid = {
    inputs: [{ key: 'path.id', valueJson: '"x"' }],
    expectedBody: [{ key: 'ok', valueJson: 'true' }],
  };
  assert.deepEqual(schema.parse(valid), valid);
  assert.equal(
    schema.safeParse({ ...valid, inputs: [{ key: 'other', valueJson: '1' }] })
      .success,
    false,
  );
  assert.equal(
    schema.safeParse({ ...valid, inputs: [{ key: 'path.id', valueJson: 'x' }] })
      .success,
    false,
  );
  assert.equal(
    schema.safeParse({
      ...valid,
      expectedBody: [{ key: 'other', valueJson: '1' }],
    }).success,
    false,
  );
  assert.equal(schema.safeParse({ ...valid, extra: true }).success, false);
  await assert.rejects(
    createContentParser(schema).invoke(
      '{"inputs":[{"key":"path.id","valueJson":"not JSON"}],"expectedBody":[]}',
    ),
    /Failed to parse/,
  );
});

test('Zod plan schema rejects bindings for operations with no available keys', () => {
  const schema = createOperationPlanSchema([], []);
  const wireSchema = toJsonSchema(schema);

  assert.equal(
    wireSchema.properties.inputs.items.properties.key.enum,
    undefined,
  );
  assert.equal(
    wireSchema.properties.expectedBody.items.properties.key.enum,
    undefined,
  );
  assert.ok(wireSchema.properties.inputs.items.properties.key.description);
  assert.ok(
    wireSchema.properties.expectedBody.items.properties.key.description,
  );
  assert.deepEqual(schema.parse({ inputs: [], expectedBody: [] }), {
    inputs: [],
    expectedBody: [],
  });
  assert.equal(
    schema.safeParse({
      inputs: [{ key: 'invented', valueJson: '1' }],
      expectedBody: [],
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      inputs: [],
      expectedBody: [{ key: 'invented', valueJson: '1' }],
    }).success,
    false,
  );
});
