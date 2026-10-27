import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import {
  createApiInputSourceSelectionSchema,
  describeApiInputSources,
  inspectApiArgumentRequirements,
  resolveApiInputSourceSelections,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';

test('source wire schema stays constant as original text and JSON candidates grow', () => {
  const short = describeApiInputSources('앞 "0007" 뒤');
  const long = describeApiInputSources(
    '가🙂'.repeat(6000) + ' "0007" ' + 'false '.repeat(1200),
  );
  assert.ok(long.text.flatMap((segment) => segment.tokens).length > 1000);
  assert.ok(long.json.length > 1000);
  assert.deepEqual(
    z.toJSONSchema(createApiInputSourceSelectionSchema(short)),
    z.toJSONSchema(createApiInputSourceSelectionSchema(long)),
  );
});

test('compact wire grammar does not weaken original-catalog validation', () => {
  const catalog = describeApiInputSources('앞 "0007" 🙂 뒤');
  const schema = createApiInputSourceSelectionSchema(catalog);
  const token = catalog.text.at(-1).tokens.at(-1);
  assert.equal(
    schema.safeParse({ kind: 'json', candidateId: catalog.json[0].id }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      kind: 'text',
      startTokenId: token.id,
      endTokenId: token.id,
    }).success,
    true,
  );
  for (const value of [
    { kind: 'json', candidateId: 'json:999999:4' },
    { kind: 'json', candidateId: 'invented' },
    {
      kind: 'text',
      startTokenId: 'text:999999:1',
      endTokenId: token.id,
    },
  ])
    assert.equal(schema.safeParse(value).success, false);
});

test('large source inventory reaches extraction with a bounded wire schema and preserves the exact value', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  const reply = '사용자 설명 '.repeat(1000) + ' 회원번호는 "0007"입니다.';
  const catalog = describeApiInputSources(reply);
  const candidate = catalog.json.find((item) => item.text === '"0007"');
  let calls = 0;
  const result = await analyzeApiInputAnswers({
    reply,
    requirements,
    model: {
      withStructuredOutput(schema) {
        assert.ok(Buffer.byteLength(JSON.stringify(schema)) < 4000);
        assert.equal(JSON.stringify(schema).includes('text:0:'), false);
        return {
          async invoke() {
            calls += 1;
            return {
              answers: [
                {
                  requirementId: requirements[0].id,
                  source: { kind: 'json', candidateId: candidate.id },
                },
              ],
            };
          },
        };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.answers[0].value, '0007');
});

test('the authoritative resolver still rejects forged, reversed and cross-segment boundaries', async () => {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  const reply = '앞쪽 "보호 문자열" 뒤쪽';
  const catalog = describeApiInputSources(reply);
  const first = catalog.text[0].tokens[0];
  const last = catalog.text.at(-1).tokens.at(-1);
  for (const source of [
    { kind: 'json', candidateId: 'json:999999:4' },
    { kind: 'text', startTokenId: first.id, endTokenId: last.id },
    {
      kind: 'text',
      startTokenId: catalog.text[0].tokens.at(-1).id,
      endTokenId: first.id,
    },
  ])
    assert.throws(() =>
      resolveApiInputSourceSelections({
        reply,
        requirements,
        selections: [{ requirementId: requirements[0].id, source }],
      }),
    );
});
