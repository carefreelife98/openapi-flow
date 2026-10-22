import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiInputEnumAnswerChoices,
  resolveApiInputAnswerInterpretations,
  validateApiInputAnswerExtractionRecord,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';
import {
  textInputSource,
  jsonInputSource,
} from './fixtures/api-input-source-selection-fixture.mjs';

async function enumContext(
  schema = { type: 'string', enum: ['NEW', 'VIEWS'], default: 'VIEWS' },
) {
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  return {
    reply: '최신순으로 해줘.',
    requirements: [{ ...requirements[0], schema }],
    selectOasEnums: true,
  };
}

function enumSelection(context, candidate) {
  return {
    requirementId: context.requirements[0].id,
    candidateId: candidate.id,
    intent: { sourceFormat: 'text', sourceText: '최신순' },
    reason: '최신순 요청에 맞는 OAS 후보를 선택했습니다.',
  };
}

test('pending enum interpretation copies every JSON value type from its original OAS and keeps intent separate', async () => {
  for (const value of ['NEW', 0, false, null, [1, '2'], { quantity: 2 }]) {
    const input = await enumContext({ enum: [value] });
    const [choice] = describeApiInputEnumAnswerChoices(input);
    const resolved = resolveApiInputAnswerInterpretations({
      ...input,
      selections: [],
      enumSelections: [enumSelection(input, choice.candidates[0])],
    });
    assert.deepEqual(resolved.answers, [
      { requirementId: input.requirements[0].id, value },
    ]);
    assert.deepEqual(resolved.sources, []);
    assert.equal(resolved.enumSelections[0].intent.sourceText, '최신순');
    assert.deepEqual(resolved.enumSelections[0].candidate.value, value);
    assert.deepEqual(resolved.enumSelections[0].occurrences, [
      { offset: 0, length: 3 },
    ]);
    assert.deepEqual(resolved.unansweredRequirementIds, []);
    assert.deepEqual(input.requirements[0].schema.enum[0], value);
  }
});

test('enum choices honor original references, sibling assertions and OAS 3.0 nullable, never defaults/examples', async () => {
  const input = await enumContext({
    $defs: { sort: { enum: ['NEW', 'VIEWS', 0] } },
    $ref: '#/$defs/sort',
    type: 'string',
    not: { const: 'VIEWS' },
    default: 'DEFAULT',
    examples: ['EXAMPLE'],
  });
  assert.deepEqual(
    describeApiInputEnumAnswerChoices(input)[0].candidates.map(
      (item) => item.value,
    ),
    ['NEW'],
  );
  input.requirements[0].schema = {
    type: 'string',
    default: 'DEFAULT',
    examples: ['EXAMPLE'],
  };
  assert.deepEqual(describeApiInputEnumAnswerChoices(input), []);
  input.requirements[0].schema = {
    type: 'string',
    nullable: true,
    enum: ['NEW', null],
  };
  input.requirements[0].openapiVersion = '3.0.3';
  assert.deepEqual(
    describeApiInputEnumAnswerChoices(input)[0].candidates.map(
      (item) => item.value,
    ),
    ['NEW', null],
  );
  assert.deepEqual(
    describeApiInputEnumAnswerChoices({ ...input, selectOasEnums: false }),
    [],
  );
});

test('code rejects unknown/stale/cross-question choices, fabricated intent, extra values, disabled policy and duplicate answers', async () => {
  const input = await enumContext();
  const candidate = describeApiInputEnumAnswerChoices(input)[0].candidates[0];
  const selection = enumSelection(input, candidate);
  for (const changes of [
    { enumSelections: [{ ...selection, candidateId: 'invented' }] },
    { enumSelections: [{ ...selection, requirementId: 'other' }] },
    {
      enumSelections: [
        {
          ...selection,
          intent: { sourceFormat: 'text', sourceText: '조회수' },
        },
      ],
    },
    { enumSelections: [{ ...selection, value: 'HACKED' }] },
    { enumSelections: [{ ...selection, reason: ' ' }] },
    { enumSelections: [selection, selection] },
    { selectOasEnums: false },
    {
      requirements: [
        {
          ...input.requirements[0],
          operation: {
            ...input.requirements[0].operation,
            snapshotId: 'changed',
          },
        },
      ],
    },
  ])
    assert.throws(() =>
      resolveApiInputAnswerInterpretations({
        ...input,
        selections: [],
        enumSelections: [selection],
        ...changes,
      }),
    );
  assert.throws(
    () =>
      resolveApiInputAnswerInterpretations({
        ...input,
        reply: '최신순 또는 "NEW"',
        selections: [
          {
            requirementId: selection.requirementId,
            sourceFormat: 'json',
            sourceText: '"NEW"',
          },
        ],
        enumSelections: [selection],
      }),
    /Duplicate/,
  );
  assert.deepEqual(
    resolveApiInputAnswerInterpretations({ ...input, selections: [] }).answers,
    [],
  );
});

test('one model call selects enum/source IDs only; literal answers, pending questions and independently replayable receipts remain intact', async () => {
  for (const includeExplanations of [false, true]) {
    const input = await enumContext();
    input.reply = '최신순으로 해줘. 회원은 "member-01"';
    input.requirements.push({
      ...input.requirements[0],
      id: 'member',
      schema: { type: 'string' },
      targetPointer: '/header/member',
    });
    input.requirements.push({
      ...input.requirements[1],
      id: 'tenant',
      targetPointer: '/header/tenant',
    });
    const calls = [];
    const model = {
      withStructuredOutput(schema, options) {
        return {
          async invoke(messages) {
            const payload = JSON.parse(messages[1].content);
            calls.push({ schema, options, payload });
            const candidate = payload.enumChoices[0].candidates.find(
              (item) => item.value === 'NEW',
            );
            return {
              answers: [
                {
                  requirementId: payload.questions[0].id,
                  source: {
                    kind: 'oas-enum',
                    candidateId: candidate.id,
                    intent: textInputSource(payload, '최신순'),
                  },
                  reason: '최신순에 맞는 OAS 후보입니다.',
                },
                {
                  requirementId: 'member',
                  source: jsonInputSource(payload, '"member-01"'),
                  ...(includeExplanations
                    ? { reason: '회원번호 원문입니다.' }
                    : {}),
                },
              ],
              ...(includeExplanations
                ? { reason: '이번 답변에서 두 질문의 답을 선택했습니다.' }
                : {}),
            };
          },
        };
      },
    };
    const result = await analyzeApiInputAnswers({
      ...input,
      model,
      includeExplanations,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.name, 'extract_api_input_answers');
    assert.equal(calls[0].options.strict, true);
    assert.deepEqual(result.answers, [
      { requirementId: 'member', value: 'member-01' },
      { requirementId: input.requirements[0].id, value: 'NEW' },
    ]);
    assert.deepEqual(result.unansweredRequirementIds, ['tenant']);
    assert.equal(result.sources.length, 1);
    assert.equal(result.enumSelections.length, 1);
    assert.equal(Object.hasOwn(result, 'extraction'), includeExplanations);
    if (includeExplanations) {
      validateApiInputAnswerExtractionRecord({
        ...input,
        record: result.extraction,
      });
      for (const mutate of [
        (record) => {
          record.verification.enumSelections[0].candidate.value = 'VIEWS';
        },
        (record) => {
          record.verification.enumSelections[0].occurrences[0].offset++;
        },
        (record) => {
          record.evidence.selectOasEnums = false;
        },
      ]) {
        const record = globalThis.structuredClone(result.extraction);
        mutate(record);
        assert.throws(
          () => validateApiInputAnswerExtractionRecord({ ...input, record }),
          /differs/,
        );
      }
      assert.throws(() =>
        validateApiInputAnswerExtractionRecord({
          ...input,
          reply: '조회수로 해줘.',
          record: result.extraction,
        }),
      );
    }
  }
});
