import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureApiInputAnswerContext,
  inspectApiArgumentRequirements,
  resolveApiInputAnswerSources,
  validateApiInputAnswerExtractionRecord,
  describeApiInputSources,
} from '@openapi-flow/core';
import {
  analyzeApiInputAnswers,
  extractApiInputAnswers,
} from '@openapi-flow/langchain';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';
import {
  jsonInputSource,
  textInputSource,
} from './fixtures/api-input-source-selection-fixture.mjs';

async function context(schema = { type: 'string' }) {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  return {
    reply: '회원번호는 "member-01"입니다.',
    requirements: [{ ...requirements[0], schema }],
  };
}

function modelFor(answer, includeExplanations = false) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          const answers = answer(payload);
          return includeExplanations
            ? {
                reason: '이번 답변에 명시된 입력만 선택했습니다.',
                answers: answers.map((source) => ({
                  ...source,
                  reason: '원문에 해당 입력값이 명시되어 있습니다.',
                })),
              }
            : { answers };
        },
      };
    },
  };
}

const chooseMember = (payload) => [
  {
    requirementId: payload.questions[0].id,
    source: jsonInputSource(payload, '"member-01"'),
  },
];

test('model selects sources only; code owns values, unanswered IDs, locations and replayable optional evidence', async () => {
  for (const enabled of [false, true]) {
    const input = await context();
    input.requirements.push({
      ...input.requirements[0],
      id: 'tenant',
      targetPointer: '/header/tenant',
    });
    const model = modelFor(chooseMember, enabled);
    const result = await analyzeApiInputAnswers({
      ...input,
      model,
      includeExplanations: enabled,
    });
    assert.equal(result.status, 'extracted');
    assert.deepEqual(result.answers, [
      { requirementId: input.requirements[0].id, value: 'member-01' },
    ]);
    assert.deepEqual(result.unansweredRequirementIds, ['tenant']);
    assert.equal(Object.hasOwn(result, 'extraction'), enabled);
    assert.equal(model.calls.length, 1);
    const { schema, options, payload } = model.calls[0];
    assert.deepEqual(payload, {
      reply: input.reply,
      questions: input.requirements,
      sources: describeApiInputSources(input.reply),
    });
    assert.equal(options.strict, true);
    assert.equal(Object.hasOwn(schema.properties, 'reason'), enabled);
    const fields = schema.properties.answers.items.properties;
    assert.equal(Object.hasOwn(fields, 'reason'), enabled);
    for (const key of [
      'value',
      'evidence',
      'verification',
      'unansweredRequirementIds',
      'schema',
    ])
      assert.equal(Object.hasOwn(fields, key), false);
    if (enabled) {
      const record = JSON.parse(JSON.stringify(result.extraction));
      validateApiInputAnswerExtractionRecord({ ...input, record });
      assert.deepEqual(record.evidence, input);
      assert.equal(
        record.verification.sources[0].occurrences[0].offset,
        input.reply.indexOf('"member-01"'),
      );
      for (const mutate of [
        (r) => {
          r.evidence.reply = 'changed';
        },
        (r) => {
          r.evidence.requirements[0].operation.snapshotId = 'changed';
        },
        (r) => {
          r.verification.answers[0].value = 'invented';
        },
        (r) => {
          r.verification.sources[0].occurrences[0].offset++;
        },
        (r) => {
          r.verification.unansweredRequirementIds = [];
        },
      ]) {
        const changed = globalThis.structuredClone(record);
        mutate(changed);
        assert.throws(
          () =>
            validateApiInputAnswerExtractionRecord({
              ...input,
              record: changed,
            }),
          /differs/,
        );
      }
    }
  }
});

test('array convenience returns the same typed values without requesting discarded explanations', async () => {
  const input = await context();
  const model = modelFor(chooseMember);
  assert.deepEqual(await extractApiInputAnswers({ ...input, model }), [
    { requirementId: input.requirements[0].id, value: 'member-01' },
  ]);
  assert.equal(
    Object.hasOwn(model.calls[0].schema.properties, 'reason'),
    false,
  );
});

test('empty inventories and exactly empty replies require no model and invent no explanation', async () => {
  const input = await context();
  assert.deepEqual(
    await analyzeApiInputAnswers({ reply: input.reply, requirements: [] }),
    {
      status: 'no-pending-inputs',
      answers: [],
      sources: [],
      unansweredRequirementIds: [],
    },
  );
  assert.deepEqual(
    await analyzeApiInputAnswers({
      ...input,
      reply: '',
      includeExplanations: true,
    }),
    {
      status: 'empty-reply',
      answers: [],
      sources: [],
      unansweredRequirementIds: [input.requirements[0].id],
    },
  );
  await assert.rejects(analyzeApiInputAnswers(input), /model is required/);
  await assert.rejects(
    analyzeApiInputAnswers({ ...input, model: null }),
    /when supplied/,
  );
  await assert.rejects(
    analyzeApiInputAnswers({ ...input, includeExplanations: 'yes' }),
  );
  assert.throws(
    () =>
      captureApiInputAnswerContext({
        ...input,
        requirements: [input.requirements[0], input.requirements[0]],
      }),
    /Duplicate/,
  );
  assert.throws(() =>
    captureApiInputAnswerContext({ ...input, reply: undefined }),
  );
});

test('empty or partial model decisions retain unanswered questions without fabricated answers', async () => {
  const input = await context();
  input.reply = '住所の照会も追加してください。';
  const model = modelFor(() => [], true);
  const result = await analyzeApiInputAnswers({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.unansweredRequirementIds, [input.requirements[0].id]);
  validateApiInputAnswerExtractionRecord({
    ...input,
    record: result.extraction,
  });
});

test('numbers, strings, arrays, objects, booleans, null and whitespace remain their actual source types', async () => {
  const input = await context(true);
  for (const value of [
    2,
    '2',
    false,
    null,
    '',
    [1, 'two'],
    { name: '값', quantity: 2 },
    'a"b\\c',
    ' ',
  ]) {
    const sourceText = JSON.stringify(value);
    const result = resolveApiInputAnswerSources({
      ...input,
      reply: `값: ${sourceText}`,
      selections: [
        {
          requirementId: input.requirements[0].id,
          sourceFormat: 'json',
          sourceText,
        },
      ],
    });
    assert.deepEqual(result.answers[0].value, value);
  }
  const blank = await analyzeApiInputAnswers({
    ...input,
    reply: ' ',
    model: modelFor((payload) => [
      {
        requirementId: payload.questions[0].id,
        source: textInputSource(payload, ' '),
      },
    ]),
  });
  assert.equal(blank.answers[0].value, ' ');
});

test('lexical boundaries reject inner quoted values and scalar fragments, not exact repeated occurrences', async () => {
  const input = await context(true);
  const id = input.requirements[0].id;
  for (const [reply, sourceText] of [
    ['"2"', '2'],
    ['"false"', 'false'],
    ['123', '23'],
    ['-12', '12'],
    ['"member-01"', 'member-01'],
    ['"a\\"2"', '2'],
  ])
    assert.throws(
      () =>
        resolveApiInputAnswerSources({
          ...input,
          reply,
          selections: [{ requirementId: id, sourceFormat: 'json', sourceText }],
        }),
      /complete literal/,
    );
  const reply = '😀 앞의 문자열 "2"와 숫자 2, 다시 2';
  const result = resolveApiInputAnswerSources({
    ...input,
    reply,
    selections: [{ requirementId: id, sourceFormat: 'json', sourceText: '2' }],
  });
  const offsets = [...reply.matchAll(/2/gu)].map((m) => m.index).slice(1);
  assert.deepEqual(
    result.sources[0].occurrences,
    offsets.map((offset) => ({ offset, length: 1 })),
  );
  assert.equal(result.answers[0].value, 2);
});

test('unknown/duplicate IDs, invented sources, malformed JSON and OAS type mismatches fail without repair', async () => {
  const input = await context({ type: 'number', minimum: 1 });
  const id = input.requirements[0].id;
  for (const [reply, selections] of [
    [
      '2',
      [{ requirementId: 'unknown', sourceFormat: 'json', sourceText: '2' }],
    ],
    [
      '2',
      [0, 1].map(() => ({
        requirementId: id,
        sourceFormat: 'json',
        sourceText: '2',
      })),
    ],
    ['2', [{ requirementId: id, sourceFormat: 'json', sourceText: '3' }]],
    ['[2,]', [{ requirementId: id, sourceFormat: 'json', sourceText: '[2,]' }]],
    ['"2"', [{ requirementId: id, sourceFormat: 'json', sourceText: '"2"' }]],
    ['0', [{ requirementId: id, sourceFormat: 'json', sourceText: '0' }]],
    ['2', [{ requirementId: id, sourceFormat: 'text', sourceText: '2' }]],
    [
      '1e400',
      [{ requirementId: id, sourceFormat: 'json', sourceText: '1e400' }],
    ],
  ])
    assert.throws(() =>
      resolveApiInputAnswerSources({ ...input, reply, selections }),
    );
  await assert.rejects(
    analyzeApiInputAnswers({
      ...input,
      reply: '2',
      model: modelFor(({ questions }) => [
        {
          requirementId: questions[0].id,
          sourceFormat: 'json',
          sourceText: '2',
          value: 2,
        },
      ]),
    }),
    /Unrecognized key/,
  );
});

test('JSON source and schema metadata retain prototype-looking own properties without prototype mutation', async () => {
  const input = await context(true);
  const sourceText =
    '{"__proto__":{"marker":2},"constructor":{"name":"literal"}}';
  const result = resolveApiInputAnswerSources({
    ...input,
    reply: sourceText,
    selections: [
      {
        requirementId: input.requirements[0].id,
        sourceText,
        sourceFormat: 'json',
      },
    ],
  });
  assert.deepEqual(result.answers[0].value, JSON.parse(sourceText));
  assert.equal(Object.hasOwn(result.answers[0].value, '__proto__'), true);
  assert.equal(Object.hasOwn(Object.prototype, 'marker'), false);
  input.requirements[0].schema = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
  );
  assert.deepEqual(
    captureApiInputAnswerContext(input).requirements[0].schema,
    input.requirements[0].schema,
  );
});

test('the original pending contracts and reply survive caller mutation during the model await', async () => {
  const input = await context();
  const original = globalThis.structuredClone(input);
  const model = modelFor((payload) => {
    input.reply = 'different';
    input.requirements[0].schema = { type: 'number' };
    input.requirements[0].operation.snapshotId = 'different';
    return chooseMember(payload);
  }, true);
  const result = await analyzeApiInputAnswers({
    ...input,
    model,
    includeExplanations: true,
  });
  validateApiInputAnswerExtractionRecord({
    ...original,
    record: result.extraction,
  });
  assert.deepEqual(result.extraction.evidence, original);
});
