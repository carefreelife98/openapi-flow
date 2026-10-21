import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  assembleWorkflowDraftEdit,
  createWorkflowDraftApiInputEditContract,
  createWorkflowDraftApiInputEditValuesSchema,
  createWorkflowDraftEditPlan,
  resolveWorkflowDraftApiInputEdits,
  inspectDraftReadiness,
  validateWorkflowDraftApiInputEditContract,
  describeWorkflowDraftApiInputEdit,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiInputEdits,
  selectWorkflowDraftApiInputEditTargets,
  WorkflowDraftApiInputEditPlanningError,
} from '@openapi-flow/langchain';
import {
  assemblyBodyValue,
  workflowDraftEditAssemblyFixture,
} from './fixtures/workflow-draft-edit-assembly-fixture.mjs';
import { schemaDraftInputEditFixture } from './fixtures/workflow-draft-api-input-edit-fixture.mjs';

async function fixture(
  text = 'Set count to 4, enabled to true, nullable to null, and name to "changed".',
  includeExplanations = false,
) {
  const input = await workflowDraftEditAssemblyFixture(text);
  const sources = [{ kind: 'message', messageId: 'edit-1', quote: text }];
  const explanation = {
    reason: 'The current request explicitly changes this input.',
    evidence: sources,
  };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'source',
          instruction: text,
          sources,
          ...(includeExplanations ? { explanation } : {}),
        },
      ],
    },
  });
  return { ...input, plan, stepId: plan.steps[0].id, sources, explanation };
}
function target(input, pointer, kind = 'set') {
  return {
    kind,
    pointer,
    sources: input.sources,
    ...(input.plan.options.includeExplanations
      ? { explanation: input.explanation }
      : {}),
  };
}
function contract(input, targets) {
  return createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: { targets },
  });
}
function provided(
  input,
  value,
  sourceText = JSON.stringify(value),
  sourceFormat = 'json',
) {
  return {
    status: 'provided',
    value,
    source: { messageId: 'edit-1', sourceText, sourceFormat },
    ...(input.plan.options.includeExplanations
      ? { explanation: input.explanation }
      : {}),
  };
}
function modelScript(outputs, onCall) {
  let calls = 0;
  const requests = [];
  return {
    requests,
    get calls() {
      return calls;
    },
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          requests.push({ schema, options, messages });
          const output = outputs[calls++];
          await onCall?.(calls);
          return modelMessageEvidenceSelections(output);
        },
      };
    },
  };
}

async function replacementInputEditFixture() {
  const text =
    'Replace independent with the replacement API and set its id to "0011".';
  const input = await workflowDraftEditAssemblyFixture(text);
  const sources = [{ kind: 'message', messageId: 'edit-1', quote: text }];
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'independent',
          operation: input.replacement.key,
          instruction: text,
          sources,
        },
        {
          kind: 'revise-api-inputs',
          nodeId: 'independent',
          instruction: text,
          sources,
        },
      ],
    },
  });
  return {
    ...input,
    plan,
    stepId: plan.steps[1].id,
    sources,
    resolutions: [
      { kind: 'api-call', stepId: plan.steps[0].id, values: {}, bindings: [] },
    ],
  };
}

test('an input edit reads the resolved replacement contract in the same atomic plan', async () => {
  const input = await replacementInputEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const described = describeWorkflowDraftApiInputEdit(input);
  assert.deepEqual(described.call.operation, input.replacement.key);
  assert.deepEqual(described.call.values, {});
  const model = modelScript([
    { targets: [target(input, '/path/id')] },
    { values: { 'value-1': provided(input, '0011') } },
  ]);
  const selected = await selectWorkflowDraftApiInputEditTargets({
    ...input,
    model,
  });
  const result = await generateWorkflowDraftApiInputEdits({
    ...input,
    contract: selected,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.calls, 2);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [...input.resolutions, result.resolution],
  });
  const changed = assembled.draft.apiCalls.find(
    (call) => call.id === 'independent',
  );
  assert.deepEqual(changed.operation, input.replacement.key);
  assert.deepEqual(changed.values, { path: { id: '0011' } });
  assert.deepEqual(input.draft, before);
  assert.throws(
    () => contract(input, [target(input, '/query/locale')]),
    /not permitted by its OAS/,
  );
});

test('replacement input contracts reject missing materials, changed staged values and already supplied results', async () => {
  const input = await replacementInputEditFixture();
  assert.throws(
    () => describeWorkflowDraftApiInputEdit({ ...input, resolutions: [] }),
    /blocked.*unresolved/i,
  );
  const selected = contract(input, [target(input, '/path/id')]);
  assert.throws(
    () =>
      validateWorkflowDraftApiInputEditContract({
        ...input,
        resolutions: [
          { ...input.resolutions[0], values: { path: { id: 'different' } } },
        ],
        contract: selected,
      }),
    /stale|modified/i,
  );
  assert.throws(
    () =>
      describeWorkflowDraftApiInputEdit({
        ...input,
        resolutions: [
          ...input.resolutions,
          { kind: 'api-inputs', stepId: input.stepId, edits: [] },
        ],
      }),
    /already.*result/i,
  );
});

test('bounded target selection then OAS-typed values preserve every unpatched value and use distinct Message classes', async () => {
  const input = await fixture();
  const before = globalThis.structuredClone(input.draft);
  const targets = [
    '/body/config/count',
    '/body/config/enabled',
    '/body/nullable',
    '/body/name',
  ].map((pointer) => target(input, pointer));
  const model = modelScript([
    { targets },
    {
      values: {
        'value-1': provided(input, 4),
        'value-2': provided(input, true),
        'value-3': provided(input, null),
        'value-4': provided(input, 'changed'),
      },
    },
  ]);
  const selected = await selectWorkflowDraftApiInputEditTargets({
    ...input,
    model,
  });
  const result = await generateWorkflowDraftApiInputEdits({
    ...input,
    contract: selected,
    model,
  });
  assert.equal(model.calls, 2);
  assert.equal(result.status, 'ready');
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.equal(assembled.status, 'changed');
  assert.deepEqual(assembled.draft.apiCalls[0].values.body, {
    ...assemblyBodyValue,
    config: { ...assemblyBodyValue.config, count: 4, enabled: true },
    nullable: null,
    name: 'changed',
  });
  assert.deepEqual(assembled.draft.apiCalls.slice(1), before.apiCalls.slice(1));
  assert.deepEqual(input.draft, before);
  for (const request of model.requests) {
    assert.equal(Object.hasOwn(request.schema, '~standard'), false);
    assert.equal(request.messages[0].constructor.name, 'SystemMessage');
    assert.equal(request.messages[1].constructor.name, 'HumanMessage');
  }
  const valuesInput = JSON.parse(model.requests[1].messages[1].content);
  assert.equal(Object.hasOwn(valuesInput, 'call'), false);
  assert.equal(Object.hasOwn(valuesInput, 'requestSchema'), false);
  assert.equal(Object.hasOwn(valuesInput, 'revision'), false);
  assert.equal(
    Object.hasOwn(
      model.requests[0].schema.properties.targets.items.properties,
      'value',
    ),
    false,
  );
});

test('removals need zero value calls and remove original array indices in descending order', async () => {
  const input = await fixture('Remove the first and second lines.');
  const selected = contract(input, [
    target(input, '/body/lines/0', 'remove'),
    target(input, '/body/lines/1', 'remove'),
  ]);
  const model = modelScript([]);
  const result = await generateWorkflowDraftApiInputEdits({
    ...input,
    contract: selected,
    model,
  });
  assert.equal(model.calls, 0);
  assert.equal(result.status, 'ready');
  assert.deepEqual(
    result.resolution.edits.map((edit) => edit.pointer),
    ['/body/lines/1', '/body/lines/0'],
  );
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(assembled.draft.apiCalls[0].values.body.lines, []);
});

test('missing actual values are a visible needs-input result, never old-value reuse or partial transaction', async () => {
  const input = await fixture('Change the count later and name to "changed".');
  const selected = contract(input, [
    target(input, '/body/config/count'),
    target(input, '/body/name'),
  ]);
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract: selected,
    output: {
      values: {
        'value-1': { status: 'needs-input' },
        'value-2': provided(input, 'changed'),
      },
    },
  });
  assert.equal(result.status, 'needs-input');
  assert.equal(Object.hasOwn(result, 'resolution'), false);
  assert.deepEqual(
    result.pendingTargets.map((target) => target.pointer),
    ['/body/config/count'],
  );
  assert.equal(input.draft.apiCalls[0].values.body.name, 'existing');
  assert.equal(input.draft.apiCalls[0].values.body.config.count, 0);
});

test('required value removal is explicit and derives an original OAS input slot', () =>
  fixture('Remove the name and fill it in n8n later.').then((input) => {
    const selected = contract(input, [target(input, '/body/name', 'remove')]);
    const result = resolveWorkflowDraftApiInputEdits({
      ...input,
      contract: selected,
      output: { values: {} },
    });
    const assembled = assembleWorkflowDraftEdit({
      ...input,
      resolutions: [result.resolution],
    });
    assert.equal(assembled.draft.apiCalls[0].values.body.name, undefined);
    assert.equal(assembled.draft.apiCalls[0].values.body.config.count, 0);
    assert.equal(
      inspectDraftReadiness({ draft: assembled.draft, context: input.context })
        .slots.length,
      1,
    );
  }));

test('target validation rejects unknown OAS fields, malformed paths, overlap, absent removal and fabricated source evidence', async () => {
  const input = await fixture();
  for (const targets of [
    [target(input, '/body/unknown')],
    [target(input, 'body/name')],
    [target(input, '/body/~2')],
    [target(input, '/body/name'), target(input, '/body/name')],
    [target(input, '/body'), target(input, '/body/name')],
    [target(input, '/query/absent', 'remove')],
    [
      {
        ...target(input, '/body/name'),
        sources: [
          {
            kind: 'message',
            messageId: 'initial',
            quote: input.context.messages[0].text,
          },
        ],
      },
    ],
    [
      {
        ...target(input, '/body/name'),
        sources: [
          {
            kind: 'message',
            messageId: 'edit-1',
            quote: 'Fabricated user text',
          },
        ],
      },
    ],
    [{ ...target(input, '/body/name'), value: 'injected' }],
  ])
    assert.throws(() => contract(input, targets));
  const otherPlan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'follow',
          instruction: input.context.messages[1].text,
          sources: input.sources,
        },
      ],
    },
  });
  assert.throws(
    () =>
      contract({ ...input, plan: otherPlan, stepId: otherPlan.steps[0].id }, [
        target(input, '/path/id'),
      ]),
    /binding ownership/,
  );
});

test('typed values reject coercion, unrelated fields, copied defaults and fabricated complete JSON sources', async () => {
  const input = await fixture('Change count to 4.');
  const selected = contract(input, [target(input, '/body/config/count')]);
  const schema = createWorkflowDraftApiInputEditValuesSchema({
    ...input,
    contract: selected,
  });
  assert.equal(
    schema.safeParse({ values: { 'value-1': provided(input, '4') } }).success,
    false,
  );
  for (const output of [
    { values: {} },
    {
      values: { 'value-1': provided(input, 4), 'value-2': provided(input, 4) },
    },
    { values: { 'value-1': provided(input, 4, 'missing') } },
    { values: { 'value-1': provided(input, 4, '4', 'text') } },
    { values: { 'value-1': provided(input, 5, '4') } },
    { values: { 'value-1': provided(input, 4, 'Change') } },
    { values: { 'value-1': { ...provided(input, 4), pointer: '/body/name' } } },
  ])
    assert.throws(() =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        contract: selected,
        output,
      }),
    );
  assert.equal(input.draft.apiCalls[0].values.body.config.count, 0);
});

test('contract metadata, field IDs and schemas are always re-derived and cannot be forged or reused after input changes', async () => {
  const input = await fixture('Change count to 4.');
  const selected = contract(input, [target(input, '/body/config/count')]);
  for (const modify of [
    (value) => {
      value.id = 'forged';
    },
    (value) => {
      value.stepId = 'other';
    },
    (value) => {
      value.targets[0].id = 'other';
    },
    (value) => {
      value.targets[0].schema = true;
    },
    (value) => {
      value.targets[0].injected = true;
    },
    (value) => {
      value.targets[0] = null;
    },
    (value) => {
      delete value.targets[0].schema;
    },
    (value) => {
      value.schemaResource = true;
    },
  ]) {
    const changed = globalThis.structuredClone(selected);
    modify(changed);
    assert.throws(() =>
      validateWorkflowDraftApiInputEditContract({
        ...input,
        contract: changed,
      }),
    );
  }
  input.context.messages[1].text += ' Changed during planning.';
  assert.throws(
    () =>
      validateWorkflowDraftApiInputEditContract({
        ...input,
        contract: selected,
      }),
    /stale/,
  );
});

test('optional explanations are absent from disabled schemas and required, source-checked data when enabled', async () => {
  for (const enabled of [false, true]) {
    const input = await fixture('Change count to 4.', enabled);
    const selected = contract(input, [target(input, '/body/config/count')]);
    const schema = createWorkflowDraftApiInputEditValuesSchema({
      ...input,
      contract: selected,
    });
    const wire = z.toJSONSchema(schema, {
      target: 'draft-7',
      reused: 'inline',
      cycles: 'throw',
    });
    const fields =
      wire.properties.values.properties['value-1'].anyOf[0].properties;
    assert.equal(Object.hasOwn(fields, 'explanation'), enabled);
    const answer = provided(input, 4);
    assert.equal(
      schema.safeParse({ values: { 'value-1': answer } }).success,
      true,
    );
    if (enabled) {
      delete answer.explanation;
      assert.equal(
        schema.safeParse({ values: { 'value-1': answer } }).success,
        false,
      );
    }
  }
});

test('errors retain stage and invalid output without a hidden model retry or original-draft mutation', async () => {
  const input = await fixture('Change count to 4.');
  const before = globalThis.structuredClone(input.draft);
  const invalid = { targets: [target(input, '/body/unknown')] };
  const model = modelScript([invalid]);
  await assert.rejects(
    selectWorkflowDraftApiInputEditTargets({ ...input, model }),
    (error) => {
      assert.ok(error instanceof WorkflowDraftApiInputEditPlanningError);
      assert.equal(error.failure.stage, 'targets');
      assert.deepEqual(
        error.failure.output,
        modelMessageEvidenceSelections(invalid),
      );
      return true;
    },
  );
  assert.equal(model.calls, 1);
  const selected = contract(input, [target(input, '/body/config/count')]);
  const staleModel = modelScript(
    [{ values: { 'value-1': provided(input, 4) } }],
    () => {
      input.draft.apiCalls[0].values.body.config.count = 7;
    },
  );
  await assert.rejects(
    generateWorkflowDraftApiInputEdits({
      ...input,
      contract: selected,
      model: staleModel,
    }),
    /stale|changed/,
  );
  assert.equal(staleModel.calls, 1);
  assert.equal(before.apiCalls[0].values.body.config.count, 0);
});

test('OAS 3.0 nullable/exclusive bounds remain typed and dynamic OAS property names are not an arbitrary field whitelist', async () => {
  const legacy = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        label: { type: 'string', nullable: true },
        amount: { type: 'number', minimum: 0, exclusiveMinimum: true },
      },
      required: ['label'],
      additionalProperties: false,
    },
    { label: 'old' },
    'Set label to null and amount to 1. Do not use 0.',
    '3.0.3',
  );
  const selected = contract(legacy, [
    target(legacy, '/body/label'),
    target(legacy, '/body/amount'),
  ]);
  const output = {
    values: {
      'value-1': provided(legacy, null),
      'value-2': provided(legacy, 1),
    },
  };
  assert.equal(
    resolveWorkflowDraftApiInputEdits({ ...legacy, contract: selected, output })
      .status,
    'ready',
  );
  assert.throws(() =>
    resolveWorkflowDraftApiInputEdits({
      ...legacy,
      contract: selected,
      output: { values: { ...output.values, 'value-2': provided(legacy, 0) } },
    }),
  );
  const dynamic = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        attributes: {
          type: 'object',
          additionalProperties: { type: 'integer', minimum: 0 },
        },
      },
      additionalProperties: false,
    },
    { attributes: {} },
    'Set attributes key "new/key~" to 0.',
  );
  const dynamicContract = contract(dynamic, [
    target(dynamic, '/body/attributes/new~1key~0'),
  ]);
  const result = resolveWorkflowDraftApiInputEdits({
    ...dynamic,
    contract: dynamicContract,
    output: { values: { 'value-1': provided(dynamic, 0) } },
  });
  const assembled = assembleWorkflowDraftEdit({
    ...dynamic,
    resolutions: [result.resolution],
  });
  assert.deepEqual(assembled.draft.apiCalls[0].values.body, {
    attributes: { 'new/key~': 0 },
  });
});

test('tuple projections retain Draft 2020-12 assertions and full-object constraints are checked after all edits', async () => {
  const input = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        tuple: {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'integer', minimum: 1 }],
          items: false,
          minItems: 2,
        },
        mode: { type: 'string' },
        unit: { type: 'string' },
      },
      required: ['tuple', 'mode'],
      dependentRequired: { mode: ['unit'] },
      additionalProperties: false,
    },
    { tuple: ['kept', 2], mode: 'fixed', unit: 'box' },
    'Set tuple to ["new", 3] and remove unit.',
  );
  const selected = contract(input, [target(input, '/body/tuple')]);
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract: selected,
    output: {
      values: { 'value-1': provided(input, ['new', 3], '["new", 3]') },
    },
  });
  assert.equal(result.status, 'ready');
  assert.throws(() => contract(input, [target(input, '/body/tuple/2')]));
  const broken = contract(input, [
    target(input, '/body/tuple'),
    target(input, '/body/unit', 'remove'),
  ]);
  assert.throws(
    () =>
      resolveWorkflowDraftApiInputEdits({
        ...input,
        contract: broken,
        output: {
          values: { 'value-1': provided(input, ['new', 3], '["new", 3]') },
        },
      }),
    /unit|dependent/,
  );
  assert.equal(input.draft.apiCalls[0].values.body.unit, 'box');
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
