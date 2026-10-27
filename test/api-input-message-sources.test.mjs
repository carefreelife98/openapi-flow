import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import {
  inspectApiArgumentRequirements,
  describeApiInputMessageSources,
  createApiInputMessageSourceSelectionSchema,
  describeApiInputEnumAnswerChoices,
  resolveApiInputSourceSelections,
  resolveApiInputAnswerInterpretations,
  validateApiInputAnswerAnalysis,
  validateApiInputAnswerExtractionRecord,
} from '@openapi-flow/core';
import {
  analyzeApiInputAnswers,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';
import {
  textInputSource,
  jsonInputSource,
} from './fixtures/api-input-source-selection-fixture.mjs';

async function context(schema = { type: 'string', enum: ['NEW', 'VIEWS'] }) {
  const operation = await requestOperation({
    type: 'object',
    required: ['value'],
    additionalProperties: false,
    properties: { value: schema },
  });
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'source-aware',
    values: { body: {} },
    bindings: [],
  });
  return {
    reply: JSON.stringify({ requests: ['조회수 순으로 처리해줘.'] }),
    sourceMessages: [
      { id: 'original-request', text: '조회수 순으로 처리해줘.' },
    ],
    requirements,
    selectOasEnums: true,
    includeExplanations: true,
  };
}

function source(payload, messageId, text, kind = 'text') {
  const message = payload.messageSources.find(
    (entry) => entry.messageId === messageId,
  );
  assert(message);
  const selection = (kind === 'json' ? jsonInputSource : textInputSource)(
    { sources: message.sources },
    text,
  );
  return {
    ...selection,
    ...(payload.messageSources.length === 1 ? {} : { messageId }),
  };
}

function enumOutput(payload, messageId = 'original-request', value = 'VIEWS') {
  const choice = payload.enumChoices[0];
  const candidate = choice.candidates.find((item) =>
    isDeepStrictEqual(item.value, value),
  );
  assert(candidate);
  return {
    answers: [
      {
        requirementId: choice.requirementId,
        source: {
          kind: 'oas-enum',
          candidateId: candidate.id,
          intent: source(payload, messageId, '조회수'),
        },
        reason: '원문 조회수 의도에 맞는 OAS 후보입니다.',
      },
    ],
    reason: '원래 메시지에서 명시한 입력만 선택했습니다.',
  };
}

function modelWith(decide) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          return decide(payload, options, schema);
        },
      };
    },
  };
}

test('public message-source schema rejects absent or invalid catalogs with a named boundary error', () => {
  for (const input of [
    undefined,
    null,
    {},
    [null],
    [{ messageId: ' ' }],
    [{ messageId: 'source', sources: {} }],
  ])
    assert.throws(
      () => createApiInputMessageSourceSelectionSchema(input),
      /messageSources|Message source catalogs/,
    );
});

test('a single original message supplies enum intent independently of JSON-wrapped reply context', async () => {
  const input = await context();
  const original = globalThis.structuredClone(input);
  const model = modelWith((payload) => enumOutput(payload));
  const result = await analyzeApiInputAnswers({ ...input, model });
  assert.deepEqual(input, original);
  assert.equal(result.answers[0].value, 'VIEWS');
  assert.equal(result.enumSelections[0].intent.messageId, 'original-request');
  assert.deepEqual(result.enumSelections[0].occurrences, [
    { offset: 0, length: 3 },
  ]);
  assert.equal(model.calls.length, 1);
  assert.equal(Object.hasOwn(model.calls[0].payload, 'sources'), false);
  assert.equal(model.calls[0].payload.reply, input.reply);
  validateApiInputAnswerAnalysis({ ...input, analysis: result });
  validateApiInputAnswerExtractionRecord({
    ...input,
    record: result.extraction,
  });
  for (const sourceMessages of [
    [{ id: 'different', text: input.sourceMessages[0].text }],
    [{ id: 'original-request', text: '다른 의도' }],
  ])
    assert.throws(() =>
      validateApiInputAnswerAnalysis({
        ...input,
        sourceMessages,
        analysis: result,
      }),
    );
});

for (const value of [0, false, null, [1, '2'], { count: 2 }])
  test(`original-message enum intent copies OAS JSON value without coercion: ${JSON.stringify(value)}`, async () => {
    const input = await context({ enum: [value] });
    const result = await analyzeApiInputAnswers({
      ...input,
      model: modelWith((payload) =>
        enumOutput(payload, 'original-request', value),
      ),
    });
    assert.deepEqual(result.answers[0].value, value);
    assert.deepEqual(result.enumSelections[0].candidate.value, value);
    validateApiInputAnswerAnalysis({ ...input, analysis: result });
  });

test('multiple messages keep literal and enum evidence separate and original numeric/string types unchanged', async () => {
  const operation = await requestOperation({
    type: 'object',
    required: ['id', 'count', 'sort'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      count: { type: 'integer' },
      sort: { type: 'string', enum: ['NEW', 'VIEWS'] },
    },
  });
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'mixed',
    values: { body: {} },
    bindings: [],
  });
  const input = {
    reply: 'Formatted context only, not a quotation source.',
    requirements,
    sourceMessages: [
      { id: 'request', text: '상품 "0007"로 조회해줘.' },
      { id: 'answer', text: '개수는 0이고 조회수 순이야.' },
    ],
    selectOasEnums: true,
    includeExplanations: true,
  };
  const model = modelWith((payload) => ({
    answers: payload.questions.map((question) => ({
      requirementId: question.id,
      source:
        question.targetPointer === '/body/sort'
          ? {
              kind: 'oas-enum',
              candidateId: payload.enumChoices
                .find((choice) => choice.requirementId === question.id)
                .candidates.find((candidate) => candidate.value === 'VIEWS').id,
              intent: source(payload, 'answer', '조회수'),
            }
          : question.targetPointer === '/body/id'
            ? source(payload, 'request', '"0007"', 'json')
            : source(payload, 'answer', '0', 'json'),
      reason: '해당 원문에 명시된 입력입니다.',
    })),
    reason: '각 원문의 입력과 OAS 후보를 구분했습니다.',
  }));
  const result = await analyzeApiInputAnswers({ ...input, model });
  assert.deepEqual(
    result.answers
      .map((answer) => answer.value)
      .sort((a, b) => String(a).localeCompare(String(b))),
    ['0007', 0, 'VIEWS'].sort((a, b) => String(a).localeCompare(String(b))),
  );
  assert.deepEqual(
    result.sources.map((entry) => entry.messageId),
    ['request', 'answer'],
  );
  assert.equal(result.enumSelections[0].intent.messageId, 'answer');
  assert.deepEqual(result.enumSelections[0].occurrences, [
    { offset: 8, length: 3 },
  ]);
  validateApiInputAnswerAnalysis({ ...input, analysis: result });
  const forged = globalThis.structuredClone(result);
  delete forged.sources[0].messageId;
  assert.throws(() =>
    validateApiInputAnswerAnalysis({ ...input, analysis: forged }),
  );
  assert.equal(model.calls.length, 1);
});

for (const messageId of [undefined, 'invented', 'reply'])
  test(`multiple-source output rejects missing or unknown message identity: ${messageId}`, async () => {
    const input = await context();
    input.sourceMessages.push({ id: 'other', text: '다른 메시지' });
    const model = modelWith((payload) => {
      const output = enumOutput(payload);
      if (messageId === undefined)
        delete output.answers[0].source.intent.messageId;
      else output.answers[0].source.intent.messageId = messageId;
      return output;
    });
    await assert.rejects(analyzeApiInputAnswers({ ...input, model }));
    assert.equal(model.calls.length, 1);
  });

test('same-offset candidates in different messages cannot make reply context an original value source', async () => {
  const input = await context();
  input.sourceMessages.push({ id: 'other', text: '다른값 순으로 처리해줘.' });
  const result = resolveApiInputSourceSelections({
    ...input,
    selections: [
      {
        requirementId: input.requirements[0].id,
        source: {
          kind: 'text',
          startTokenId: 'text:0:1',
          endTokenId: 'text:2:1',
          messageId: 'other',
        },
      },
    ],
  });
  assert.equal(result[0].sourceText, '다른값');
  assert.equal(result[0].messageId, 'other');
  assert.throws(() =>
    resolveApiInputAnswerInterpretations({
      ...input,
      selections: [],
      enumSelections: [
        {
          requirementId: input.requirements[0].id,
          candidateId:
            describeApiInputEnumAnswerChoices(input)[0].candidates[0].id,
          intent: {
            messageId: 'other',
            sourceText: '조회수',
            sourceFormat: 'text',
          },
          reason: 'not original',
        },
      ],
    }),
  );
});

test('explicit empty original sources require no model and do not recover intent from formatted context', async () => {
  const input = await context();
  input.sourceMessages[0].text = '';
  const model = modelWith(() => {
    throw new Error('No model call for empty sources');
  });
  const result = await analyzeApiInputAnswers({ ...input, model });
  assert.equal(result.status, 'empty-reply');
  assert.deepEqual(result.answers, []);
  assert.equal(model.calls.length, 0);
  validateApiInputAnswerAnalysis({ ...input, analysis: result });
});

test('nonempty original sources can be analyzed even when separate reply context is empty', async () => {
  const input = await context();
  input.reply = '';
  const result = await analyzeApiInputAnswers({
    ...input,
    model: modelWith((payload) => enumOutput(payload)),
  });
  assert.equal(result.answers[0].value, 'VIEWS');
  validateApiInputAnswerAnalysis({ ...input, analysis: result });
});

test('invalid source lists fail before a model call and original-message mutation fails after exactly one', async () => {
  for (const sourceMessages of [
    [],
    [
      { id: 'x', text: 'a' },
      { id: 'x', text: 'b' },
    ],
    [{ id: 'x', text: 1 }],
    [{ id: ' ', text: 'a' }],
  ]) {
    const input = await context();
    const model = modelWith(() => ({}));
    await assert.rejects(
      analyzeApiInputAnswers({ ...input, sourceMessages, model }),
    );
    assert.equal(model.calls.length, 0);
  }
  const input = await context();
  const model = modelWith((payload) => {
    const output = enumOutput(payload);
    input.sourceMessages[0].text = 'changed during model request';
    return output;
  });
  await assert.rejects(
    analyzeApiInputAnswers({ ...input, model }),
    /sourceMessages changed/,
  );
  assert.equal(model.calls.length, 1);
});

test('generation composes literal and enum stages using the same original messages without a fake draft or JSON unwrapping', async () => {
  const operation = await requestOperation({
    type: 'object',
    required: ['id', 'sort'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      sort: { type: 'string', enum: ['NEW', 'VIEWS'] },
    },
  });
  const input = {
    callId: 'full-enum-path',
    operation,
    bindings: [],
    scenario: JSON.stringify({
      requests: ['상품 "0007"을 조회수 순으로 조회해줘.'],
    }),
    literalSourceMessages: [
      { id: 'original-request', text: '상품 "0007"을 조회수 순으로 조회해줘.' },
    ],
    selectOasEnums: true,
    includeExplanations: true,
  };
  const model = modelWith((payload, options) =>
    options.name === 'generate_api_arguments'
      ? {
          literalInputs: {
            state: 'provided',
            values: { body: { id: '0007' } },
            literalSources: [
              {
                targetPointer: '/body/id',
                sourceFormat: 'json',
                sourceText: '"0007"',
              },
            ],
          },
          requestedInputs: ['/body/sort'],
          enumIntentInputs: ['/body/sort'],
          explanation: { reason: '원문 상품번호입니다.' },
        }
      : enumOutput(payload),
  );
  const result = await generateApiArguments({ ...input, model });
  assert.deepEqual(result.values, { body: { id: '0007', sort: 'VIEWS' } });
  assert.equal(result.literalSources[0].messageId, 'original-request');
  assert.equal(
    result.enumInterpretation.analysis.enumSelections[0].intent.messageId,
    'original-request',
  );
  validateApiInputAnswerAnalysis(result.enumInterpretation);
  assert.deepEqual(
    model.calls.map((call) => call.options.name),
    ['generate_api_arguments', 'extract_api_input_answers'],
  );
  assert.equal(Object.hasOwn(model.calls[1].payload, 'draft'), false);
});

test('message catalog discovery preserves the original JSON string boundary rather than unwrapping it', () => {
  const messages = [
    { id: 'json-message', text: JSON.stringify({ request: '조회수 순' }) },
  ];
  const catalogs = describeApiInputMessageSources(messages);
  assert.throws(
    () => textInputSource({ sources: catalogs[0].sources }, '조회수'),
    /exact unquoted text span/,
  );
  assert(
    catalogs[0].sources.json.some(
      (candidate) => candidate.text === '"조회수 순"',
    ),
  );
});

test('a change to original generation messages during the second enum call cannot adopt stale arguments', async () => {
  const operation = await requestOperation({
    type: 'object',
    required: ['value'],
    properties: { value: { type: 'string', enum: ['NEW', 'VIEWS'] } },
  });
  const input = {
    callId: 'second-stage-change',
    operation,
    bindings: [],
    scenario: 'Separate structured context',
    literalSourceMessages: [
      { id: 'original-request', text: '조회수 순으로 조회해줘.' },
    ],
    selectOasEnums: true,
  };
  const model = modelWith((payload, options) => {
    if (options.name === 'generate_api_arguments')
      return {
        literalInputs: { state: 'not-provided' },
        requestedInputs: ['/body/value'],
        enumIntentInputs: ['/body/value'],
      };
    const output = enumOutput(payload);
    delete output.reason;
    input.literalSourceMessages[0].id = 'different-source';
    return output;
  });
  await assert.rejects(
    generateApiArguments({ ...input, model }),
    /literalSourceMessages changed/,
  );
  assert.equal(model.calls.length, 2);
});
