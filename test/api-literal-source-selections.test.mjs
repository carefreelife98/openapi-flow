import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiLiteralJsonSources,
  resolveApiLiteralSourceSelections,
} from '@openapi-flow/core';
import { literalJsonCandidateId } from './fixtures/api-literal-json-source-choice.mjs';

test('an unquoted proposed string is its exact source token; the model does not repeat a quotation', () => {
  const input = {
    callId: 'literal-source',
    values: { query: { mode: 'ORIGINAL' } },
    messages: [{ id: 'answer', text: '모드는 ORIGINAL로 지정해줘.' }],
    selections: [
      {
        targetPointer: '/query/mode',
        messageId: 'answer',
        sourceFormat: 'text',
      },
    ],
  };
  const before = globalThis.structuredClone(input);
  const [source] = resolveApiLiteralSourceSelections(input);
  assert.equal(source.sourceText, 'ORIGINAL');
  assert.equal(source.messageId, 'answer');
  assert.deepEqual(source.occurrences, [{ offset: 4, length: 8 }]);
  assert.deepEqual(input, before);
});

test('selected original JSON tokens preserve empty values, types, escapes and whole composite inputs', () => {
  for (const value of [
    0,
    false,
    null,
    '',
    {},
    [],
    '0',
    'a"b',
    { 'a/b': [null, '00', 2] },
  ]) {
    const token = JSON.stringify(value);
    const messages = [{ id: 'answer', text: `Use ${token} exactly.` }];
    const before = globalThis.structuredClone(messages);
    const [source] = resolveApiLiteralSourceSelections({
      callId: 'json-source',
      values: { body: value },
      messages,
      selections: [
        {
          targetPointer: '/body',
          messageId: 'answer',
          sourceFormat: 'json',
          candidateId: literalJsonCandidateId(token),
        },
      ],
    });
    assert.equal(source.sourceText, token);
    assert.equal(source.sourceFormat, 'json');
    assert.deepEqual(messages, before);
  }
});

test('JSON catalogs are message-scoped and do not expose character tokens or unwrap encoded user text', () => {
  const catalog = describeApiLiteralJsonSources([
    { id: 'first', text: 'Use "0007", then "0007".' },
    { id: 'second', text: JSON.stringify('Use "inside".') },
  ]);
  assert.deepEqual(catalog[0].json, [
    { id: literalJsonCandidateId('"0007"'), text: '"0007"' },
  ]);
  assert.equal(catalog[1].json.length, 1);
  assert.equal(
    catalog[1].json.some((candidate) => candidate.text === '"inside"'),
    false,
  );
  assert.equal(Object.hasOwn(catalog[0], 'text'), false);
  assert.equal(Object.hasOwn(catalog[0], 'tokens'), false);
});

test('missing, mismatched, cross-message or rewritten sources fail without inventing or coercing values', () => {
  const base = {
    callId: 'source-guards',
    messages: [
      { id: 'one', text: 'Use 0 and "0".' },
      { id: 'two', text: 'Use 2.' },
    ],
    values: { body: 0 },
    selections: [
      {
        targetPointer: '/body',
        messageId: 'one',
        sourceFormat: 'json',
        candidateId: literalJsonCandidateId('0'),
      },
    ],
  };
  for (const changes of [
    { selections: [] },
    { values: { body: false } },
    { values: { body: '0' } },
    { selections: [{ ...base.selections[0], messageId: 'missing' }] },
    { selections: [{ ...base.selections[0], messageId: 'two' }] },
    {
      selections: [
        { ...base.selections[0], candidateId: literalJsonCandidateId('99') },
      ],
    },
    { selections: [{ ...base.selections[0], sourceText: '0' }] },
    {
      selections: [
        { targetPointer: '/body', messageId: 'one', sourceFormat: 'text' },
      ],
    },
    {
      values: { body: '' },
      selections: [
        { targetPointer: '/body', messageId: 'one', sourceFormat: 'text' },
      ],
    },
    { messages: [] },
  ])
    assert.throws(() =>
      resolveApiLiteralSourceSelections({ ...base, ...changes }),
    );
  for (const text of [
    '"prefix-0007-suffix"',
    JSON.stringify({ request: 'Use "0007"' }),
    'Use +42, 0007 and 1e.',
  ])
    assert.throws(() =>
      resolveApiLiteralSourceSelections({
        callId: 'whole-token',
        values: { body: '0007' },
        messages: [{ id: 'one', text }],
        selections: [
          {
            targetPointer: '/body',
            messageId: 'one',
            sourceFormat: 'json',
            candidateId: literalJsonCandidateId('"0007"'),
          },
        ],
      }),
    );
});

test('coverage and overlapping targets remain checked after source materialization', () => {
  const base = {
    callId: 'coverage',
    messages: [{ id: 'answer', text: 'Use {"a":1,"b":2}.' }],
    values: { body: { a: 1, b: 2 } },
  };
  const whole = {
    targetPointer: '/body',
    messageId: 'answer',
    sourceFormat: 'json',
    candidateId: literalJsonCandidateId('{"a":1,"b":2}'),
  };
  const a = {
    targetPointer: '/body/a',
    messageId: 'answer',
    sourceFormat: 'json',
    candidateId: literalJsonCandidateId('1'),
  };
  assert.equal(
    resolveApiLiteralSourceSelections({ ...base, selections: [whole] }).length,
    1,
  );
  assert.throws(
    () => resolveApiLiteralSourceSelections({ ...base, selections: [a] }),
    /requires an exact user source/,
  );
  assert.throws(
    () =>
      resolveApiLiteralSourceSelections({ ...base, selections: [whole, a] }),
    /overlapping/,
  );
});
