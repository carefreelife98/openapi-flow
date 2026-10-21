import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiSelectionContext,
  createApiSelectionExplanation,
  validateApiSelectionExplanation,
  resolveApiSelectionAnswers,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  analyzeApiSelection,
} from '@openapi-flow/langchain';
import {
  apiSelectionExplanationsFixture,
  apiSelectionExplanationModel,
} from './fixtures/api-selection-explanations-fixture.mjs';

const reason = { reason: '요청한 간단 조회 기능과 후보의 설명이 일치합니다.' };
const selectedProposal = () => ({
  operations: [
    {
      candidateId: 'candidate-1',
      purpose: '회원 간단 조회',
      explanation: reason,
    },
  ],
  gaps: [],
});

test('selection gets reasons in the same call; code owns exact scenario and chosen discovery snapshot', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const model = apiSelectionExplanationModel(selectedProposal());
  const result = await selectApiOperations({
    ...context,
    model,
    includeExplanations: true,
  });
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].options.name, 'select_api_operations');
  assert.equal(model.calls[0].options.method, 'jsonSchema');
  assert.equal(model.calls[0].options.strict, true);
  const chosen = result.operations[0];
  assert.deepEqual(chosen.key, context.operations[0].key);
  assert.deepEqual(chosen.explanation, {
    ...reason,
    evidence: [
      { kind: 'scenario', text: context.scenario },
      { kind: 'discovery', candidates: [context.operations[0]] },
    ],
  });
  validateApiSelectionExplanation({
    context,
    basis: { kind: 'candidates', operations: [chosen.key] },
    explanation: chosen.explanation,
  });
  const wireInput = JSON.stringify(model.calls[0].payload);
  for (const absent of ['contractOnlyField', 'responses', 'parameters'])
    assert.equal(wireInput.includes(absent), false);
  assert.deepEqual(model.calls[0].payload.candidates[0].key, chosen.key);
});

test('same API used for two roles keeps both independently explained instances', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const result = await selectApiOperations({
    ...context,
    scenario: '같은 회원 정보를 변경 전과 변경 후 각각 조회해줘.',
    includeExplanations: true,
    model: apiSelectionExplanationModel({
      operations: ['변경 전 조회', '변경 후 조회'].map((purpose) => ({
        candidateId: 'candidate-1',
        purpose,
        explanation: { reason: purpose },
      })),
      gaps: [],
    }),
  });
  assert.equal(result.operations.length, 2);
  assert.deepEqual(result.operations[0].key, result.operations[1].key);
  assert.notEqual(
    result.operations[0].explanation.reason,
    result.operations[1].explanation.reason,
  );
});

test('a missing-capability reason is grounded in the entire supplied discovery inventory, not a full-contract claim', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const result = await selectApiOperations({
    ...context,
    scenario: '환불 API를 호출해줘.',
    includeExplanations: true,
    model: apiSelectionExplanationModel({
      operations: [],
      gaps: [
        {
          description: '환불 기능을 제공하는 후보가 필요합니다.',
          explanation: { reason: '제공된 후보는 조회 기능만 설명합니다.' },
        },
      ],
    }),
  });
  const gap = result.gaps[0];
  assert.equal(gap.kind, 'missing_operation');
  assert.deepEqual(gap.explanation.evidence[1], {
    kind: 'discovery',
    candidates: context.operations,
  });
});

test('ambiguity explains the actual offered alternatives and exact multi-document identities', async () => {
  const { catalog, context } = await apiSelectionExplanationsFixture();
  const model = apiSelectionExplanationModel({
    operations: [],
    gaps: [],
    questions: [
      {
        kind: 'single-choice',
        message: '간단 정보와 상세 정보 중 어떤 결과가 필요한가요?',
        purpose: '회원 정보 조회',
        candidateIds: ['candidate-2', 'candidate-1'],
        explanation: { reason: '조회 범위를 구분할 정보가 필요합니다.' },
      },
    ],
  });
  const analysis = await analyzeApiSelection({
    ...context,
    scenario: '회원 정보를 조회해줘.',
    model,
    includeExplanations: true,
  });
  const question = analysis.questions[0];
  assert.equal(model.calls.length, 1);
  assert.deepEqual(question.explanation.evidence[1].candidates, [
    context.operations[1],
    context.operations[0],
  ]);
  assert.equal(question.candidates[0].path, question.candidates[1].path);
  assert.notEqual(
    question.candidates[0].key.documentId,
    question.candidates[1].key.documentId,
  );
  const resolved = await resolveApiSelectionAnswers({
    catalog,
    analysis,
    answers: [
      { questionId: question.id, operation: question.candidates[0].key },
    ],
  });
  assert.deepEqual(
    resolved.selection.operations[0].key,
    question.candidates[0].key,
  );
  // A reason to ask about ambiguity is not a model justification of a human choice.
  assert.equal(
    Object.hasOwn(resolved.selection.operations[0], 'explanation'),
    false,
  );
  assert.ok(analysis.questions[0].explanation);
});

test('analysis preserves reasons on definite operations and missing capabilities too', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const proposal = {
    ...selectedProposal(),
    gaps: [
      {
        description: '환불 기능 없음',
        explanation: { reason: '조회만 제공됨' },
      },
    ],
    questions: [],
  };
  const result = await analyzeApiSelection({
    ...context,
    model: apiSelectionExplanationModel(proposal),
    includeExplanations: true,
  });
  assert.equal(
    result.selection.operations[0].explanation.reason,
    reason.reason,
  );
  assert.equal(result.selection.gaps[0].explanation.reason, '조회만 제공됨');
});

test('disabled or omitted explanations leave both model output schemas and return values unchanged', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  for (const enabled of [undefined, false]) {
    const model = apiSelectionExplanationModel({
      operations: [{ candidateId: 'candidate-1', purpose: '조회' }],
      gaps: [],
    });
    const result = await selectApiOperations({
      ...context,
      model,
      includeExplanations: enabled,
    });
    assert.deepEqual(result, {
      operations: [{ key: context.operations[0].key, purpose: '조회' }],
      gaps: [],
    });
    const { schema } = model.calls[0];
    assert.equal(schema.safeParse(selectedProposal()).success, false);
  }
});

test('enabled reasons are required, cannot be blank/null, and cannot contain model-generated evidence', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  for (const invalid of [
    undefined,
    null,
    {},
    { reason: '' },
    { reason: '  ' },
    {
      ...reason,
      evidence: [{ kind: 'scenario', text: 'fabricated' }],
    },
  ]) {
    const proposal = selectedProposal();
    if (invalid === undefined) delete proposal.operations[0].explanation;
    else proposal.operations[0].explanation = invalid;
    const model = apiSelectionExplanationModel(proposal);
    await assert.rejects(
      selectApiOperations({ ...context, model, includeExplanations: true }),
      /model API selection is invalid/,
    );
    assert.equal(model.calls.length, 1);
  }
});

test('question and gap explanations are also required when enabled', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  for (const proposal of [
    { operations: [], gaps: [{ description: 'missing' }], questions: [] },
    {
      operations: [],
      gaps: [],
      questions: [
        {
          kind: 'single-choice',
          message: 'Which?',
          purpose: 'Read',
          candidateIds: ['candidate-1', 'candidate-2'],
        },
      ],
    },
  ])
    await assert.rejects(
      analyzeApiSelection({
        ...context,
        model: apiSelectionExplanationModel(proposal),
        includeExplanations: true,
      }),
      /model API selection analysis is invalid/,
    );
});

test('invalid feature options and missing/mismatched/duplicate candidate identities fail before a model call', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const mismatched = globalThis.structuredClone(context.operations);
  mismatched[0].operationRef = '#/different';
  const missing = globalThis.structuredClone(context.operations);
  delete missing[0].key.snapshotId;
  for (const input of [
    { ...context, includeExplanations: 'true' },
    { ...context, operations: mismatched },
    { ...context, operations: missing },
    { ...context, operations: [context.operations[0], context.operations[0]] },
  ]) {
    const model = apiSelectionExplanationModel(selectedProposal());
    await assert.rejects(selectApiOperations({ ...input, model }));
    assert.equal(model.calls.length, 0);
  }
});

test('no candidates has no model call or invented model explanation, even when enabled', async () => {
  const model = apiSelectionExplanationModel(selectedProposal());
  for (const run of [selectApiOperations, analyzeApiSelection]) {
    const result = await run({
      operations: [],
      scenario: '환불 API가 필요합니다.',
      model,
      includeExplanations: true,
    });
    const selection = result.selection ?? result;
    assert.equal(selection.gaps[0].kind, 'missing_operation');
    assert.equal(Object.hasOwn(selection.gaps[0], 'explanation'), false);
  }
  assert.equal(model.calls.length, 0);
});

test('source snapshots do not change when callers mutate candidates during or after invocation', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const original = globalThis.structuredClone(context);
  const model = apiSelectionExplanationModel(selectedProposal(), () => {
    context.operations[0].summary = 'mutated while awaiting the model';
    context.operations[0].key.snapshotId = 'changed';
  });
  const result = await selectApiOperations({
    ...context,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.operations[0].key, original.operations[0].key);
  assert.deepEqual(result.operations[0].explanation.evidence[1].candidates, [
    original.operations[0],
  ]);
  result.operations[0].key.snapshotId = 'output changed';
  assert.equal(
    result.operations[0].explanation.evidence[1].candidates[0].key.snapshotId,
    original.operations[0].key.snapshotId,
  );
});

test('core checks full discovery metadata and scenario provenance, not just operation membership', async () => {
  const { context } = await apiSelectionExplanationsFixture();
  const basis = { kind: 'candidates', operations: [context.operations[0].key] };
  const explanation = createApiSelectionExplanation({
    context,
    basis,
    reason: reason.reason,
  });
  for (const change of [
    (copy) => {
      copy.evidence[0].text = 'fabricated scenario';
    },
    (copy) => {
      copy.evidence[1].candidates[0].summary = 'fabricated metadata';
    },
    (copy) => {
      copy.evidence[1].candidates[0].key.snapshotId = 'stale';
    },
    (copy) => {
      copy.evidence[1].candidates = [context.operations[1]];
    },
    (copy) => {
      copy.evidence[1].candidates.push(context.operations[1]);
    },
    (copy) => {
      copy.evidence.reverse();
    },
  ]) {
    const copy = globalThis.structuredClone(explanation);
    change(copy);
    assert.throws(
      () =>
        validateApiSelectionExplanation({ context, basis, explanation: copy }),
      /evidence differs/,
    );
  }
  const snapshot = describeApiSelectionContext(context);
  snapshot.operations[0].summary = 'independent copy';
  assert.notEqual(
    snapshot.operations[0].summary,
    context.operations[0].summary,
  );
  assert.throws(
    () =>
      createApiSelectionExplanation({
        context,
        reason: 'why',
        basis: {
          kind: 'candidates',
          operations: [basis.operations[0], basis.operations[0]],
        },
      }),
    /repeats/,
  );
  assert.throws(
    () =>
      createApiSelectionExplanation({
        context,
        reason: 'why',
        basis: {
          kind: 'candidates',
          operations: [{ ...basis.operations[0], snapshotId: 'stale' }],
        },
      }),
    /unavailable candidate/,
  );
});
