import assert from 'node:assert/strict';
import { mock } from 'node:test';
import test from 'node:test';
import { normalizeOasValueSchema } from '../packages/core/dist/openapi/common/normalize-oas-value-schema.js';

test('OAS 3.0 normalization converts schema assertions while preserving shared annotation values and caller ownership', () => {
  const shared = {
    type: 'number',
    nullable: true,
    minimum: 1,
    exclusiveMinimum: true,
  };
  const input = {
    type: 'object',
    properties: { amount: shared },
    default: shared,
    examples: [{ type: 'string', nullable: true }],
    additionalProperties: false,
  };
  const before = globalThis.structuredClone(input);
  const result = normalizeOasValueSchema(input, 'openapi-3.0');
  assert.deepEqual(result.properties.amount, {
    type: ['number', 'null'],
    exclusiveMinimum: 1,
  });
  assert.deepEqual(result.default, before.default);
  assert.deepEqual(result.examples, before.examples);
  assert.deepEqual(input, before);
  result.default.minimum = 9;
  assert.equal(input.default.minimum, 1);
});
test('normalization copies source nodes a bounded linear number of times rather than cloning every nested subtree', () => {
  let input = { type: 'string', nullable: true };
  for (let depth = 0; depth < 64; depth++)
    input = { type: 'object', properties: { child: input } };
  function size(value) {
    if (value === null || typeof value !== 'object') return 0;
    return (
      1 + Object.values(value).reduce((sum, child) => sum + size(child), 0)
    );
  }
  const sourceSize = size(input),
    original = globalThis.structuredClone;
  let copiedNodes = 0;
  const spy = mock.method(
    globalThis,
    'structuredClone',
    (value, ...options) => {
      copiedNodes += size(value);
      return original(value, ...options);
    },
  );
  try {
    normalizeOasValueSchema(input, 'openapi-3.0');
  } finally {
    spy.mock.restore();
  }
  assert.ok(
    copiedNodes <= sourceSize * 4,
    `Copied ${copiedNodes} nodes for a ${sourceSize}-node schema`,
  );
});
test('already-modern schemas preserve their assertion vocabulary and cyclic schema containers fail explicitly', () => {
  const input = {
    type: ['number', 'null'],
    exclusiveMinimum: 3,
    description: 'Untouched',
  };
  assert.deepEqual(normalizeOasValueSchema(input, 'draft-2020-12'), input);
  const cyclic = { type: 'object', properties: {} };
  cyclic.properties.self = cyclic;
  assert.throws(
    () => normalizeOasValueSchema(cyclic, 'openapi-3.0'),
    /cyclic in-memory schema/,
  );
});
