import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraftApiInputEditContract,
  describeWorkflowDraftApiInputEditAnswerRequirements,
  describeApiInputEnumAnswerChoices,
  resolveApiInputAnswerInterpretations,
  resolveWorkflowDraftApiInputEditReply,
  resolveWorkflowDraftApiInputEdits,
  validateApiInputAnswerAnalysis,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { createApiEnumEditFixture } from './fixtures/workflow-draft-api-enum-edit-fixture.mjs';
import { schemaDraftInputEditFixture } from './fixtures/workflow-draft-api-input-edit-fixture.mjs';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

function pending(input) {
  return {
    ...input,
    output: {
      values: Object.fromEntries(
        input.contract.targets
          .filter((target) => target.kind === 'set')
          .map((target) => [target.id, { status: 'needs-input' }]),
      ),
    },
  };
}

function selectEnum(context, value) {
  const choice = describeApiInputEnumAnswerChoices(context).find((choice) =>
    choice.candidates.some(
      (candidate) => JSON.stringify(candidate.value) === JSON.stringify(value),
    ),
  );
  assert(choice);
  const candidate = choice.candidates.find(
    (candidate) => JSON.stringify(candidate.value) === JSON.stringify(value),
  );
  return {
    status: 'extracted',
    ...resolveApiInputAnswerInterpretations({
      ...context,
      selections: [],
      enumSelections: [
        {
          requirementId: choice.requirementId,
          candidateId: candidate.id,
          intent: { sourceFormat: 'text', sourceText: context.reply },
          reason: '현재 답변에 맞는 OAS 후보를 선택했습니다.',
        },
      ],
    }),
  };
}

test('natural edit replies reuse one source-ID call and preserve the original proposal, untouched values and atomic partial edit', async () => {
  const input = pending(
    await createApiEnumEditFixture({
      pointers: ['/body/sort', '/body/note'],
      text: '정렬 방식과 메모를 바꿔줘.',
    }),
  );
  const before = globalThis.structuredClone(input);
  const requirements =
    describeWorkflowDraftApiInputEditAnswerRequirements(input);
  assert.deepEqual(
    requirements.map((item) => item.targetPointer),
    ['/body/sort', '/body/note'],
  );
  const calls = [];
  const reply = '조회수 순으로 해줘.';
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          const choice = payload.enumChoices[0];
          return {
            answers: [
              {
                requirementId: choice.requirementId,
                source: {
                  kind: 'oas-enum',
                  candidateId: choice.candidates.find(
                    (item) => item.value === 'VIEWS',
                  ).id,
                  intent: textInputSource(payload, '조회수 순'),
                },
                reason: '조회수 순에 맞는 OAS 정렬입니다.',
              },
            ],
          };
        },
      };
    },
  };
  const analysis = await analyzeApiInputAnswers({
    reply,
    requirements,
    selectOasEnums: true,
    model,
  });
  const confirmedAnswers = resolveWorkflowDraftApiInputEditReply({
    ...input,
    reply,
    analysis,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.name, 'extract_api_input_answers');
  assert.deepEqual(confirmedAnswers, {
    contractId: input.contract.id,
    answers: [{ targetId: 'value-1', value: 'VIEWS' }],
  });
  const partial = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers,
  });
  assert.equal(partial.status, 'needs-input');
  assert.deepEqual(
    partial.pendingTargets.map((target) => target.pointer),
    ['/body/note'],
  );
  assert.deepEqual(partial.values, input.output);
  const remaining = describeWorkflowDraftApiInputEditAnswerRequirements({
    ...input,
    confirmedAnswers,
  });
  assert.deepEqual(
    remaining.map((item) => item.targetPointer),
    ['/body/note'],
  );
  const complete = resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers: {
      ...confirmedAnswers,
      answers: [
        ...confirmedAnswers.answers,
        { targetId: 'value-2', value: '0007' },
      ],
    },
  });
  assert.equal(complete.status, 'ready');
  assert.deepEqual(complete.resolution.edits, [
    { kind: 'set', pointer: '/body/note', value: '0007' },
    { kind: 'set', pointer: '/body/sort', value: 'VIEWS' },
  ]);
  assert.deepEqual(complete.values, input.output);
  assert.deepEqual(input, before);
});

test('pending edit enum replies preserve original scalar/container values rather than the intent text type', async () => {
  for (const value of ['VIEWS', 0, false, null, [1, '2'], { quantity: 2 }]) {
    const input = pending(
      await createApiEnumEditFixture({
        schema: { enum: [value] },
        oldValue: value,
      }),
    );
    const context = {
      reply: '이 값으로 해줘.',
      requirements: describeWorkflowDraftApiInputEditAnswerRequirements(input),
      selectOasEnums: true,
    };
    const analysis = selectEnum(context, value);
    assert.deepEqual(
      resolveWorkflowDraftApiInputEditReply({
        ...input,
        reply: context.reply,
        analysis,
      }).answers,
      [{ targetId: 'value-1', value }],
    );
  }
});

test('normalized edit question schemas retain their real OAS 3.0 version, nullable semantics and explicit actual dialect', async () => {
  const original = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        sort: { type: 'string', nullable: true, enum: ['NEW', null] },
      },
      required: ['sort'],
    },
    { sort: 'NEW' },
    '정렬을 바꿔줘.',
    '3.0.3',
  );
  const contract = createWorkflowDraftApiInputEditContract({
    ...original,
    proposal: {
      targets: [
        { kind: 'set', pointer: '/body/sort', sources: original.sources },
      ],
    },
  });
  const input = pending({ ...original, contract, selectOasEnums: true });
  const requirements =
    describeWorkflowDraftApiInputEditAnswerRequirements(input);
  assert.equal(requirements[0].openapiVersion, '3.0.3');
  assert.equal(requirements[0].schemaDialect, 'draft-2020-12');
  const context = { reply: '비워줘.', requirements, selectOasEnums: true };
  const analysis = selectEnum(context, null);
  assert.deepEqual(
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
    }).answers,
    [{ targetId: 'value-1', value: null }],
  );
});

test('pending edit questions retain original static references and sibling assertions', async () => {
  const original = await schemaDraftInputEditFixture(
    {
      $defs: {
        sorting: { type: 'string', enum: ['NEW', 'VIEWS', 'PURCHASES'] },
      },
      type: 'object',
      properties: {
        sort: {
          $ref: '#/paths/~1payload/put/requestBody/content/application~1json/schema/$defs/sorting',
          not: { const: 'PURCHASES' },
        },
      },
      required: ['sort'],
    },
    { sort: 'NEW' },
    '정렬을 바꿔줘.',
  );
  const contract = createWorkflowDraftApiInputEditContract({
    ...original,
    proposal: {
      targets: [
        { kind: 'set', pointer: '/body/sort', sources: original.sources },
      ],
    },
  });
  const input = pending({ ...original, contract, selectOasEnums: true });
  const context = {
    reply: '조회수 순으로 해줘.',
    requirements: describeWorkflowDraftApiInputEditAnswerRequirements(input),
    selectOasEnums: true,
  };
  assert.deepEqual(
    describeApiInputEnumAnswerChoices(context)[0].candidates.map(
      (candidate) => candidate.value,
    ),
    ['NEW', 'VIEWS'],
  );
  const analysis = selectEnum(context, 'VIEWS');
  assert.equal(
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
    }).answers[0].value,
    'VIEWS',
  );
});

test('edit reply revalidation rejects altered values, intent, candidate, context, scope and policy without repairing the proposal', async () => {
  const input = pending(await createApiEnumEditFixture());
  const context = {
    reply: '조회수 순으로 해줘.',
    requirements: describeWorkflowDraftApiInputEditAnswerRequirements(input),
    selectOasEnums: true,
  };
  const analysis = selectEnum(context, 'VIEWS');
  for (const mutate of [
    (value) => {
      value.answers[0].value = 'NEW';
    },
    (value) => {
      value.enumSelections[0].candidate.value = 'NEW';
    },
    (value) => {
      value.enumSelections[0].candidateId = 'foreign';
    },
    (value) => {
      value.enumSelections[0].intent.sourceText = '없는 원문';
    },
    (value) => {
      value.unansweredRequirementIds.push('invented');
    },
    (value) => {
      value.extra = true;
    },
  ]) {
    const altered = globalThis.structuredClone(analysis);
    mutate(altered);
    assert.throws(() =>
      resolveWorkflowDraftApiInputEditReply({
        ...input,
        reply: context.reply,
        analysis: altered,
      }),
    );
  }
  assert.throws(() =>
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: '다른 답변',
      analysis,
    }),
  );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
      selectOasEnums: false,
    }),
  );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
      confirmedAnswers: {
        contractId: input.contract.id,
        answers: [{ targetId: 'value-1', value: 'NEW' }],
      },
    }),
  );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
      contract: { ...input.contract, id: 'stale' },
    }),
  );
});

test('empty natural decisions never reuse an old value or OAS default and common analysis replay validates its full envelope', async () => {
  const input = pending(await createApiEnumEditFixture());
  const requirements =
    describeWorkflowDraftApiInputEditAnswerRequirements(input);
  const context = {
    reply: '아직 모르겠어.',
    requirements,
    selectOasEnums: true,
  };
  const analysis = {
    status: 'extracted',
    ...resolveApiInputAnswerInterpretations({ ...context, selections: [] }),
  };
  validateApiInputAnswerAnalysis({ ...context, analysis });
  assert.deepEqual(
    resolveWorkflowDraftApiInputEditReply({
      ...input,
      reply: context.reply,
      analysis,
    }).answers,
    [],
  );
  assert.equal(resolveWorkflowDraftApiInputEdits(input).status, 'needs-input');
});
