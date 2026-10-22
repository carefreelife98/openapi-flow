import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { createOasValueValidator } from '../packages/core/dist/openapi/common/create-oas-value-validator.js';
import { createOasValueValidationCache } from '../packages/core/dist/openapi/common/create-oas-value-validation-cache.js';

test('equivalent OAS contracts reuse compilation but expose independent schema copies', () => {
  const schema = { type: 'string', pattern: '^0[0-9]+$' };
  const first = createOasValueValidator(
    schema,
    'draft-2020-12',
    'reuse/string',
  );
  const second = createOasValueValidator(
    globalThis.structuredClone(schema),
    'draft-2020-12',
    'reuse/string',
  );
  assert.equal(first.validate, second.validate);
  assert.notEqual(first.schema, second.schema);
  first.schema.pattern = '^wrong$';
  schema.pattern = '^changed$';
  assert.equal(second.schema.pattern, '^0[0-9]+$');
  assert.equal(second.validate('0007').valid, true);
  assert.equal(second.validate(7).valid, false);
  assert.equal(second.validate('wrong').valid, false);
  const third = createOasValueValidator(
    { type: 'string', pattern: '^0[0-9]+$' },
    'draft-2020-12',
    'reuse/string',
  );
  assert.equal(third.validate, second.validate);
  assert.equal(third.schema.pattern, '^0[0-9]+$');
});

test('schema edits, source identities and dialect semantics do not reuse the wrong validator', () => {
  const schema = { type: 'string', nullable: true };
  const nullable = createOasValueValidator(
    schema,
    'openapi-3.0',
    'reuse/dialect',
  );
  const modern = createOasValueValidator(
    schema,
    'draft-2020-12',
    'reuse/dialect',
  );
  assert.notEqual(nullable.validate, modern.validate);
  assert.equal(nullable.validate(null).valid, true);
  assert.deepEqual(nullable.schema.type, ['string', 'null']);
  assert.equal(modern.schema.type, 'string');
  // Ajv accepts its nullable keyword in both dialects; preserve that existing behavior.
  assert.equal(modern.validate(null).valid, true);
  const differentSource = createOasValueValidator(
    schema,
    'openapi-3.0',
    'reuse/other-source',
  );
  assert.notEqual(differentSource.validate, nullable.validate);
  schema.type = 'number';
  const changed = createOasValueValidator(
    schema,
    'openapi-3.0',
    'reuse/dialect',
  );
  assert.notEqual(changed.validate, nullable.validate);
  assert.equal(changed.validate('0007').valid, false);
  assert.equal(nullable.validate('0007').valid, true);
});

test('reused validators check every value and preserve prior errors and input types', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: { id: { type: 'string', pattern: '^0' } },
  };
  const first = createOasValueValidator(
    schema,
    'draft-2020-12',
    'reuse/object',
  );
  const invalid = first.validate({ id: 7 });
  const errors = globalThis.structuredClone(invalid.errors);
  const value = { id: '0007' };
  const before = globalThis.structuredClone(value);
  const second = createOasValueValidator(
    schema,
    'draft-2020-12',
    'reuse/object',
  );
  assert.equal(first.validate, second.validate);
  first.schema.properties.id.type = 'number';
  assert.equal(second.schema.properties.id.type, 'string');
  assert.equal(second.validate(value).valid, true);
  assert.deepEqual(value, before);
  assert.deepEqual(invalid.errors, errors);
  assert.equal(second.validate({ id: 'wrong' }).valid, false);
  assert.equal(second.validate({ id: '0007', extra: true }).valid, false);
  assert.equal(second.validate({}).valid, false);
});

test('cache evicts the least recently used entry without changing compilation or validation', () => {
  const cache = createOasValueValidationCache({
    maximumEntries: 2,
    maximumRetainedSchemaBytes: 4096,
  });
  let compilations = 0;
  const compile = (schema) => {
    compilations++;
    return (value) => ({ valid: value === schema.const, errors: [] });
  };
  const get = (value) =>
    cache.getOrCreate({ const: value }, 'draft-2020-12', compile);
  const a = get('a');
  get('b');
  assert.equal(get('a'), a);
  get('c');
  assert.equal(get('a'), a);
  assert.equal(compilations, 3);
  assert.equal(get('b')('b').valid, true);
  assert.equal(compilations, 4);
});

test('serialized schema retention has a byte budget and oversized contracts still compile', () => {
  const small = { const: 'a' };
  const budget = Buffer.byteLength(JSON.stringify(['draft-2020-12', small]));
  const cache = createOasValueValidationCache({
    maximumEntries: 64,
    maximumRetainedSchemaBytes: budget,
  });
  let compilations = 0;
  const compile = () => {
    compilations++;
    return () => ({ valid: true, errors: [] });
  };
  const get = (schema) => cache.getOrCreate(schema, 'draft-2020-12', compile);
  const original = get(small);
  get({ const: 'longer than the budget' });
  get({ const: 'longer than the budget' });
  assert.equal(get(small), original);
  assert.equal(compilations, 3);
  get({ const: 'b' });
  assert.notEqual(get(small), original);
  assert.equal(compilations, 5);
});

test('failed compilation is not retained or converted to an empty validation success', () => {
  const cache = createOasValueValidationCache({
    maximumEntries: 2,
    maximumRetainedSchemaBytes: 4096,
  });
  const failure = new Error('original compiler failure');
  let attempts = 0;
  const compile = () => {
    attempts++;
    throw failure;
  };
  for (let attempt = 0; attempt < 2; attempt++)
    assert.throws(
      () => cache.getOrCreate({ type: 'string' }, 'draft-2020-12', compile),
      (error) => error === failure,
    );
  assert.equal(attempts, 2);
  for (const source of ['reuse/invalid-first', 'reuse/invalid-second'])
    assert.throws(
      () =>
        createOasValueValidator(
          { type: 'string', pattern: '[' },
          'draft-2020-12',
          source,
        ),
      (error) => error.message.includes(source) && error.cause instanceof Error,
    );
});

test('serialization collisions, identical modern schemas in different dialects and caller mutation stay isolated', () => {
  const cache = createOasValueValidationCache({
    maximumEntries: 4,
    maximumRetainedSchemaBytes: 4096,
  });
  let compilations = 0;
  const compile = (snapshot) => {
    compilations++;
    return (value) => ({ valid: value === snapshot.const, errors: [] });
  };
  const input = { const: 'original' };
  const first = cache.getOrCreate(input, 'draft-2020-12', compile);
  input.const = 'changed';
  assert.equal(first('original').valid, true);
  const collision = { const: 'original', annotation: undefined };
  assert.equal(
    JSON.stringify(collision),
    JSON.stringify({ const: 'original' }),
  );
  assert.notEqual(
    cache.getOrCreate(collision, 'draft-2020-12', compile),
    first,
  );
  assert.notEqual(cache.getOrCreate(collision, 'openapi-3.0', compile), first);
  assert.equal(compilations, 3);
  const old = createOasValueValidator(
    { type: 'string' },
    'openapi-3.0',
    'same',
  );
  const modern = createOasValueValidator(
    { type: 'string' },
    'draft-2020-12',
    'same',
  );
  assert.deepEqual(old.schema, modern.schema);
  assert.notEqual(old.validate, modern.validate);
});

test('invalid cache budgets fail at construction', () => {
  for (const invalid of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () =>
        createOasValueValidationCache({
          maximumEntries: invalid,
          maximumRetainedSchemaBytes: 4096,
        }),
      /maximumEntries/,
    );
    assert.throws(
      () =>
        createOasValueValidationCache({
          maximumEntries: 2,
          maximumRetainedSchemaBytes: invalid,
        }),
      /maximumRetainedSchemaBytes/,
    );
  }
});
