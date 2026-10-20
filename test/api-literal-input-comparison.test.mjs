import assert from 'node:assert/strict';
import test from 'node:test';
import { assertApiLiteralInputsMatch } from '../integration/utils/assert-api-literal-inputs-match.mjs';

test('evaluation treats empty named-parameter maps as no supplied fields without rewriting either original', () => {
  const actual = { path: {}, query: {}, header: {}, cookie: {} },
    expected = {};
  const before = globalThis.structuredClone(actual);
  assertApiLiteralInputsMatch(actual, expected);
  assertApiLiteralInputsMatch(expected, actual);
  assert.deepEqual(actual, before);
  assert.deepEqual(expected, {});
});

test('body presence and other roots are not empty named-parameter maps', () => {
  for (const actual of [
    { body: {} },
    { body: [] },
    { body: null },
    { querystring: {} },
    { unknown: {} },
    { query: [] },
    { query: null },
    { query: undefined },
  ])
    assert.throws(() => assertApiLiteralInputsMatch(actual, {}));
});

test('individual empty parameters and scalar distinctions remain exact', () => {
  for (const value of [{}, [], null, false, 0, '']) {
    assert.throws(() =>
      assertApiLiteralInputsMatch({ query: { filter: value } }, {}),
    );
    assertApiLiteralInputsMatch(
      { query: { filter: value } },
      { query: { filter: value } },
    );
  }
  assert.throws(() =>
    assertApiLiteralInputsMatch(
      { query: { page: 0 } },
      { query: { page: '0' } },
    ),
  );
  assert.throws(() =>
    assertApiLiteralInputsMatch(
      { header: { member: 'first' } },
      { header: { member: 'second' } },
    ),
  );
});
