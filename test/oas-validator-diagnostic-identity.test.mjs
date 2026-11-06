import assert from 'node:assert/strict';
import test from 'node:test';
import { createValidator } from '@scalar/json-schema-validator';
import { createOasValueValidator } from '../packages/core/dist/openapi/common/create-oas-value-validator.js';

test('diagnostic labels do not create separate compilers for an identical anonymous OAS contract', () => {
  const schema = {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  };
  const a = createOasValueValidator(schema, 'draft-2020-12', 'call-a request');
  const b = createOasValueValidator(schema, 'draft-2020-12', 'call-b request');
  assert.equal(a.validate, b.validate);
  assert.notEqual(a.schema.$id, b.schema.$id);
  assert.equal(a.validate({ value: 'actual' }).valid, true);
  assert.equal(b.validate({ value: 42 }).valid, false);
  assert.equal(schema.$id, undefined);
  const parent = createValidator({
    type: 'object',
    properties: { first: a.schema, second: b.schema },
  });
  assert.equal(
    parent({ first: { value: 'one' }, second: { value: 'two' } }).valid,
    true,
  );
});
test('explicit OAS resource IDs and changed assertions retain independent identities', () => {
  const a = createOasValueValidator(
    { $id: 'urn:explicit:a', type: 'string' },
    'draft-2020-12',
    'a',
  );
  const b = createOasValueValidator(
    { $id: 'urn:explicit:b', type: 'string' },
    'draft-2020-12',
    'b',
  );
  assert.equal(a.schema.$id, 'urn:explicit:a');
  assert.equal(b.schema.$id, 'urn:explicit:b');
  assert.notEqual(a.validate, b.validate);
  const c = createOasValueValidator({ type: 'number' }, 'draft-2020-12', 'a');
  assert.notEqual(c.validate, a.validate);
});
