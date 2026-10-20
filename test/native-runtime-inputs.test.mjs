import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { z } from 'zod';
import {
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
  createWorkflowRuntimeInputsSchema,
  createWorkflowDraft,
  inspectDraftReadiness,
  createNativeOutputContracts,
  parseNativeNodeParameters,
} from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  createJsonOutputCapability,
  createN8nNativeCapabilities,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  planNativeNodes,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  nativeRuntimeInputFixture,
  runtimeNativeValue,
  runtimeNativeSchema,
} from './fixtures/native-runtime-input-fixture.mjs';

const execute = (
  node,
  input,
  lookup = () => {
    throw new Error('Unexpected source lookup');
  },
) =>
  vm.runInNewContext(`(function(){${node.parameters.jsCode}\n})()`, {
    $input: { all: () => input },
    $: lookup,
  });
const json = (value) => JSON.parse(JSON.stringify(value));
const material = (fixture) => ({
  nativeNodes: fixture.draft.nativeNodes,
  capabilities: fixture.context.capabilities,
});

test('explicit field slots preserve literals and merge typed nested values before full-schema preflight and native guards', () => {
  const capability = createJsonOutputCapability({
    name: 'mixed-inputs',
    description: 'Typed mixed inputs',
    parametersSchema: z.strictObject({
      id: z.string(),
      enabled: z.boolean(),
      count: z.number().int().min(0),
      nested: z.strictObject({ kept: z.string(), message: z.string() }),
      list: z.array(z.number().nullable()),
    }),
  });
  const node = {
    id: 'mixed',
    capability: capability.name,
    parameters: { id: 'kept', enabled: false, nested: { kept: 'original' } },
    runtimeParameters: { pointers: ['/count', '/nested/message', '/list'] },
  };
  const input = { nativeNodes: [node], capabilities: [capability] };
  const original = json(node);
  const slots = collectNativeRuntimeInputSlots(input);
  assert.equal(slots.length, 3);
  const reversed = collectNativeRuntimeInputSlots({
    ...input,
    nativeNodes: [
      {
        ...node,
        runtimeParameters: {
          pointers: [...node.runtimeParameters.pointers].reverse(),
        },
      },
    ],
  });
  assert.deepEqual(
    Object.fromEntries(slots.map((slot) => [slot.targetPointer, slot.id])),
    Object.fromEntries(reversed.map((slot) => [slot.targetPointer, slot.id])),
  );
  const supplied = new Map([
    ['/count', 0],
    ['/nested/message', '={{ still data }}'],
    ['/list', [0, null]],
  ]);
  const inputValues = Object.fromEntries(
    slots.map((slot) => [slot.id, supplied.get(slot.targetPointer)]),
  );
  assert.equal(
    createWorkflowRuntimeInputsSchema(slots).safeParse(inputValues).success,
    true,
  );
  const checked = inspectNativeRuntimeInputs({ ...input, inputValues });
  assert.equal(checked.status, 'ready');
  const expected = {
    id: 'kept',
    enabled: false,
    count: 0,
    nested: { kept: 'original', message: '={{ still data }}' },
    list: [0, null],
  };
  assert.deepEqual(checked.nativeNodes[0].parameters, expected);
  assert.deepEqual(node, original);
  const context = { operations: [], capabilities: [capability], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'mixed-template',
      apiCalls: [],
      nativeNodes: [node],
      requirements: [],
      edges: [],
    },
  });
  const template = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Mixed template',
    inputValues,
  });
  assert.equal(template.runtimeInputsReady, true);
  const payload = { revision: 0, values: inputValues };
  assert.deepEqual(
    json(
      execute(
        template.workflow.nodes.find((n) => n.name === '입력 사전 검사'),
        [{ json: payload }],
      ),
    )[0].json,
    payload,
  );
  const guarded = execute(
    template.workflow.nodes.find((n) => n.name === 'Parameters mixed'),
    [{ json: {} }],
    () => ({ all: () => [{ json: payload }] }),
  );
  assert.deepEqual(json(guarded)[0].json, expected);
  assert.equal(
    inspectNativeRuntimeInputs({ ...input, inputValues: {} }).status,
    'needs-input',
  );
  const countSlot = slots.find((slot) => slot.targetPointer === '/count');
  assert.equal(
    inspectNativeRuntimeInputs({
      ...input,
      inputValues: { ...inputValues, [countSlot.id]: '0' },
    }).status,
    'invalid-input',
  );
  for (const pointers of [
    ['/id'],
    ['/count', '/count'],
    ['/nested', '/nested/message'],
    ['/absent'],
    [''],
  ]) {
    assert.throws(() =>
      collectNativeRuntimeInputSlots({
        ...input,
        nativeNodes: [{ ...node, runtimeParameters: { pointers } }],
      }),
    );
  }
});

test('field projections never replace full native union validation', () => {
  const capability = createJsonOutputCapability({
    name: 'mixed-union',
    description: 'Original correlated contract',
    parametersSchema: z.union([
      z.strictObject({ kind: z.literal('one'), count: z.literal(1) }),
      z.strictObject({ kind: z.literal('two'), count: z.literal(2) }),
    ]),
  });
  const node = {
    id: 'correlated',
    capability: capability.name,
    parameters: { kind: 'one' },
    runtimeParameters: { pointers: ['/count'] },
  };
  const input = { nativeNodes: [node], capabilities: [capability] };
  const [slot] = collectNativeRuntimeInputSlots(input);
  assert.equal(
    createWorkflowRuntimeInputsSchema([slot]).safeParse({ [slot.id]: 2 })
      .success,
    true,
  );
  assert.equal(
    inspectNativeRuntimeInputs({ ...input, inputValues: { [slot.id]: 2 } })
      .status,
    'invalid-input',
  );
  assert.equal(
    inspectNativeRuntimeInputs({ ...input, inputValues: { [slot.id]: 1 } })
      .status,
    'ready',
  );
  const context = { operations: [], capabilities: [capability], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'correlated-native',
      nativeNodes: [node],
      apiCalls: [],
      requirements: [],
      edges: [],
    },
  });
  const template = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Original full correlation',
  });
  assert.throws(
    () =>
      execute(
        template.workflow.nodes.find((n) => n.name === '입력 사전 검사'),
        [{ json: { revision: 0, values: { [slot.id]: 2 } } }],
      ),
    /complete original schema/,
  );
});

test('partial native slot references preserve shared original schema resources', () => {
  const shared = z
    .strictObject({ kept: z.string(), value: z.number() })
    .meta({ id: 'partial-shared-resource' });
  const capability = createJsonOutputCapability({
    name: 'shared-fields',
    description: 'Original shared field contracts',
    parametersSchema: z.strictObject({ first: shared, second: shared }),
  });
  const node = {
    id: 'shared-fields',
    capability: capability.name,
    parameters: { first: { kept: 'first' }, second: { kept: 'second' } },
    runtimeParameters: { pointers: ['/first/value', '/second/value'] },
  };
  const input = { nativeNodes: [node], capabilities: [capability] };
  const slots = collectNativeRuntimeInputSlots(input);
  const values = Object.fromEntries(
    slots.map((slot, index) => [slot.id, index]),
  );
  assert.equal(
    createWorkflowRuntimeInputsSchema(slots).safeParse(values).success,
    true,
  );
  const resolved = inspectNativeRuntimeInputs({
    ...input,
    inputValues: values,
  });
  assert.equal(resolved.status, 'ready');
  assert.deepEqual(resolved.nativeNodes[0].parameters, {
    first: { kept: 'first', value: 0 },
    second: { kept: 'second', value: 1 },
  });
  const context = { operations: [], capabilities: [capability], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'shared-native',
      nativeNodes: [node],
      apiCalls: [],
      requirements: [],
      edges: [],
    },
  });
  const template = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Shared native fields',
    inputValues: values,
  });
  const result = execute(
    template.workflow.nodes.find((n) => n.name === '입력 사전 검사'),
    [{ json: { revision: 0, values } }],
  );
  assert.deepEqual(json(result)[0].json.values, values);
});

test('partial native inputs create schema-owned arrays without numeric-key guessing or sparse filling', () => {
  const capability = createJsonOutputCapability({
    name: 'mixed-arrays',
    description: 'Actual container types',
    parametersSchema: z.strictObject({
      entries: z.array(z.string()).length(2),
      numericKeys: z.strictObject({ 0: z.string() }),
    }),
  });
  const node = {
    id: 'containers',
    capability: capability.name,
    parameters: {},
    runtimeParameters: {
      pointers: ['/entries/1', '/numericKeys/0', '/entries/0'],
    },
  };
  const input = { nativeNodes: [node], capabilities: [capability] };
  const values = {
    '/entries/1': 'second',
    '/entries/0': 'first',
    '/numericKeys/0': 'object-key',
  };
  const slots = collectNativeRuntimeInputSlots(input);
  const checked = inspectNativeRuntimeInputs({
    ...input,
    inputValues: Object.fromEntries(
      slots.map((slot) => [slot.id, values[slot.targetPointer]]),
    ),
  });
  assert.equal(checked.status, 'ready');
  assert.deepEqual(checked.nativeNodes[0].parameters, {
    entries: ['first', 'second'],
    numericKeys: { 0: 'object-key' },
  });
  const prefix = {
    ...node,
    parameters: { entries: ['first'], numericKeys: { 0: 'object-key' } },
    runtimeParameters: { pointers: ['/entries/1'] },
  };
  const [prefixSlot] = collectNativeRuntimeInputSlots({
    ...input,
    nativeNodes: [prefix],
  });
  const completed = inspectNativeRuntimeInputs({
    ...input,
    nativeNodes: [prefix],
    inputValues: { [prefixSlot.id]: 'second' },
  });
  assert.equal(completed.status, 'ready');
  assert.deepEqual(
    completed.nativeNodes[0].parameters,
    checked.nativeNodes[0].parameters,
  );
});

test('native slots are explicit whole-parameter contracts with code-owned node/schema identities and no fake values', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const before = json(fixture.draft);
  const slots = collectNativeRuntimeInputSlots(material(fixture));
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, 'native-parameters-input');
  assert.equal(slots[0].nodeId, 'context');
  assert.equal(slots[0].targetPointer, '');
  assert.equal(Object.hasOwn(slots[0], 'value'), false);
  assert.deepEqual(slots, collectNativeRuntimeInputSlots(material(fixture)));
  const repeated = {
    ...material(fixture),
    nativeNodes: [
      fixture.draft.nativeNodes[0],
      { ...fixture.draft.nativeNodes[0], id: 'context-2' },
    ],
  };
  assert.notEqual(
    ...collectNativeRuntimeInputSlots(repeated).map((slot) => slot.id),
  );
  assert.deepEqual(fixture.draft, before);
  assert.deepEqual(slots[0].schema, z.toJSONSchema(runtimeNativeSchema));
  assert.equal(
    createWorkflowRuntimeInputsSchema(slots).safeParse({
      [slots[0].id]: runtimeNativeValue,
    }).success,
    true,
  );
});

test('runtime ownership cannot hide literal conflicts, unknown capabilities or structural parameter choices', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const base = fixture.draft.nativeNodes[0];
  for (const [node, pattern] of [
    [{ ...base, runtimeParameters: undefined }, /Invalid input/],
    [{ ...base, runtimeParameters: false }, /runtime-independent/],
    [
      { ...base, parameters: { id: 'invented' } },
      /must not also contain literal/,
    ],
    [{ ...base, capability: 'unknown' }, /unknown capability/],
    [{ ...base, capability: 'merge-append' }, /runtime-independent/],
  ])
    assert.throws(
      () =>
        collectNativeRuntimeInputSlots({
          ...material(fixture),
          nativeNodes: [node],
        }),
      pattern,
    );
  assert.throws(
    () =>
      parseNativeNodeParameters(
        base,
        fixture.context.capabilities.find(
          (capability) => capability.name === base.capability,
        ),
      ),
    /explicit input materialization/,
  );
  assert.throws(
    () =>
      collectNativeRuntimeInputSlots({
        ...material(fixture),
        nativeNodes: [base, base],
      }),
    /distinct non-empty/,
  );
});

test('actual typed native input materializes unchanged and preserves false, zero, null, arrays and expression-looking text', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const input = material(fixture);
  const [slot] = collectNativeRuntimeInputSlots(input);
  assert.equal(
    inspectNativeRuntimeInputs({ ...input, inputValues: {} }).status,
    'needs-input',
  );
  const values = { [slot.id]: runtimeNativeValue };
  const resolved = inspectNativeRuntimeInputs({
    ...input,
    inputValues: values,
  });
  assert.equal(resolved.status, 'ready');
  assert.deepEqual(resolved.nativeNodes[0].parameters, runtimeNativeValue);
  assert.equal(
    Object.hasOwn(resolved.nativeNodes[0], 'runtimeParameters'),
    false,
  );
  assert.equal(fixture.draft.nativeNodes[0].runtimeParameters, true);
  assert.deepEqual(values, { [slot.id]: runtimeNativeValue });
  assert.deepEqual(
    createNativeOutputContracts({
      ...input,
      nativeNodes: resolved.nativeNodes,
    }),
    createNativeOutputContracts(input),
  );
});

test('wrong, unknown and stale values fail without coercion, defaults, trimming or schema substitution', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const input = material(fixture);
  const [slot] = collectNativeRuntimeInputSlots(input);
  for (const value of [
    null,
    [],
    {},
    'text',
    { ...runtimeNativeValue, count: '0' },
    { ...runtimeNativeValue, id: '' },
    { ...runtimeNativeValue, additional: 'not permitted' },
  ])
    assert.equal(
      inspectNativeRuntimeInputs({
        ...input,
        inputValues: { [slot.id]: value },
      }).status,
      'invalid-input',
    );
  assert.equal(
    inspectNativeRuntimeInputs({
      ...input,
      inputValues: { unknown: runtimeNativeValue },
    }).status,
    'invalid-input',
  );
  const changed = {
    ...input,
    nativeNodes: [{ ...input.nativeNodes[0], id: 'changed' }],
  };
  assert.equal(
    inspectNativeRuntimeInputs({
      ...changed,
      inputValues: { [slot.id]: runtimeNativeValue },
    }).status,
    'invalid-input',
  );
  const schema = z.strictObject({ enabled: z.boolean().default(true) });
  const capability = createJsonOutputCapability({
    name: 'defaults',
    description: 'Original explicit contract',
    parametersSchema: schema,
  });
  const defaultInput = {
    nativeNodes: [
      {
        id: 'defaults',
        capability: capability.name,
        parameters: {},
        runtimeParameters: true,
      },
    ],
    capabilities: [capability],
  };
  const [defaultSlot] = collectNativeRuntimeInputSlots(defaultInput);
  assert.equal(
    inspectNativeRuntimeInputs({
      ...defaultInput,
      inputValues: { [defaultSlot.id]: {} },
    }).status,
    'invalid-input',
  );
});

test('executable custom refinements and transforms cannot silently disappear from runtime parameter validation', () => {
  for (const schema of [
    z.strictObject({ id: z.string().refine((value) => value === 'only-this') }),
    z.strictObject({ id: z.string().transform((value) => value.trim()) }),
    z.strictObject({ id: z.string().trim() }),
  ]) {
    const capability = createJsonOutputCapability({
      name: 'custom-check',
      description: 'Not serializable as unchanged JSON Schema',
      parametersSchema: schema,
    });
    assert.throws(
      () =>
        collectNativeRuntimeInputSlots({
          nativeNodes: [
            {
              id: 'custom',
              capability: capability.name,
              parameters: {},
              runtimeParameters: true,
            },
          ],
          capabilities: [capability],
        }),
      /serialize|transforms|Transform|transform/,
    );
  }
});

test('canonical readiness separates structure, API values and native runtime values without blocking an independent design', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const readiness = inspectDraftReadiness(fixture);
  assert.equal(readiness.designReady, true);
  assert.equal(readiness.requestInputsReady, true);
  assert.equal(readiness.nativeInputsReady, false);
  assert.equal(readiness.runtimeInputsReady, false);
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'health').runtimeInputStatus,
    'ready',
  );
  for (const id of ['context', 'echo', 'join'])
    assert.equal(
      readiness.nodes.find((node) => node.nodeId === id).runtimeInputStatus,
      'needs-input',
    );
});

test('template exports native slots, unchanged SDK nodes and code-owned guard mappings without pretending inputs are supplied', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const result = compileN8nWorkflowTemplate(fixture);
  assert.equal(result.triggerConnected, true);
  assert.equal(result.requestInputsReady, true);
  assert.equal(result.nativeInputsReady, false);
  assert.equal(result.runtimeInputsReady, false);
  assert.equal(result.inputSlots.length, 1);
  assert.equal(result.inputSlots[0].kind, 'native-parameters-input');
  assert.equal(result.inputSlots[0].materializerNodeName, 'Parameters context');
  assert.ok(
    result.workflow.nodes.some(
      (node) => node.name === 'context' && node.type === 'n8n-nodes-base.set',
    ),
  );
  assert.match(result.guide, /native context 전체 파라미터/);
  const [slot] = result.inputSlots;
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        inputValues: { [slot.id]: { ...runtimeNativeValue, count: '0' } },
      }),
    /original parameter schema/,
  );
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        ...fixture,
        inputValues: { stale: runtimeNativeValue },
      }),
    /undeclared or stale/,
  );
  const supplied = compileN8nWorkflowTemplate({
    ...fixture,
    inputValues: { [slot.id]: runtimeNativeValue },
  });
  assert.equal(supplied.runtimeInputsReady, true);
  assert.deepEqual(fixture.draft.nativeNodes[0].parameters, {});
  assert.throws(
    () =>
      compileReviewableN8nWorkflow({
        id: 'strict',
        name: 'No runtime source',
        plan: {
          nativeNodes: [fixture.draft.nativeNodes[0]],
          edges: [],
          starts: ['context'],
          gaps: [],
          blockedCalls: [],
        },
        materials: [],
        apiNodes: [],
        capabilities: fixture.context.capabilities,
      }),
    /nativeInputs.revision is required/,
  );
});

test('global preflight and per-native guards reject missing, malformed and stale inputs without changing valid data', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const template = compileN8nWorkflowTemplate(fixture);
  const [slot] = template.inputSlots;
  const preflight = template.workflow.nodes.find(
    (node) => node.name === '입력 사전 검사',
  );
  const guard = template.workflow.nodes.find(
    (node) => node.name === 'Parameters context',
  );
  const payload = { revision: 0, values: { [slot.id]: runtimeNativeValue } };
  const items = [{ json: payload }];
  assert.deepEqual(json(execute(preflight, items))[0].json, payload);
  const lookup = (name) => {
    assert.equal(name, '입력 사전 검사');
    return { all: () => items };
  };
  assert.deepEqual(
    json(execute(guard, [{ json: {} }, { json: {} }], lookup)).map(
      (item) => item.json,
    ),
    [runtimeNativeValue, runtimeNativeValue],
  );
  assert.throws(
    () => execute(preflight, [{ json: { revision: 0, values: {} } }]),
    /declared slots/,
  );
  assert.throws(
    () =>
      execute(guard, [{ json: {} }], () => ({
        all: () => [{ json: { ...payload, revision: 1 } }],
      })),
    /stale native input revision/,
  );
  assert.throws(
    () =>
      execute(guard, [{ json: {} }], () => ({
        all: () => [
          {
            json: {
              revision: 0,
              values: { [slot.id]: { ...runtimeNativeValue, count: '0' } },
            },
          },
        ],
      })),
    /violates original schema/,
  );
});

test('runtime StopAndError uses the same typed input boundary and never invents a message', () => {
  const context = {
    operations: [],
    capabilities: createN8nNativeCapabilities(),
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'runtime-stop',
      requirements: [],
      apiCalls: [],
      nativeNodes: [
        {
          id: 'stop',
          capability: 'stop-and-error',
          parameters: {},
          runtimeParameters: true,
        },
      ],
      edges: [],
    },
  });
  const pending = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Runtime stop',
  });
  const [slot] = pending.inputSlots;
  assert.equal(pending.nativeInputsReady, false);
  assert.deepEqual(slot.schema.properties.message, {
    type: 'string',
    minLength: 1,
    description:
      'StopAndError message when this branch executes. Input: main; no output.',
  });
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        draft,
        context,
        name: 'Runtime stop',
        inputValues: { [slot.id]: { message: '' } },
      }),
    /original parameter schema/,
  );
  assert.equal(
    compileN8nWorkflowTemplate({
      draft,
      context,
      name: 'Runtime stop',
      inputValues: { [slot.id]: { message: '={{ literal error text }}' } },
    }).runtimeInputsReady,
    true,
  );
});

test('runtime planning is opt-in, model output contains no slot IDs/schemas and structural capabilities never gain a runtime branch', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const node = fixture.draft.nativeNodes[0];
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      calls.push(options.name);
      const variants = schema.properties.nativeNodes.items.anyOf;
      assert.equal(
        variants.some(
          (variant) =>
            variant.properties.parameterSource?.const === 'workflow-input' &&
            variant.properties.capability.const === 'merge-append',
        ),
        false,
      );
      assert.equal(JSON.stringify(schema).includes('native-input:'), false);
      return {
        async invoke(messages) {
          const materials = JSON.parse(messages[1].content).capabilities;
          for (const capability of materials)
            assert.equal(
              capability.parameterSources.includes('workflow-input'),
              variants.some(
                (variant) =>
                  variant.properties.parameterSource?.const ===
                    'workflow-input' &&
                  variant.properties.capability.const === capability.name,
              ),
            );
          return {
            nativeNodes: [
              {
                id: node.id,
                capability: node.capability,
                parameterSource: 'workflow-input',
              },
            ],
            gaps: [],
          };
        },
      };
    },
  };
  const planned = await planNativeNodes({
    planId: 'runtime-plan',
    scenario: 'Read an actual typed input object supplied at execution.',
    model,
    capabilities: fixture.context.capabilities,
    allowRuntimeParameters: true,
  });
  assert.deepEqual(planned.nativeNodes, [node]);
  await assert.rejects(
    () =>
      planNativeNodes({
        planId: 'strict-plan',
        scenario: 'No runtime contract allowed.',
        model,
        capabilities: fixture.context.capabilities,
      }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'proposal-schema',
  );
  assert.equal(calls.length, 2);
});

test('recursive parameter resources remain local across two runtime instances of the same producer', () => {
  const tree = z.lazy(() =>
    z.strictObject({ id: z.string(), children: z.array(tree) }),
  );
  const base = z.strictObject({ tree });
  for (const parametersSchema of [
    base,
    base.meta({ $id: 'https://fixture.test/shared-native-input' }),
  ]) {
    const capability = createJsonOutputCapability({
      name: 'tree-input',
      description: 'Original recursive tree',
      parametersSchema,
    });
    const context = {
      operations: [],
      capabilities: [capability],
      messages: [],
    };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'trees',
        requirements: [],
        apiCalls: [],
        nativeNodes: ['first', 'second'].map((id) => ({
          id,
          capability: capability.name,
          parameters: {},
          runtimeParameters: true,
        })),
        edges: [],
      },
    });
    const pending = compileN8nWorkflowTemplate({
      draft,
      context,
      name: 'Two recursive input instances',
    });
    const inputValues = Object.fromEntries(
      pending.inputSlots.map((slot) => [
        slot.id,
        {
          tree: { id: slot.nodeId, children: [{ id: 'child', children: [] }] },
        },
      ]),
    );
    const result = compileN8nWorkflowTemplate({
      draft,
      context,
      name: 'Two recursive input instances',
      inputValues,
    });
    const preflight = result.workflow.nodes.find(
      (node) => node.name === '입력 사전 검사',
    );
    assert.deepEqual(
      json(
        execute(preflight, [{ json: { revision: 0, values: inputValues } }]),
      )[0].json.values,
      inputValues,
    );
    const [slot] = result.inputSlots;
    const invalid = {
      ...inputValues,
      [slot.id]: { tree: { id: 'root', children: [{ id: 7, children: [] }] } },
    };
    assert.throws(
      () => execute(preflight, [{ json: { revision: 0, values: invalid } }]),
      /Workflow inputs do not match declared slots/,
    );
    assert.equal(
      createWorkflowRuntimeInputsSchema(
        collectNativeRuntimeInputSlots({
          nativeNodes: draft.nativeNodes,
          capabilities: [capability],
        }),
      ).safeParse(inputValues).success,
      true,
    );
  }
});

test('different native contracts may retain the same original resource ID in isolated input scopes', () => {
  const schemas = [
    z.strictObject({ count: z.number().int() }),
    z.strictObject({ count: z.string() }),
  ].map((schema) => schema.meta({ $id: 'https://fixture.test/shared-input' }));
  const capabilities = schemas.map((parametersSchema, index) =>
    createJsonOutputCapability({
      name: `isolated-input-${index}`,
      description: 'Independent original resource',
      parametersSchema,
    }),
  );
  const context = { operations: [], capabilities, messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'independent-schema-resources',
      requirements: [],
      apiCalls: [],
      nativeNodes: capabilities.map((capability, index) => ({
        id: `input-${index}`,
        capability: capability.name,
        runtimeParameters: true,
        parameters: {},
      })),
      edges: [],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Independent schema resource scopes',
  });
  const values = Object.fromEntries(
    result.inputSlots.map((slot, index) => [
      slot.id,
      { count: index === 0 ? 0 : '0' },
    ]),
  );
  const before = json(schemas.map((schema) => z.toJSONSchema(schema)));
  const preflight = result.workflow.nodes.find(
    (node) => node.name === '입력 사전 검사',
  );
  assert.deepEqual(
    json(execute(preflight, [{ json: { revision: 0, values } }]))[0].json
      .values,
    values,
  );
  const presentation = createWorkflowRuntimeInputsSchema(
    collectNativeRuntimeInputSlots({
      nativeNodes: draft.nativeNodes,
      capabilities,
    }),
  );
  assert.equal(presentation.safeParse(values).success, true);
  for (const [index, slot] of result.inputSlots.entries()) {
    const invalid = {
      ...values,
      [slot.id]: { count: index === 0 ? '0' : 0 },
    };
    assert.equal(presentation.safeParse(invalid).success, false);
    assert.throws(
      () => execute(preflight, [{ json: { revision: 0, values: invalid } }]),
      /Workflow inputs do not match declared slots/,
    );
  }
  assert.deepEqual(
    schemas.map((schema) => z.toJSONSchema(schema)),
    before,
  );
});
