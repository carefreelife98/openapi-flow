import assert from 'node:assert/strict';
import test from 'node:test';
import { isSchemaProvablyEmpty } from '@openapi-flow/core';

test('declared type intersections prove impossible domains without rejecting integer/number overlap', () => {
  for (const type of [
    'null',
    'boolean',
    'object',
    'array',
    'number',
    'integer',
  ])
    assert.equal(
      isSchemaProvablyEmpty({ allOf: [{ type }, { type: 'string' }] }),
      true,
    );
  for (const schema of [
    { allOf: [{ type: 'number' }, { type: 'integer' }] },
    { allOf: [{ type: ['string', 'null'] }, { type: 'string' }] },
    {
      allOf: [
        { anyOf: [{ type: 'array' }, { type: 'string' }] },
        { type: 'array' },
      ],
    },
    { allOf: [true, { $ref: '#/external' }, { type: 'string' }] },
  ])
    assert.equal(isSchemaProvablyEmpty(schema), false);
  assert.equal(
    isSchemaProvablyEmpty({
      allOf: [
        { anyOf: [{ type: 'number' }, { type: 'null' }] },
        { type: 'array' },
      ],
    }),
    true,
  );
});

test('type analysis does not claim satisfiability or discard non-type source assertions', () => {
  const source = {
    allOf: [
      { type: 'string', minLength: 5, maxLength: 2 },
      { $ref: '#/uninspected' },
    ],
  };
  const before = globalThis.structuredClone(source);
  assert.equal(isSchemaProvablyEmpty(source), false);
  assert.deepEqual(source, before);
});
