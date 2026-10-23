import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowDraft,
  assembleWorkflowDraftEdit,
  describeWorkflowDraftNativeParameterEdit,
  resolveWorkflowDraftNativeParameterEditTargets,
  validateWorkflowDraftNativeParameterEditContract,
  createWorkflowDraftNativeParameterEditProposalSchema,
  createWorkflowDraftNativeParameterEditValuesSchema,
  resolveWorkflowDraftNativeParameterEdits,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
} from '@openapi-flow/core';
import {
  selectWorkflowDraftNativeParameterEditTargets,
  generateWorkflowDraftNativeParameterEdits,
  WorkflowDraftNativeParameterEditPlanningError,
} from '@openapi-flow/langchain';
import {
  createJsonOutputCapability,
  resolveN8nNativeFeatures,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import {
  nativeParameterEditFixture,
  nativeParameterEvidence,
  nativeParameterTargets,
  nativeParameterContract,
  nativeParameterValues,
  nativeParameterModel,
} from './fixtures/workflow-draft-native-parameter-edit-fixture.mjs';

function content(draft) {
  const { revision, approvals, requirementHistory, ...data } = draft;
  assert.ok(Array.isArray(requirementHistory));
  assert.ok(revision >= 0);
  assert.ok(Array.isArray(approvals));
  return data;
}
function replaceTarget(input, capability, parameters, runtime = false) {
  const context = {
    ...input.context,
    capabilities: [...input.context.capabilities, capability],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      ...content(input.draft),
      nativeNodes: [
        {
          id: 'config',
          capability: capability.name,
          parameters,
          ...(runtime === false ? {} : { runtimeParameters: runtime }),
        },
      ],
    },
  });
  const base = { ...input, draft, context };
  const plan = connectionEditPlan(
    base,
    [{ kind: 'revise-native-node', nodeId: 'config' }],
    input.plan.options.includeExplanations,
  );
  return { ...base, plan, stepId: plan.steps[0].id };
}
function resolve(input, targets, entries) {
  const contract = nativeParameterContract(input, targets);
  const values = nativeParameterValues(input, entries);
  const setTargets = contract.targets.filter((target) => target.kind === 'set');
  assert.equal(setTargets.length, entries.length);
  return resolveWorkflowDraftNativeParameterEdits({
    ...input,
    contract,
    output: {
      values: Object.fromEntries(
        setTargets.map((target, index) => [
          target.id,
          values.values[`parameter-${index + 1}`],
        ]),
      ),
    },
  });
}

test('two composable calls generate only selected typed values and preserve API data, siblings, identity and revision', async () => {
  const input = await nativeParameterEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const model = nativeParameterModel([
    nativeParameterTargets(input, [{ kind: 'set', pointer: '/count' }]),
    nativeParameterValues(input, [{ status: 'provided', value: 4 }]),
  ]);
  const selected = await selectWorkflowDraftNativeParameterEditTargets({
    ...input,
    model,
  });
  assert.equal(selected.status, 'ready');
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    model,
    contract: selected.contract,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 2);
  assert.deepEqual(result.resolution.edits, [
    { kind: 'set', pointer: '/count', value: 4 },
  ]);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(assembled.draft.nativeNodes[0].parameters, {
    count: 4,
    enabled: false,
    nested: { value: 'unchanged' },
  });
  assert.deepEqual(assembled.draft.nativeNodes[1], before.nativeNodes[1]);
  assert.deepEqual(assembled.draft.apiCalls, before.apiCalls);
  assert.deepEqual(assembled.draft.edges, before.edges);
  assert.deepEqual(input.draft, before);
  for (const request of model.requests) {
    assert.equal(request.messages[0].constructor.name, 'SystemMessage');
    assert.equal(request.messages[1].constructor.name, 'HumanMessage');
    assert.equal(Object.hasOwn(request.schema, '~standard'), false);
    const payload = JSON.parse(request.messages[1].content);
    for (const key of [
      'stage',
      'fingerprint',
      'planId',
      'stepId',
      'revision',
      'resolutions',
    ])
      assert.equal(Object.hasOwn(payload, key), false);
  }
});

test('native target selection receives staged API identities and declarations before and after their request values are resolved', async () => {
  const original = await nativeParameterEditFixture(
    'Add another declared API and change only the existing config count.',
  );
  const plan = connectionEditPlan(original, [
    { kind: 'add-api-call', operation: original.replacement.key },
    { kind: 'revise-native-node', nodeId: 'config' },
  ]);
  const added = plan.steps[0];
  const edit = plan.steps[1];
  for (const ready of [false, true]) {
    const input = {
      ...original,
      plan,
      stepId: edit.id,
      resolutions: ready
        ? [
            {
              stepId: added.id,
              kind: 'api-call',
              values: { path: { id: 'new-request' } },
              bindings: [],
            },
          ]
        : [],
    };
    const description = describeWorkflowDraftNativeParameterEdit(input);
    const source = description.sourceCandidates.find(
      (source) => source.nodeId === added.newNodeId,
    );
    assert.equal(source.kind, 'api');
    assert.equal(source.operation.path, '/replacement/{id}');
    assert.equal(
      source.preparation.status,
      ready ? 'request-planned' : 'request-pending',
    );
    const model = nativeParameterModel([
      nativeParameterTargets(input, [{ kind: 'set', pointer: '/count' }]),
    ]);
    const selected = await selectWorkflowDraftNativeParameterEditTargets({
      ...input,
      model,
    });
    assert.equal(selected.status, 'ready');
    const payload = JSON.parse(model.requests[0].messages[1].content);
    const actual = payload.sourceCandidates.find(
      (source) => source.nodeId === added.newNodeId,
    );
    assert.equal(actual.operation.path, source.operation.path);
    assert.deepEqual(actual.preparation, source.preparation);
    assert.deepEqual(
      actual.responsePointerCatalog,
      source.responsePointerCatalog,
    );
    assert.equal(Object.hasOwn(actual.operation, 'requestBody'), false);
    assert.equal(Object.hasOwn(payload, 'stage'), false);
  }
});

test('actual types are preserved; strings for numbers, forbidden fields and sparse containers fail without correction', async () => {
  const input = await nativeParameterEditFixture();
  assert.throws(
    () =>
      resolve(
        input,
        [{ kind: 'set', pointer: '/count' }],
        [{ status: 'provided', value: '4' }],
      ),
    /JSON Schema/,
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [{ kind: 'set', pointer: '/unknown' }]),
    /registered schema/,
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [{ kind: 'remove', pointer: '/absent' }]),
    /absent/,
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [
        { kind: 'set', pointer: '/nested' },
        { kind: 'set', pointer: '/nested/value' },
      ]),
    /overlapping/,
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [
        { kind: 'set', pointer: '/bad~2pointer' },
      ]),
    /pointer/i,
  );
  const result = resolve(
    input,
    [{ kind: 'set', pointer: '/enabled' }],
    [{ status: 'provided', value: false }],
  );
  assert.equal(result.resolution.edits[0].value, false);
});

test('removal-only work makes zero value calls and preserves all unselected fields', async () => {
  const input = replaceTarget(
    await nativeParameterEditFixture('Remove only optional label.'),
    createJsonOutputCapability({
      name: 'optional-config',
      description: 'Optional actual setting',
      parametersSchema: z.strictObject({
        count: z.number(),
        label: z.string().optional(),
      }),
    }),
    { count: 0, label: 'old' },
  );
  const contract = nativeParameterContract(input, [
    { kind: 'remove', pointer: '/label' },
  ]);
  const model = nativeParameterModel([]);
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    contract,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 0);
  const noModel = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    contract,
  });
  assert.deepEqual(noModel, result);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0].parameters, { count: 0 });
});

test('explicit field deferral makes zero value calls and retains unrelated literals and native instances', async () => {
  const input = {
    ...(await nativeParameterEditFixture(
      'Supply only config count and nested value at execution; keep enabled and sibling unchanged.',
      true,
    )),
    allowRuntimeParameters: true,
  };
  const original = globalThis.structuredClone(input.draft);
  const contract = nativeParameterContract(input, [
    { kind: 'defer', pointer: '/count' },
    { kind: 'defer', pointer: '/nested/value' },
  ]);
  const schema = createWorkflowDraftNativeParameterEditValuesSchema({
    ...input,
    contract,
  });
  assert.equal(schema.safeParse({ values: {} }).success, true);
  assert.equal(
    schema.safeParse({
      values: { 'parameter-1': { status: 'provided', value: 1 } },
    }).success,
    false,
  );
  const model = nativeParameterModel([]);
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    contract,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 0);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const node = candidate.draft.nativeNodes.find((node) => node.id === 'config');
  assert.deepEqual(node.parameters, { enabled: false, nested: {} });
  assert.deepEqual(node.runtimeParameters, {
    pointers: ['/count', '/nested/value'],
  });
  assert.deepEqual(candidate.draft.nativeNodes[1], original.nativeNodes[1]);
  assert.deepEqual(candidate.draft.apiCalls, original.apiCalls);
  assert.deepEqual(candidate.draft.edges, original.edges);
  assert.deepEqual(input.draft, original);
  const material = {
    nativeNodes: candidate.draft.nativeNodes,
    capabilities: input.context.capabilities,
  };
  const slots = collectNativeRuntimeInputSlots(material);
  assert.equal(slots.length, 2);
  const values = new Map([
    ['/count', 0],
    ['/nested/value', '={{ literal input }}'],
  ]);
  const complete = inspectNativeRuntimeInputs({
    ...material,
    inputValues: Object.fromEntries(
      slots.map((slot) => [slot.id, values.get(slot.targetPointer)]),
    ),
  });
  assert.equal(complete.status, 'ready');
  assert.deepEqual(complete.nativeNodes[0].parameters, {
    enabled: false,
    count: 0,
    nested: { value: '={{ literal input }}' },
  });
});

test('literal edits preserve unselected field owners and set transfers only the selected field to a literal', async () => {
  const capability = createJsonOutputCapability({
    name: 'mixed-config',
    description: 'Explicit mixed configuration',
    parametersSchema: z.strictObject({
      count: z.number(),
      enabled: z.boolean(),
      nested: z.strictObject({ value: z.string() }),
    }),
  });
  const input = replaceTarget(
    await nativeParameterEditFixture(
      'Set only enabled to true and count to 0; nested value stays an execution input.',
    ),
    capability,
    { enabled: false, nested: {} },
    { pointers: ['/count', '/nested/value'] },
  );
  const original = globalThis.structuredClone(input.draft);
  const result = resolve(
    input,
    [
      { kind: 'set', pointer: '/enabled' },
      { kind: 'set', pointer: '/count' },
    ],
    [
      { status: 'provided', value: true },
      { status: 'provided', value: 0 },
    ],
  );
  assert.equal(result.status, 'ready');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0], {
    id: 'config',
    capability: capability.name,
    parameters: { count: 0, enabled: true, nested: {} },
    runtimeParameters: { pointers: ['/nested/value'] },
  });
  assert.deepEqual(input.draft, original);
});

test('an optional runtime-owned field can be removed with no literal and no value-model call', async () => {
  const input = replaceTarget(
    await nativeParameterEditFixture(
      'Remove optional label; keep count unchanged.',
    ),
    createJsonOutputCapability({
      name: 'optional-owned-config',
      description: 'Optional field ownership',
      parametersSchema: z.strictObject({
        count: z.number(),
        label: z.string().optional(),
      }),
    }),
    { count: 0 },
    { pointers: ['/label'] },
  );
  const contract = nativeParameterContract(input, [
    { kind: 'remove', pointer: '/label' },
  ]);
  const model = nativeParameterModel([]);
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    contract,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 0);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0], {
    id: 'config',
    capability: 'optional-owned-config',
    parameters: { count: 0 },
  });
});

test('field deferral is explicit opt-in and schema-derived; unknown fields, roots and overlapping targets fail', async () => {
  let input = await nativeParameterEditFixture(
    'Supply only count at execution.',
  );
  assert.throws(() =>
    nativeParameterContract(input, [{ kind: 'defer', pointer: '/count' }]),
  );
  input = { ...input, allowRuntimeParameters: true };
  assert.throws(
    () =>
      nativeParameterContract(input, [{ kind: 'defer', pointer: '/invented' }]),
    /registered schema/,
  );
  assert.throws(
    () => nativeParameterContract(input, [{ kind: 'defer', pointer: '' }]),
    /field pointer/,
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [
        { kind: 'defer', pointer: '/nested' },
        { kind: 'set', pointer: '/nested/value' },
      ]),
    /overlapping/,
  );
  const contract = nativeParameterContract(input, [
    { kind: 'defer', pointer: '/count' },
  ]);
  assert.throws(
    () =>
      validateWorkflowDraftNativeParameterEditContract({
        ...input,
        contract: {
          ...contract,
          targets: [{ ...contract.targets[0], kind: 'remove' }],
        },
      }),
    /modified|stale/,
  );
});

test('an unknown runtime-owned parent needs an explicit parent value rather than fabricated siblings', async () => {
  const input = replaceTarget(
    await nativeParameterEditFixture('Set nested value to actual.'),
    createJsonOutputCapability({
      name: 'parent-config',
      description: 'Unknown parent',
      parametersSchema: z.strictObject({
        count: z.number(),
        nested: z.strictObject({ value: z.string(), retained: z.boolean() }),
      }),
    }),
    { count: 0 },
    { pointers: ['/nested'] },
  );
  assert.throws(
    () =>
      nativeParameterContract(input, [
        { kind: 'set', pointer: '/nested/value' },
      ]),
    /whole-parent/,
  );
  const result = resolve(
    input,
    [{ kind: 'set', pointer: '/nested' }],
    [{ status: 'provided', value: { value: 'actual', retained: false } }],
  );
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0].parameters, {
    count: 0,
    nested: { value: 'actual', retained: false },
  });
  assert.equal(
    Object.hasOwn(candidate.draft.nativeNodes[0], 'runtimeParameters'),
    false,
  );
});

test('array suffix deferral preserves original positions; sparse deferral and shifted runtime owners are rejected', async () => {
  const capability = createJsonOutputCapability({
    name: 'owned-array',
    description: 'Actual array positions',
    parametersSchema: z.strictObject({
      rows: z.array(z.string()),
      numeric: z.strictObject({ 0: z.string(), 1: z.string() }),
    }),
  });
  const input = {
    ...replaceTarget(
      await nativeParameterEditFixture(
        'Supply rows 1 and 2, and numeric property 0 at execution.',
      ),
      capability,
      {
        rows: ['kept', 'second', 'third'],
        numeric: { 0: 'object-zero', 1: 'object-one' },
      },
    ),
    allowRuntimeParameters: true,
  };
  assert.throws(
    () => resolve(input, [{ kind: 'defer', pointer: '/rows/1' }], []),
    /sparse literal array/,
  );
  const result = resolve(
    input,
    [
      { kind: 'defer', pointer: '/rows/1' },
      { kind: 'defer', pointer: '/numeric/0' },
      { kind: 'defer', pointer: '/rows/2' },
    ],
    [],
  );
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0].parameters, {
    rows: ['kept'],
    numeric: { 1: 'object-one' },
  });
  const base = { ...input, draft: candidate.draft };
  const plan = connectionEditPlan(base, [
    { kind: 'revise-native-node', nodeId: 'config' },
  ]);
  const next = { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
  assert.throws(
    () => resolve(next, [{ kind: 'remove', pointer: '/rows/0' }], []),
    /shift a runtime-owned array index/,
  );
  assert.throws(
    () => resolve(next, [{ kind: 'remove', pointer: '/rows/1' }], []),
    /shift a runtime-owned array index/,
  );
  const values = new Map([
    ['/rows/1', 'actual-second'],
    ['/rows/2', 'actual-third'],
    ['/numeric/0', 'actual-zero'],
  ]);
  const material = {
    nativeNodes: candidate.draft.nativeNodes,
    capabilities: input.context.capabilities,
  };
  const slots = collectNativeRuntimeInputSlots(material);
  const completed = inspectNativeRuntimeInputs({
    ...material,
    inputValues: Object.fromEntries(
      slots.map((slot) => [slot.id, values.get(slot.targetPointer)]),
    ),
  });
  assert.equal(completed.status, 'ready');
  assert.deepEqual(completed.nativeNodes[0].parameters, {
    rows: ['kept', 'actual-second', 'actual-third'],
    numeric: { 0: 'actual-zero', 1: 'object-one' },
  });
});

test('original-index array edits share deterministic ordering with API edits and preserve null, numeric and dotted keys', async () => {
  const input = replaceTarget(
    await nativeParameterEditFixture(),
    createJsonOutputCapability({
      name: 'array-config',
      description: 'Exact configuration data',
      parametersSchema: z.strictObject({
        rows: z.array(z.string()),
        nullable: z.null(),
        0: z.string(),
        'a.b': z.boolean(),
      }),
    }),
    { rows: ['a', 'b', 'c', 'd'], nullable: null, 0: 'zero', 'a.b': false },
  );
  const result = resolve(
    input,
    [
      { kind: 'remove', pointer: '/rows/1' },
      { kind: 'set', pointer: '/rows/2' },
      { kind: 'remove', pointer: '/rows/0' },
    ],
    [{ status: 'provided', value: 'changed' }],
  );
  // parameter IDs refer to target positions, not only set positions.
  assert.equal(result.status, 'ready');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0].parameters, {
    rows: ['changed', 'd'],
    nullable: null,
    0: 'zero',
    'a.b': false,
  });
});

test('unclear target and missing value yield scoped questions, no partial result or invented parameters', async () => {
  const input = await nativeParameterEditFixture(
    'Change the unclear setting.',
    true,
  );
  const evidence = nativeParameterEvidence(input);
  const proposed = {
    decision: {
      status: 'needs-clarification',
      message: 'Which config setting should change?',
      ...evidence,
    },
  };
  const result = resolveWorkflowDraftNativeParameterEditTargets({
    ...input,
    fingerprint: describeWorkflowDraftNativeParameterEdit(input).fingerprint,
    proposal: proposed,
  });
  assert.equal(result.status, 'needs-clarification');
  assert.equal(Object.hasOwn(result, 'contract'), false);
  assert.match(result.questions[0].id, /^native-parameter-question:/);
  const pending = resolve(
    input,
    [
      { kind: 'set', pointer: '/count' },
      { kind: 'set', pointer: '/enabled' },
    ],
    [
      { status: 'provided', value: 4 },
      { status: 'needs-input', message: 'Should enabled be true or false?' },
    ],
  );
  assert.equal(pending.status, 'needs-input');
  assert.equal(Object.hasOwn(pending, 'resolution'), false);
  assert.equal(pending.questions[0].pointer, '/enabled');
  assert.ok(pending.questions[0].explanation);
});

test('runtime ownership requires opt-in and implementation support; reverting requires actual whole-object values', async () => {
  let input = await nativeParameterEditFixture(
    'Supply config settings at execution.',
  );
  let description = describeWorkflowDraftNativeParameterEdit(input);
  const proposal = {
    decision: {
      status: 'runtime-parameters',
      ...nativeParameterEvidence(input),
    },
  };
  assert.equal(
    createWorkflowDraftNativeParameterEditProposalSchema(description).safeParse(
      proposal,
    ).success,
    false,
  );
  input = { ...input, allowRuntimeParameters: true };
  description = describeWorkflowDraftNativeParameterEdit(input);
  const result = resolveWorkflowDraftNativeParameterEditTargets({
    ...input,
    fingerprint: description.fingerprint,
    proposal,
  });
  assert.equal(result.status, 'runtime-parameters');
  const deferred = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.equal(deferred.draft.nativeNodes[0].runtimeParameters, true);
  assert.deepEqual(deferred.draft.nativeNodes[0].parameters, {});
  const base = { ...input, draft: deferred.draft };
  const plan = connectionEditPlan(base, [
    { kind: 'revise-native-node', nodeId: 'config' },
  ]);
  const next = { ...base, plan, stepId: plan.steps[0].id };
  assert.throws(
    () => nativeParameterContract(next, [{ kind: 'set', pointer: '/count' }]),
    /whole-object/,
  );
  const configured = resolve(
    next,
    [{ kind: 'set', pointer: '' }],
    [
      {
        status: 'provided',
        value: { count: 7, enabled: false, nested: { value: 'actual' } },
      },
    ],
  );
  const restored = assembleWorkflowDraftEdit({
    ...next,
    resolutions: [configured.resolution],
  });
  assert.equal(
    Object.hasOwn(restored.draft.nativeNodes[0], 'runtimeParameters'),
    false,
  );
});

test('full original Zod refinements are still authoritative and defaults/transforms cannot alter the data', async () => {
  const bounded = createJsonOutputCapability({
    name: 'bounded-config',
    description: 'Ordered bounds',
    parametersSchema: z
      .strictObject({ low: z.number(), high: z.number() })
      .refine((value) => value.low <= value.high, 'low must not exceed high'),
  });
  let input = replaceTarget(await nativeParameterEditFixture(), bounded, {
    low: 0,
    high: 3,
  });
  assert.throws(
    () =>
      resolve(
        input,
        [{ kind: 'set', pointer: '/low' }],
        [{ status: 'provided', value: 4 }],
      ),
    /low must not exceed high/,
  );
  const withDefault = createJsonOutputCapability({
    name: 'default-config',
    description: 'Original schema with an explicit default',
    parametersSchema: z.strictObject({ count: z.number().default(3) }),
  });
  input = replaceTarget(await nativeParameterEditFixture(), withDefault, {
    count: 0,
  });
  assert.throws(
    () => resolve(input, [{ kind: 'remove', pointer: '/count' }], []),
    /defaults, coercion or transformation/,
  );
});

async function comparisonFixture(includeExplanations = false) {
  const input = await nativeParameterEditFixture(
    'Run the true branch when source value is different, not equal.',
    includeExplanations,
  );
  const [capability] = resolveN8nNativeFeatures({
    features: [N8nNativeFeature.If],
  }).capabilities;
  const context = {
    ...input.context,
    capabilities: [...input.context.capabilities, capability],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      ...content(input.draft),
      nativeNodes: [
        {
          id: 'config',
          capability: capability.name,
          parameters: {
            combinator: 'and',
            conditions: [
              {
                left: {
                  source: 'response',
                  nodeId: 'source',
                  pointer: '/value',
                },
                operator: 'equals',
                right: { source: 'literal', value: 'expected' },
              },
            ],
          },
        },
      ],
      edges: [
        ...input.draft.edges,
        { from: 'source', output: 'main', to: 'config', input: 'main' },
      ],
    },
  });
  const base = { ...input, draft, context };
  const plan = connectionEditPlan(
    base,
    [{ kind: 'revise-native-node', nodeId: 'config' }],
    includeExplanations,
  );
  return { ...base, plan, stepId: plan.steps[0].id };
}

test('semantic native configuration can choose a declared enum without requiring the enum text verbatim', async () => {
  const input = await comparisonFixture();
  const result = resolve(
    input,
    [{ kind: 'set', pointer: '/conditions/0/operator' }],
    [{ status: 'provided', value: 'notEquals' }],
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.resolution.edits[0].value, 'notEquals');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(
    candidate.draft.nativeNodes[0].parameters.conditions[0].left,
    input.draft.nativeNodes[0].parameters.conditions[0].left,
  );
});

test('native response source IDs are specialized to available instances and pointers must exist in actual OAS', async () => {
  const input = await comparisonFixture();
  const contract = nativeParameterContract(input, [
    { kind: 'set', pointer: '/conditions/0/left/nodeId' },
  ]);
  const schema = createWorkflowDraftNativeParameterEditValuesSchema({
    ...input,
    contract,
  });
  assert.equal(
    schema.safeParse(
      nativeParameterValues(input, [{ status: 'provided', value: 'invented' }]),
    ).success,
    false,
  );
  assert.throws(
    () =>
      resolve(
        input,
        [{ kind: 'set', pointer: '/conditions/0/left/pointer' }],
        [{ status: 'provided', value: '/not-declared' }],
      ),
    /no declared response value/,
  );
  const unsupported = { ...input, allowRuntimeParameters: true };
  assert.equal(
    createWorkflowDraftNativeParameterEditProposalSchema(
      describeWorkflowDraftNativeParameterEdit(unsupported),
    ).safeParse(
      nativeParameterTargets(unsupported, [
        { kind: 'defer', pointer: '/combinator' },
      ]),
    ).success,
    false,
  );
  assert.equal(
    createWorkflowDraftNativeParameterEditProposalSchema(
      describeWorkflowDraftNativeParameterEdit(unsupported),
    ).safeParse({
      decision: {
        status: 'runtime-parameters',
        ...nativeParameterEvidence(input),
      },
    }).success,
    false,
  );
});

test('contracts are re-derived; altered schemas/target identities and concurrent source changes are rejected with original output', async () => {
  const input = await nativeParameterEditFixture();
  const contract = nativeParameterContract(input, [
    { kind: 'set', pointer: '/count' },
  ]);
  for (const altered of [
    { ...contract, nodeId: 'sibling' },
    { ...contract, schemaResource: true },
    { ...contract, targets: [{ ...contract.targets[0], schema: true }] },
  ])
    assert.throws(
      () =>
        validateWorkflowDraftNativeParameterEditContract({
          ...input,
          contract: altered,
        }),
      /modified|stale/,
    );
  const model = nativeParameterModel(
    [nativeParameterValues(input, [{ status: 'provided', value: 4 }])],
    () => {
      input.context.messages[1].text += ' New request during call.';
    },
  );
  await assert.rejects(
    generateWorkflowDraftNativeParameterEdits({ ...input, contract, model }),
    (error) => {
      assert.ok(error instanceof WorkflowDraftNativeParameterEditPlanningError);
      assert.equal(error.failure.stage, 'values');
      assert.ok(error.failure.output);
      assert.match(error.cause.message, /stale|fingerprint/);
      return true;
    },
  );
  assert.equal(model.requests.length, 1);
});

test('unknown/completed scopes, malformed settings and historical-only evidence fail at the boundary', async () => {
  const input = await nativeParameterEditFixture();
  assert.throws(
    () =>
      describeWorkflowDraftNativeParameterEdit({ ...input, stepId: 'unknown' }),
    /revise-native/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftNativeParameterEdit({
        ...input,
        allowRuntimeParameters: 'true',
      }),
    /boolean/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftNativeParameterEdit({
        ...input,
        resolutions: [
          {
            stepId: input.stepId,
            kind: 'native-parameters',
            edits: [{ kind: 'set', pointer: '/count', value: 4 }],
          },
        ],
      }),
    /already/,
  );
  const proposal = nativeParameterTargets(input, [
    { kind: 'set', pointer: '/count' },
  ]);
  proposal.decision.targets[0].sources = [
    {
      kind: 'message',
      messageId: 'initial',
      quote: input.context.messages[0].text,
    },
  ];
  assert.throws(() =>
    resolveWorkflowDraftNativeParameterEditTargets({
      ...input,
      fingerprint: describeWorkflowDraftNativeParameterEdit(input).fingerprint,
      proposal,
    }),
  );
});

test('recursive registered schemas retain local references without banning valid finite parameter values', async () => {
  const tree = z.lazy(() =>
    z.strictObject({ value: z.string(), child: tree.optional() }),
  );
  const input = replaceTarget(
    await nativeParameterEditFixture(),
    createJsonOutputCapability({
      name: 'recursive-config',
      description: 'Finite nested configuration',
      parametersSchema: tree,
    }),
    { value: 'root', child: { value: 'old' } },
  );
  const result = resolve(
    input,
    [{ kind: 'set', pointer: '/child/value' }],
    [{ status: 'provided', value: 'changed' }],
  );
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.nativeNodes[0].parameters, {
    value: 'root',
    child: { value: 'changed' },
  });
});

test('native port-count changes require a separate explicit connection delta, not automatic port substitution', async () => {
  const input = await nativeParameterEditFixture(
    'Reduce the join to two inputs; remove only its third incoming connection.',
  );
  const [capability] = resolveN8nNativeFeatures({
    features: [N8nNativeFeature.MergeAppend],
  }).capabilities;
  const context = {
    ...input.context,
    capabilities: [...input.context.capabilities, capability],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      ...content(input.draft),
      nativeNodes: [
        {
          id: 'config',
          capability: capability.name,
          parameters: { numberInputs: 3 },
        },
      ],
      edges: [
        ...input.draft.edges,
        ...['follow', 'independent', 'source'].map((from, index) => ({
          from,
          output: 'main',
          to: 'config',
          input: `input${index + 1}`,
        })),
      ],
    },
  });
  const base = { ...input, draft, context };
  const plan = connectionEditPlan(base, [
    { kind: 'revise-native-node', nodeId: 'config' },
  ]);
  const next = { ...base, plan, stepId: plan.steps[0].id };
  const result = resolve(
    next,
    [{ kind: 'set', pointer: '/numberInputs' }],
    [{ status: 'provided', value: 2 }],
  );
  assert.equal(result.status, 'ready');
  const staged = { ...next, resolutions: [result.resolution] };
  assert.throws(() => assembleWorkflowDraftEdit(staged), /unknown port/);
  const description = describeWorkflowDraftConnectionEdit(staged);
  assert.equal(description.status, 'ready');
  const obsolete = description.existingEdges.find(
    (edge) => edge.edge.input === 'input3',
  );
  const connection = resolveWorkflowDraftConnectionEdit({
    ...staged,
    fingerprint: description.fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'remove',
          edgeId: obsolete.id,
          ...nativeParameterEvidence(next),
        },
      ],
    },
  });
  assert.equal(connection.status, 'ready');
  assert.deepEqual(connection.candidate.draft.apiCalls, draft.apiCalls);
  assert.equal(connection.candidate.draft.edges.length, draft.edges.length - 1);
});
