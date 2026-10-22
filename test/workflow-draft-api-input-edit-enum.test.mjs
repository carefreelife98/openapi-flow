import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  describeWorkflowDraftApiInputEditEnumChoices,
  createWorkflowDraftApiInputEditValuesSchema,
  createWorkflowDraftApiInputEditAnswersSchema,
  resolveWorkflowDraftApiInputEdits,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiInputEdits,
  WorkflowDraftApiInputEditPlanningError,
} from '@openapi-flow/langchain';
import { nativeParameterModel } from './fixtures/workflow-draft-native-parameter-edit-fixture.mjs';
import {
  createApiEnumEditFixture as fixture,
  enumEditSelection as choice,
  pendingEnumEditValue as pending,
  enumEditIntent as intent,
} from './fixtures/workflow-draft-api-enum-edit-fixture.mjs';

for (const includeExplanations of [false, true])
  test(`an existing call changes only its selected enum field and retains semantic provenance, explanations=${includeExplanations}`, async () => {
    const input = await fixture({ includeExplanations });
    const before = globalThis.structuredClone(input.draft);
    const output = { values: { 'value-1': choice(input, 'VIEWS') } };
    const result = resolveWorkflowDraftApiInputEdits({ ...input, output });
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.resolution.edits, [
      { kind: 'set', pointer: '/body/sort', value: 'VIEWS' },
    ]);
    assert.deepEqual(result.values, output);
    assert.equal(result.enumSelections[0].value, 'VIEWS');
    assert.equal(result.enumSelections[0].messageId, 'edit-1');
    assert(result.enumSelections[0].schemaPointer.endsWith('/enum/1'));
    assert.deepEqual(result.enumSelections[0].occurrences, [
      { offset: 0, length: input.context.messages[0].text.length },
    ]);
    const assembled = assembleWorkflowDraftEdit({
      ...input,
      resolutions: [result.resolution],
    });
    assert.deepEqual(assembled.draft.apiCalls[0].values.body, {
      sort: 'VIEWS',
      note: 'previous',
      untouched: 'kept',
    });
    assert.deepEqual(assembled.draft.edges, before.edges);
    assert.deepEqual(input.draft, before);
  });

test('enum-selected and pending literal targets remain atomic, survive typed answers, and cannot exchange value ownership', async () => {
  const input = await fixture({ pointers: ['/body/sort', '/body/note'] });
  const output = {
    values: { 'value-1': choice(input, 'VIEWS'), 'value-2': pending(input) },
  };
  const waiting = resolveWorkflowDraftApiInputEdits({ ...input, output });
  assert.equal(waiting.status, 'needs-input');
  assert.equal(Object.hasOwn(waiting, 'resolution'), false);
  assert.deepEqual(
    waiting.pendingTargets.map((target) => target.pointer),
    ['/body/note'],
  );
  assert.equal(waiting.enumSelections[0].value, 'VIEWS');
  assert.equal(input.draft.apiCalls[0].values.body.sort, 'NEW');
  const answers = createWorkflowDraftApiInputEditAnswersSchema({
    ...input,
    output,
  });
  assert.equal(
    answers.safeParse({
      contractId: input.contract.id,
      answers: [{ targetId: 'value-1', value: 'PURCHASES' }],
    }).success,
    false,
  );
  const ready = resolveWorkflowDraftApiInputEdits({
    ...input,
    output,
    confirmedAnswers: {
      contractId: input.contract.id,
      answers: [{ targetId: 'value-2', value: '0007' }],
    },
  });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.values, output);
  assert.deepEqual(ready.enumSelections, waiting.enumSelections);
  assert.deepEqual(ready.resolution.edits, [
    { kind: 'set', pointer: '/body/note', value: '0007' },
    { kind: 'set', pointer: '/body/sort', value: 'VIEWS' },
  ]);
});

test('enum selection preserves numbers, null, Boolean, strings, arrays and objects instead of generating or coercing values', async () => {
  for (const value of [0, false, null, '0', ['a', 1], { enabled: false }]) {
    const input = await fixture({
      schema: { enum: ['previous', value] },
      oldValue: 'previous',
    });
    const result = resolveWorkflowDraftApiInputEdits({
      ...input,
      output: { values: { 'value-1': choice(input, value) } },
    });
    assert.deepEqual(result.resolution.edits[0].value, value);
    assert.deepEqual(result.enumSelections[0].value, value);
  }
});

test('wrong-field/foreign IDs, fabricated values/sources/reasons and opt-in changes fail without repair', async () => {
  const input = await fixture({ pointers: ['/body/sort', '/body/note'] });
  const selected = choice(input, 'VIEWS');
  const output = { values: { 'value-1': selected, 'value-2': pending(input) } };
  for (const selection of [
    { ...selected.selection, candidateId: 'foreign' },
    { ...selected.selection, messageId: 'absent' },
    { ...selected.selection, sourceText: 'invented human source' },
    { ...selected.selection, reason: ' ' },
    { ...selected.selection, value: 'PURCHASES' },
  ])
    assert.throws(() =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        output: {
          values: {
            ...output.values,
            'value-1': { status: 'oas-enum', selection },
          },
        },
      }),
    );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEdits({
      ...input,
      output: { values: { ...output.values, 'value-2': selected } },
    }),
  );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEdits({
      ...input,
      selectOasEnums: false,
      output,
    }),
  );
  assert.throws(
    () =>
      createWorkflowDraftApiInputEditValuesSchema({
        ...input,
        selectOasEnums: 'true',
      }),
    /selectOasEnums.*boolean/,
  );
  const literal = {
    status: 'provided',
    value: 'VIEWS',
    source: { messageId: 'edit-1', sourceFormat: 'text', sourceText: intent },
  };
  assert.throws(
    () =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        output: { values: { ...output.values, 'value-1': literal } },
      }),
    /source|same|match|literal/i,
  );
});

test('reference-backed enums retain original sibling assertions; defaults and non-enum fields cannot acquire an enum branch', async () => {
  const input = await fixture({
    schema: {
      $defs: { order: { type: 'integer', enum: [0, 1, 2] } },
      allOf: [
        {
          $ref: '#/paths/~1payload/put/requestBody/content/application~1json/schema/properties/sort/$defs/order',
        },
      ],
      minimum: 1,
    },
    oldValue: 1,
  });
  const choices = describeWorkflowDraftApiInputEditEnumChoices(input);
  assert.deepEqual(
    choices.candidates.map((candidate) => candidate.value).sort(),
    [1, 2],
  );
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    output: { values: { 'value-1': choice(input, 2) } },
  });
  assert.equal(result.resolution.edits[0].value, 2);
  const defaults = await fixture({
    schema: { type: 'string', default: 'VIEWS', example: 'VIEWS' },
  });
  assert.deepEqual(
    describeWorkflowDraftApiInputEditEnumChoices(defaults).candidates,
    [],
  );
  const schema = z.toJSONSchema(
    createWorkflowDraftApiInputEditValuesSchema(defaults),
  );
  assert(!JSON.stringify(schema).includes('oas-enum'));
});

test('the existing value-generation call selects enum IDs directly, with no extra model stage or hidden retry', async () => {
  const input = await fixture();
  const output = { values: { 'value-1': choice(input, 'VIEWS') } };
  const model = nativeParameterModel([output]);
  const result = await generateWorkflowDraftApiInputEdits({ ...input, model });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 1);
  assert.equal(
    model.requests[0].options.name,
    'generate_draft_api_input_edit_values',
  );
  const payload = JSON.parse(model.requests[0].messages[1].content);
  assert(
    payload.enumChoices.candidates.some(
      (candidate) => candidate.value === 'VIEWS',
    ),
  );
  const failed = nativeParameterModel([
    {
      values: {
        'value-1': {
          status: 'oas-enum',
          selection: {
            ...output.values['value-1'].selection,
            candidateId: 'wrong',
          },
        },
      },
    },
  ]);
  await assert.rejects(
    generateWorkflowDraftApiInputEdits({ ...input, model: failed }),
    (error) =>
      error instanceof WorkflowDraftApiInputEditPlanningError &&
      error.failure.stage === 'values',
  );
  assert.equal(failed.requests.length, 1);
});
