import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationPlanSchema } from '../dist/schemas/operation-plan-schema.js';
import { createOperationSelectionSchema } from '../dist/schemas/operation-selection-schema.js';

test('operation selection schema describes the exact OAS reference to choose', () => {
  const refs = ['#/paths/~1items/get', '#/paths/~1items/post'];
  const schema = createOperationSelectionSchema(refs);

  assert.equal(schema.type, 'object');
  assert.ok(schema.description);
  assert.ok(schema.properties.operationRef.description);
  assert.deepEqual(schema.properties.operationRef.enum, refs);
  assert.deepEqual(schema.required, ['operationRef']);
  assert.equal(schema.additionalProperties, false);
});

test('operation plan schema describes each model-selected field and preserves OAS-derived keys', () => {
  const schema = createOperationPlanSchema(
    ['path.id', 'body.name'],
    ['id', 'ok'],
  );

  assert.equal(schema.type, 'object');
  assert.ok(schema.description);
  assert.deepEqual(schema.required, ['inputs', 'expectedBody']);
  assert.equal(schema.additionalProperties, false);

  for (const field of ['inputs', 'expectedBody']) {
    const arraySchema = schema.properties[field];
    assert.equal(arraySchema.type, 'array');
    assert.ok(arraySchema.description);
    assert.ok(arraySchema.items.description);
    assert.deepEqual(arraySchema.items.required, ['key', 'valueJson']);
    assert.equal(arraySchema.items.additionalProperties, false);
    assert.ok(arraySchema.items.properties.key.description);
    assert.ok(arraySchema.items.properties.valueJson.description);
    assert.match(arraySchema.items.properties.valueJson.description, /JSON/);
  }

  assert.deepEqual(schema.properties.inputs.items.properties.key.enum, [
    'path.id',
    'body.name',
  ]);
  assert.deepEqual(schema.properties.expectedBody.items.properties.key.enum, [
    'id',
    'ok',
  ]);
});

test('operation plan schema remains usable when no request or response keys are available', () => {
  const schema = createOperationPlanSchema([], []);

  assert.equal(schema.properties.inputs.items.properties.key.enum, undefined);
  assert.equal(
    schema.properties.expectedBody.items.properties.key.enum,
    undefined,
  );
  assert.ok(schema.properties.inputs.items.properties.key.description);
  assert.ok(schema.properties.expectedBody.items.properties.key.description);
});
