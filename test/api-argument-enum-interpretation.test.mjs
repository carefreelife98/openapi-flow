import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiOperations,
  describeApiArgumentEnumContext,
  resolveApiArgumentEnumInterpretation,
  validateApiInputAnswerAnalysis,
  validateApiLiteralGenerationRecord,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

const idSource = {
  targetPointer: '/query/id',
  sourceFormat: 'json',
  sourceText: '"0007"',
};

async function operation(
  schema = { type: 'string', enum: ['VIEWS', 'NEW'], default: 'NEW' },
) {
  const catalog = await createApiCatalog([
    {
      id: 'enum-fixture',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Initial enum fixture', version: '1' },
        paths: {
          '/items': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'query',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'sort',
                  in: 'query',
                  schema,
                  description: 'Requested sort mode',
                },
              ],
              responses: { 200: { description: 'Result' } },
            },
          },
        },
      },
    },
  ]);
  return (await resolveApiOperations(catalog, [catalog.operations[0].key]))[0];
}

function model(
  first,
  choose = (payload) => payload.enumChoices[0].candidates[0],
  mutate = (output) => output,
) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          if (options.name === 'generate_api_arguments')
            return globalThis.structuredClone(first);
          assert.equal(options.name, 'extract_api_input_answers');
          const candidate = choose(payload);
          return mutate({
            answers:
              candidate === undefined
                ? []
                : [
                    {
                      requirementId: payload.enumChoices[0].requirementId,
                      source: {
                        kind: 'oas-enum',
                        candidateId: candidate.id,
                        intent: textInputSource(payload, '조회수'),
                      },
                      reason: '조회수 의도에 맞는 OAS 후보를 선택했습니다.',
                    },
                  ],
            ...(Object.hasOwn(schema.properties, 'reason')
              ? { reason: '현재 호출의 요청 의도만 확인했습니다.' }
              : {}),
          });
        },
      };
    },
  };
}

test('initial independent generation tracks requested optional inputs and reuses one source-bound enum stage without a fake draft', async () => {
  const input = {
    callId: 'first-role',
    operation: await operation(),
    bindings: [],
    scenario:
      '첫 조회는 상품 "0007"을 조회수 순으로, 두 번째 조회는 최신순으로 조회해줘.',
    purpose: '첫 조회',
    trackRequestedInputs: true,
    selectOasEnums: true,
    includeExplanations: true,
  };
  const original = globalThis.structuredClone(input);
  const llm = model({
    literalSources: [idSource],
    values: { query: { id: '0007' } },
    requestedInputs: ['/query/id', '/query/sort'],
    explanation: { reason: '첫 조회에 명시한 상품번호만 그대로 추출했습니다.' },
  });
  const result = await generateApiArguments({ ...input, model: llm });
  assert.deepEqual(input, original);
  assert.deepEqual(result.values, { query: { id: '0007', sort: 'VIEWS' } });
  assert.deepEqual(result.unresolvedInputs, []);
  assert.deepEqual(
    llm.calls.map((call) => call.options.name),
    ['generate_api_arguments', 'extract_api_input_answers'],
  );
  assert.equal(llm.calls[1].payload.purpose, input.purpose);
  assert.equal(llm.calls[1].payload.reply, input.scenario);
  assert.equal(Object.hasOwn(llm.calls[1].payload, 'draft'), false);
  assert.equal(Object.hasOwn(llm.calls[1].payload, 'plan'), false);
  assert.equal(llm.calls[1].payload.questions.length, 1);
  assert.equal(llm.calls[1].payload.questions[0].targetPointer, '/query/sort');
  assert.deepEqual(result.literalGeneration.proposedValues, {
    query: { id: '0007' },
  });
  validateApiLiteralGenerationRecord({
    ...input,
    record: result.literalGeneration,
  });
  assert.deepEqual(result.enumInterpretation.analysis.sources, []);
  assert.equal(
    result.enumInterpretation.analysis.enumSelections[0].candidate.value,
    'VIEWS',
  );
  validateApiInputAnswerAnalysis(result.enumInterpretation);
  const replay = resolveApiArgumentEnumInterpretation({
    ...input,
    proposal: { values: result.literalGeneration.proposedValues },
    literalSources: result.literalSources,
    requestedInputs: result.requestedInputs,
    analysis: result.enumInterpretation.analysis,
  });
  assert.deepEqual(replay.values, result.values);
  assert.throws(
    () =>
      resolveApiArgumentEnumInterpretation({
        ...input,
        purpose: 'different role',
        proposal: { values: result.literalGeneration.proposedValues },
        literalSources: result.literalSources,
        requestedInputs: result.requestedInputs,
        analysis: result.enumInterpretation.analysis,
      }),
    /original reply|differs/,
  );
});

test('ambiguous enum remains a real requested question; default and unrequested optional enum never supply intent', async () => {
  const input = {
    callId: 'read',
    operation: await operation(),
    bindings: [],
    scenario: '상품 "0007"을 조회수 순으로 조회해줘.',
    trackRequestedInputs: true,
    selectOasEnums: true,
  };
  const ambiguous = model(
    {
      values: { query: { id: '0007' } },
      requestedInputs: ['/query/sort'],
      literalSources: [idSource],
    },
    () => undefined,
  );
  const result = await generateApiArguments({ ...input, model: ambiguous });
  assert.deepEqual(result.values, { query: { id: '0007' } });
  assert.deepEqual(result.unresolvedInputs, ['/query/sort']);
  assert.deepEqual(result.enumInterpretation.analysis.answers, []);
  const unrequested = model({
    literalSources: [idSource],
    values: { query: { id: '0007' } },
    requestedInputs: [],
  });
  const untouched = await generateApiArguments({
    ...input,
    scenario: '상품 "0007"을 조회해줘.',
    model: unrequested,
  });
  assert.equal(unrequested.calls.length, 1);
  assert.equal(Object.hasOwn(untouched, 'enumInterpretation'), false);
  assert.equal(Object.hasOwn(untouched.values.query, 'sort'), false);
});

test('semantic selection is opt-in and exact supplied enum literals do not cause another call', async () => {
  const input = {
    callId: 'read',
    operation: await operation(),
    bindings: [],
    scenario: '상품 "0007"을 조회수 순으로 조회해줘.',
    trackRequestedInputs: true,
  };
  const disabled = model({
    literalSources: [idSource],
    values: { query: { id: '0007' } },
    requestedInputs: ['/query/sort'],
  });
  const result = await generateApiArguments({ ...input, model: disabled });
  assert.equal(disabled.calls.length, 1);
  assert.deepEqual(result.unresolvedInputs, ['/query/sort']);
  const supplied = model({
    literalSources: [
      idSource,
      {
        targetPointer: '/query/sort',
        sourceFormat: 'json',
        sourceText: '"VIEWS"',
      },
    ],
    values: { query: { id: '0007', sort: 'VIEWS' } },
    requestedInputs: ['/query/sort'],
  });
  const literal = await generateApiArguments({
    ...input,
    selectOasEnums: true,
    scenario: '상품 "0007"을 sort "VIEWS"로 조회해줘.',
    model: supplied,
  });
  assert.equal(supplied.calls.length, 1);
  assert.equal(Object.hasOwn(literal, 'enumInterpretation'), false);
});

test('original JSON enum types are copied without coercion, including null and composite parameter values', async () => {
  for (const value of [0, false, null, ['00', 1], { key: '00', count: 2 }]) {
    const llm = model({
      literalSources: [idSource],
      values: { query: { id: '0007' } },
      requestedInputs: ['/query/sort'],
    });
    const result = await generateApiArguments({
      callId: 'typed',
      operation: await operation({ enum: [value] }),
      bindings: [],
      scenario: '상품 "0007"을 조회수 순으로 조회해줘.',
      selectOasEnums: true,
      trackRequestedInputs: true,
      model: llm,
    });
    assert.deepEqual(result.values.query.sort, value);
    assert.deepEqual(
      result.enumInterpretation.analysis.enumSelections[0].candidate.value,
      value,
    );
  }
});

test('confirmed and bound values are not enum targets; all-owned requests do not invoke any model', async () => {
  const op = await operation();
  const input = {
    callId: 'owned',
    operation: op,
    bindings: [],
    scenario: '조회수로 해줘.',
  };
  const confirmedInputs = [
    {
      callId: 'owned',
      operation: op.key,
      targetPointer: '/query/id',
      value: '0007',
    },
    {
      callId: 'owned',
      operation: op.key,
      targetPointer: '/query/sort',
      value: 'NEW',
    },
  ];
  const result = await generateApiArguments({
    ...input,
    confirmedInputs,
    selectOasEnums: true,
    trackRequestedInputs: true,
  });
  assert.deepEqual(result.values, { query: { id: '0007', sort: 'NEW' } });
  assert.equal(Object.hasOwn(result, 'enumInterpretation'), false);
  const context = describeApiArgumentEnumContext({
    ...input,
    proposal: { values: {} },
    literalSources: [],
    requestedInputs: ['/query/sort'],
    bindings: [
      {
        kind: 'node-output',
        sourceNodeId: 'upstream',
        sourcePointer: '/sort',
        targetPointer: '/query/sort',
      },
    ],
  });
  assert.deepEqual(context.requirements, []);
});

test('invalid first values and invalid enum choices fail without repair, another plan or retry', async () => {
  const input = {
    callId: 'read',
    operation: await operation(),
    bindings: [],
    scenario: '조회수로 상품 "0007"을 조회해줘.',
    selectOasEnums: true,
    trackRequestedInputs: true,
  };
  const invalid = model({
    literalSources: [idSource],
    values: { query: { id: '0007', sort: 'invented' } },
    requestedInputs: ['/query/sort'],
  });
  await assert.rejects(
    generateApiArguments({ ...input, model: invalid }),
    /model arguments/,
  );
  assert.equal(invalid.calls.length, 1);
  for (const mutate of [
    (output) => {
      output.answers[0].source.value = 'VIEWS';
      return output;
    },
    (output) => {
      output.answers[0].source.candidateId = 'foreign';
      return output;
    },
    (output) => {
      output.answers[0].source.intent.startTokenId = 'foreign';
      return output;
    },
  ]) {
    const invalidChoice = model(
      {
        values: { query: { id: '0007' } },
        requestedInputs: ['/query/sort'],
        literalSources: [idSource],
      },
      undefined,
      mutate,
    );
    await assert.rejects(
      generateApiArguments({ ...input, model: invalidChoice }),
    );
    assert.equal(invalidChoice.calls.length, 2);
  }
  for (const option of ['selectOasEnums', 'trackRequestedInputs']) {
    const unused = model({ values: {} });
    await assert.rejects(
      generateApiArguments({ ...input, [option]: 'true', model: unused }),
    );
    assert.equal(unused.calls.length, 0);
  }
});

test('an OAS-valid enum cannot bypass semantic provenance by pretending to be an explicit literal', async () => {
  const llm = model({
    values: { query: { id: '0007', sort: 'VIEWS' } },
    requestedInputs: ['/query/sort'],
    literalSources: [
      idSource,
      {
        targetPointer: '/query/sort',
        sourceFormat: 'json',
        sourceText: '"VIEWS"',
      },
    ],
  });
  await assert.rejects(
    generateApiArguments({
      callId: 'read',
      operation: await operation(),
      bindings: [],
      scenario: '상품 "0007"을 조회수 순으로 조회해줘.',
      selectOasEnums: true,
      model: llm,
    }),
    /original|source|occurrence/,
  );
  assert.equal(llm.calls.length, 1);
});

test('an absent request body exposes only requested enum descendants and preserves unrelated missing inputs', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'nested-body',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Nested enum', version: '1' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['id', 'preferences'],
                      properties: {
                        id: { type: 'string' },
                        preferences: {
                          type: 'object',
                          required: ['sort'],
                          properties: {
                            sort: { type: 'string', enum: ['VIEWS', 'NEW'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
              responses: { 200: { description: 'Result' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const llm = model({
    values: {},
    requestedInputs: ['/body/preferences/sort'],
    literalSources: [],
  });
  const result = await generateApiArguments({
    callId: 'nested',
    operation,
    bindings: [],
    requestMediaType: 'application/json',
    scenario: '조회수 순으로 생성해줘. id는 나에게 물어봐.',
    selectOasEnums: true,
    model: llm,
  });
  assert.deepEqual(result.values, { body: { preferences: { sort: 'VIEWS' } } });
  assert.deepEqual(result.unresolvedInputs, ['/body/id']);
  assert.equal(
    llm.calls[1].payload.questions[0].targetPointer,
    '/body/preferences/sort',
  );
  assert.equal(
    result.enumInterpretation.analysis.enumSelections[0].candidate
      .targetPointer,
    '/body/preferences/sort',
  );
});

test('an empty parameter group is retained as original proposal evidence and is not a fabricated literal', async () => {
  const llm = model({
    values: { query: {} },
    requestedInputs: ['/query/sort'],
    literalSources: [],
  });
  const result = await generateApiArguments({
    callId: 'empty-query',
    operation: await operation(),
    bindings: [],
    scenario: '조회수 순으로 조회해줘. id는 물어봐.',
    selectOasEnums: true,
    model: llm,
  });
  assert.deepEqual(
    llm.calls[0].payload.scenario,
    '조회수 순으로 조회해줘. id는 물어봐.',
  );
  assert.deepEqual(result.literalSources, []);
  assert.deepEqual(result.values, { query: { sort: 'VIEWS' } });
  assert.deepEqual(result.unresolvedInputs, ['/query/id']);
});
