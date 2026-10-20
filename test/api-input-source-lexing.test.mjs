import assert from 'node:assert/strict';
import test from 'node:test';
import { locateCompleteApiInputSource } from '../packages/core/dist/arguments/sources/locate-complete-api-input-source.js';
import { readApiInputLiteralSource } from '../packages/core/dist/arguments/sources/read-api-input-literal-source.js';

for (const literal of [
  '0',
  '-0',
  '12',
  '-12',
  '3.25',
  '-3.25',
  '1e3',
  '1E+2',
  '1e-3',
])
  test(`embedded complete number before a prose full stop is not truncated or repaired: ${literal}`, () => {
    const text = `값🙂 ${literal}. 다음 문장.`;
    const expected = { offset: text.indexOf(literal), length: literal.length };
    assert.deepEqual(locateCompleteApiInputSource(text, literal), [expected]);
    const result = readApiInputLiteralSource({
      text,
      sourceText: literal,
      sourceFormat: 'json',
      label: 'test literal',
    });
    assert.equal(result.value, JSON.parse(literal));
    assert.deepEqual(result.occurrences, [expected]);
  });

test('number-like spans reject partial digits, signs, fractional and exponent parts while preserving complete verbatim text', () => {
  for (const [whole, part] of [
    ['012', '0'],
    ['.25', '25'],
    ['-.25', '25'],
    ['+12', '12'],
    ['-12', '12'],
    ['3.25', '3'],
    ['1e+2', '2'],
    ['1e+', '1'],
  ]) {
    const text = `Use ${whole}.`;
    assert.deepEqual(locateCompleteApiInputSource(text, part), []);
    assert.equal(
      readApiInputLiteralSource({
        text,
        sourceText: whole,
        sourceFormat: 'text',
        label: 'verbatim string',
      }).value,
      whole,
    );
  }
  const text = 'Use 12, not its digit 1.';
  assert.deepEqual(locateCompleteApiInputSource(text, '1'), [
    { offset: text.lastIndexOf('1.'), length: 1 },
  ]);
});

test('malformed selected JSON is still rejected instead of being trimmed into a valid number', () => {
  for (const sourceText of ['1.', '012', '.25', '+12', '1e+'])
    assert.throws(
      () =>
        readApiInputLiteralSource({
          text: `Exact source ${sourceText}`,
          sourceText,
          sourceFormat: 'json',
          label: 'invalid JSON',
        }),
      /complete JSON literal/,
    );
});
