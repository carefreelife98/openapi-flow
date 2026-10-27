import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  describeApiInputSources,
  createApiInputSourceSelectionSchema,
  resolveApiInputSourceSelections,
  resolveApiInputAnswerSources,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { z } from 'zod';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';
import {
  jsonInputSource,
  textInputSource,
} from './fixtures/api-input-source-selection-fixture.mjs';

async function context(reply, schema = true) {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  return { reply, requirements: [{ ...requirements[0], schema }] };
}

function resolve(input, source) {
  const selections = resolveApiInputSourceSelections({
    ...input,
    selections: [{ requirementId: input.requirements[0].id, source }],
  });
  return resolveApiInputAnswerSources({ ...input, selections });
}

test('quoted JSON values have complete code-owned IDs and no inner text boundaries, including escapes and Unicode', async () => {
  for (const value of [
    'fixture-member-01',
    '2',
    '',
    ' ',
    'a"b\\c',
    '🙂가𠮷',
    '={{ $json.value }}',
  ]) {
    const raw = JSON.stringify(value);
    const input = await context(`회원번호는 문자열 ${raw}이야.`, {
      type: 'string',
    });
    const sources = describeApiInputSources(input.reply);
    const source = jsonInputSource({ sources }, raw);
    const candidate = sources.json.find(
      (item) => item.id === source.candidateId,
    );
    assert.equal(candidate.text, raw);
    assert.ok(
      sources.text.every((segment) =>
        segment.tokens.every(
          (token) =>
            token.offset < candidate.offset ||
            token.offset >= candidate.offset + candidate.length,
        ),
      ),
    );
    assert.equal(resolve(input, source).answers[0].value, value);
    assert.throws(
      () =>
        resolve(input, {
          kind: 'text',
          startTokenId: `text:${candidate.offset + 1}:1`,
          endTokenId: `text:${candidate.offset + candidate.length - 2}:1`,
        }),
      /ordered text boundaries/,
    );
  }
});

test('complete JSON candidates preserve scalar, nested container and prototype-looking data without repair', async () => {
  for (const raw of [
    '0',
    '-0',
    '1E+2',
    'false',
    'null',
    '[]',
    '{}',
    '[0,false,"",{"n":2}]',
    '{"__proto__":{"x":1},"constructor":2}',
  ]) {
    const input = await context(`정확한 값: ${raw}. 다음 문장.`);
    const sources = describeApiInputSources(input.reply);
    const result = resolve(input, jsonInputSource({ sources }, raw));
    assert.deepEqual(result.answers[0].value, JSON.parse(raw));
    assert.equal(Object.hasOwn(Object.prototype, 'x'), false);
  }
  for (const raw of [
    '012',
    '+12',
    '.25',
    '1e+',
    '1e400',
    '[2,]',
    '{"x":1,}',
    '"unterminated',
  ]) {
    const sources = describeApiInputSources(raw);
    assert.ok(!sources.json.some((candidate) => candidate.text === raw), raw);
  }
  for (const raw of ['012', '+12', '.25', '1e+', '1e400']) {
    const sources = describeApiInputSources(raw);
    assert.equal(sources.json.length, 0, raw);
    assert.equal(
      sources.text.flatMap((segment) => segment.tokens).length,
      1,
      raw,
    );
  }
});

test('unquoted arbitrary substrings, Unicode codepoints, whitespace and numeric strings remain exact text', async () => {
  for (const text of [
    'member-01',
    '홍 길동',
    '🙂𠮷',
    'a\tb',
    ' ',
    '012',
    '+12',
    'false',
  ]) {
    const input = await context(`원문: ${text} 끝`, { type: 'string' });
    const sources = describeApiInputSources(input.reply);
    const selected = textInputSource({ sources }, text);
    assert.equal(resolve(input, selected).answers[0].value, text);
  }
  const input = await context('앞 "중간" 뒤');
  const sources = describeApiInputSources(input.reply);
  const first = sources.text[0].tokens[0];
  const last = sources.text.at(-1).tokens.at(-1);
  assert.throws(
    () =>
      resolve(input, {
        kind: 'text',
        startTokenId: first.id,
        endTokenId: last.id,
      }),
    /one original unquoted segment/,
  );
  assert.throws(
    () =>
      resolve(input, {
        kind: 'text',
        startTokenId: sources.text[0].tokens.at(-1).id,
        endTokenId: first.id,
      }),
    /ordered text boundaries/,
  );
  assert.throws(
    () => resolve(input, { kind: 'json', candidateId: 'invented' }),
    /unknown JSON source candidate/,
  );
});

test('the original source, not the required OAS type, determines literal representation', async () => {
  const numeric = await context('값은 "2"입니다.', { type: 'number' });
  const sources = describeApiInputSources(numeric.reply);
  assert.throws(
    () => resolve(numeric, jsonInputSource({ sources }, '"2"')),
    /OAS schema/,
  );
  const string = await context('값은 2입니다.', { type: 'string' });
  const stringSources = describeApiInputSources(string.reply);
  assert.throws(
    () => resolve(string, jsonInputSource({ sources: stringSources }, '2')),
    /OAS schema/,
  );
  assert.equal(
    resolve(string, textInputSource({ sources: stringSources }, '2')).answers[0]
      .value,
    '2',
  );
});

test('wire grammar contains ID selections only and local source schemas retain exact catalog membership', async () => {
  const sources = describeApiInputSources(
    '회원번호는 "fixture-member-01"이야.',
  );
  const schema = createApiInputSourceSelectionSchema(sources);
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(z.toJSONSchema(schema));
  const valid = jsonInputSource({ sources }, '"fixture-member-01"');
  assert.equal(validate(valid), true);
  assert.equal(validate({ ...valid, candidateId: 'invented' }), false);
  const foreign = { ...valid, candidateId: 'json:999999:4' };
  assert.equal(validate(foreign), true);
  assert.equal(schema.safeParse(foreign).success, false);
  assert.equal(
    validate({ sourceText: 'fixture-member-01', sourceFormat: 'text' }),
    false,
  );
  assert.equal(validate({ ...valid, value: 'fixture-member-01' }), false);
});

test('an undecodable complete quoted reply has no source to invent and makes zero model calls', async () => {
  const input = await context('"unterminated');
  let calls = 0;
  const result = await analyzeApiInputAnswers({
    ...input,
    includeExplanations: true,
    model: {
      withStructuredOutput() {
        calls++;
        throw new Error('no source choices');
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'extracted');
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.unansweredRequirementIds, [input.requirements[0].id]);
  assert.equal(Object.hasOwn(result, 'extraction'), false);
});
