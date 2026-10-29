import { literalJsonCandidateId } from './fixtures/api-literal-json-source-choice.mjs';
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

const idSource = {
  targetPointer: '/query/id',
  sourceFormat: 'json',
  candidateId: literalJsonCandidateId('"0007"'),
};

async function operation(
  schema = { type: 'string', enum: ['VIEWS', 'NEW'], default: 'NEW' },
  extraParameters = [],
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
                ...extraParameters,
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
          assert.equal(options.name, 'select_api_argument_enums');
          const candidate = choose(payload);
          return mutate({
            decisions: Object.fromEntries(
              payload.questions.map((question) => [
                question.id,
                candidate === undefined
                  ? { status: 'not-supplied' }
                  : { status: 'selected', candidateId: candidate.id },
              ]),
            ),
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
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007' } },
      literalSources: [idSource],
    },
    requestedInputs: ['/query/id', '/query/sort'],
    explanation: { reason: '첫 조회에 명시한 상품번호만 그대로 추출했습니다.' },
  });
  const result = await generateApiArguments({ ...input, model: llm });
  assert.deepEqual(input, original);
  assert.deepEqual(result.values, { query: { id: '0007', sort: 'VIEWS' } });
  assert.deepEqual(result.unresolvedInputs, []);
  assert.deepEqual(
    llm.calls.map((call) => call.options.name),
    ['generate_api_arguments', 'select_api_argument_enums'],
  );
  assert.equal(llm.calls[1].payload.purpose, input.purpose);
  assert.deepEqual(llm.calls[1].payload.sourceMessages, [
    { id: 'scenario', text: input.scenario },
  ]);
  assert.equal(Object.hasOwn(llm.calls[1].payload, 'reply'), false);
  assert.equal(Object.hasOwn(llm.calls[1].payload, 'sources'), false);
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
      literalInputs: {
        state: 'provided',
        values: { query: { id: '0007' } },
        literalSources: [idSource],
      },
      requestedInputs: ['/query/sort'],
    },
    () => undefined,
  );
  const result = await generateApiArguments({ ...input, model: ambiguous });
  assert.deepEqual(result.values, { query: { id: '0007' } });
  assert.deepEqual(result.unresolvedInputs, ['/query/sort']);
  assert.deepEqual(result.enumInterpretation.analysis.answers, []);
  const unrequested = model({
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007' } },
      literalSources: [idSource],
    },
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
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007' } },
      literalSources: [idSource],
    },
    requestedInputs: ['/query/sort'],
  });
  const result = await generateApiArguments({ ...input, model: disabled });
  assert.equal(disabled.calls.length, 1);
  assert.deepEqual(result.unresolvedInputs, ['/query/sort']);
  const supplied = model({
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007', sort: 'VIEWS' } },
      literalSources: [
        idSource,
        {
          targetPointer: '/query/sort',
          sourceFormat: 'json',
          candidateId: literalJsonCandidateId('"VIEWS"'),
        },
      ],
    },
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
      literalInputs: {
        state: 'provided',
        values: { query: { id: '0007' } },
        literalSources: [idSource],
      },
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
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007', sort: 'invented' } },
      literalSources: [idSource],
    },
    requestedInputs: ['/query/sort'],
  });
  await assert.rejects(
    generateApiArguments({ ...input, model: invalid }),
    /model arguments/,
  );
  assert.equal(invalid.calls.length, 1);
  for (const mutate of [
    (output) => {
      Object.values(output.decisions)[0].value = 'VIEWS';
      return output;
    },
    (output) => {
      Object.values(output.decisions)[0].candidateId = 'foreign';
      return output;
    },
    (output) => {
      Object.values(output.decisions)[0].sourceMessageId = 'foreign';
      return output;
    },
  ]) {
    const invalidChoice = model(
      {
        literalInputs: {
          state: 'provided',
          values: { query: { id: '0007' } },
          literalSources: [idSource],
        },
        requestedInputs: ['/query/sort'],
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
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007', sort: 'VIEWS' } },
      literalSources: [
        idSource,
        {
          targetPointer: '/query/sort',
          sourceFormat: 'json',
          candidateId: literalJsonCandidateId('"VIEWS"'),
        },
      ],
    },
    requestedInputs: ['/query/sort'],
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
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
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
    literalInputs: { state: 'not-provided' },
    requestedInputs: ['/body/preferences/sort'],
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

test('explicit literal absence keeps enum intent pending without emitting an empty parameter container', async () => {
  const llm = model({
    literalInputs: { state: 'not-provided' },
    requestedInputs: ['/query/sort'],
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

test('requested enums can remain unanswered without interpreting examples or display reasons', async () => {
  const proposed = {
    literalInputs: { state: 'not-provided' },
    requestedInputs: ['/query/id', '/query/sort'],
    explanation: { reason: '표시 설명에 VIEWS가 있어도 실행 결정이 아닙니다.' },
  };
  const before = globalThis.structuredClone(proposed);
  const llm = model(proposed, () => undefined);
  const result = await generateApiArguments({
    callId: 'future-value',
    operation: await operation(),
    bindings: [],
    scenario: '상품번호와 정렬은 나중에 지정할게. 예시 정렬 값은 "VIEWS"다.',
    selectOasEnums: true,
    includeExplanations: true,
    model: llm,
  });
  assert.deepEqual(proposed, before);
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.unresolvedInputs, ['/query/id', '/query/sort']);
  assert.deepEqual(result.enumInterpretation.analysis.answers, []);
  assert.equal(llm.calls.length, 2);
  assert.equal(
    Object.hasOwn(llm.calls[0].schema.properties, 'enumIntentInputs'),
    false,
  );
});

test('an advertised enum target can still be explicitly not supplied without promoting an example', async () => {
  const llm = model(
    {
      literalInputs: { state: 'not-provided' },
      requestedInputs: ['/query/sort'],
    },
    () => undefined,
  );
  const result = await generateApiArguments({
    callId: 'example-is-not-an-answer',
    operation: await operation(),
    bindings: [],
    scenario: '정렬은 나중에 지정할게. 예시 값은 VIEWS다.',
    selectOasEnums: true,
    model: llm,
  });
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.unresolvedInputs, ['/query/id', '/query/sort']);
  assert.deepEqual(result.enumInterpretation.analysis.answers, []);
  assert.equal(llm.calls.length, 2);
  const payload = llm.calls[1].payload;
  for (const field of ['reply', 'sources', 'messageSources'])
    assert.equal(Object.hasOwn(payload, field), false);
  assert.equal(Object.hasOwn(payload.sourceMessages[0], 'tokens'), false);
  validateApiInputAnswerAnalysis(result.enumInterpretation);
});

test('initial enum decisions copy every OAS value type and bind source identity without requiring display reasons', async () => {
  for (const value of ['VIEWS', 0, false, null, [1, '2'], { count: 2 }]) {
    const input = {
      callId: 'typed-choice',
      operation: await operation({ enum: [value] }),
      bindings: [],
      scenario: '조회수 의미를 사용해줘.',
      selectOasEnums: true,
    };
    const llm = model({
      literalInputs: { state: 'not-provided' },
      requestedInputs: ['/query/sort'],
    });
    const result = await generateApiArguments({ ...input, model: llm });
    assert.deepEqual(result.values, { query: { sort: value } });
    const selection = result.enumInterpretation.analysis.enumSelections[0];
    assert.match(selection.sourceFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(selection, 'reason'), false);
    assert.equal(selection.intent.sourceText, input.scenario);
    validateApiInputAnswerAnalysis(result.enumInterpretation);
    assert.throws(
      () =>
        validateApiInputAnswerAnalysis({
          ...result.enumInterpretation,
          purpose: 'another call role',
        }),
      /source fingerprint/,
    );
  }
});

test('code derives enum targets from requested paths without scheduling unrelated missing fields', async () => {
  const input = {
    callId: 'scoped-enum',
    operation: await operation(undefined, [
      {
        name: 'mode',
        in: 'query',
        required: true,
        schema: { enum: ['SAFE', 'FAST'] },
      },
    ]),
    bindings: [],
    scenario: '상품 "0007"을 조회수 순으로 조회하고 mode는 나중에 정할게.',
    selectOasEnums: true,
  };
  const llm = model({
    literalInputs: {
      state: 'provided',
      values: { query: { id: '0007' } },
      literalSources: [idSource],
    },
    requestedInputs: ['/query/sort'],
  });
  const result = await generateApiArguments({ ...input, model: llm });
  assert.deepEqual(result.requestedInputs, ['/query/sort']);
  assert.deepEqual(result.values, { query: { id: '0007', sort: 'VIEWS' } });
  assert.deepEqual(result.unresolvedInputs, ['/query/mode']);
  assert.deepEqual(
    llm.calls[1].payload.questions.map((item) => item.targetPointer),
    ['/query/sort'],
  );
  assert.equal(
    JSON.stringify(llm.calls[1].payload.enumChoices).includes('SAFE'),
    false,
  );
  assert.throws(() =>
    resolveApiArgumentEnumInterpretation({
      ...input,
      proposal: { values: { query: { id: '0007' } } },
      literalSources: result.literalSources,
      requestedInputs: result.requestedInputs,
      enumIntentInputs: ['/query/mode'],
      analysis: result.enumInterpretation.analysis,
    }),
  );
});

test('the literal output cannot supply a model-owned enum dispatch list', async () => {
  const input = {
    callId: 'invalid-enum-dispatch',
    operation: await operation(),
    bindings: [],
    scenario: '정렬은 나중에 지정할게.',
    selectOasEnums: true,
  };
  for (const targets of [
    null,
    [],
    ['/query/sort'],
    ['/query/sort', '/query/sort'],
    ['/query/not-declared'],
  ]) {
    const llm = model({
      literalInputs: { state: 'not-provided' },
      requestedInputs: [],
      enumIntentInputs: targets,
    });
    await assert.rejects(generateApiArguments({ ...input, model: llm }));
    assert.equal(llm.calls.length, 1);
  }
});

test('missing or invalid requested input paths fail before enum dispatch', async () => {
  const input = {
    callId: 'invalid-requested-enum',
    operation: await operation(),
    bindings: [],
    scenario: '정렬은 나중에 지정할게.',
    selectOasEnums: true,
  };
  for (const requestedInputs of [
    undefined,
    null,
    ['/query/sort', '/query/sort'],
    ['/query/not-declared'],
  ]) {
    const llm = model({
      literalInputs: { state: 'not-provided' },
      ...(requestedInputs === undefined ? {} : { requestedInputs }),
    });
    await assert.rejects(generateApiArguments({ ...input, model: llm }));
    assert.equal(llm.calls.length, 1);
  }
});
