import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  StateGraph,
  MemorySaver,
  START,
  END,
  interrupt,
  Command,
} from '@langchain/langgraph';
import {
  createNativeInstanceSelectionSchema,
  resolveNativeInstanceSelection,
  describeNativeNodeConfiguration,
  createNativeNodeParametersSchema,
  resolveNativeNodeParameters,
  createNativeNodePlan,
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
} from '@openapi-flow/core';
import { createJsonOutputCapability } from '@openapi-flow/n8n';
import {
  selectNativeNodeInstances,
  generateNativeNodeParameters,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';

function fixture() {
  return {
    planId: 'native-stages',
    scenario:
      'Keep enabled false and supply count and nested value at execution.',
    allowRuntimeParameters: true,
    capabilities: [
      createJsonOutputCapability({
        name: 'context',
        description: 'Actual typed values',
        parametersSchema: z.strictObject({
          enabled: z.boolean(),
          count: z.number().int(),
          nested: z.strictObject({ value: z.string() }),
        }),
      }),
    ],
  };
}
function proposal(parameterSource = 'workflow-fields') {
  return {
    instances: [
      {
        capability: 'context',
        purpose: 'scenario context',
        parameterSource,
        ...(parameterSource === 'workflow-fields'
          ? { pointers: ['/count', '/nested/value'] }
          : {}),
      },
    ],
    gaps: [],
  };
}
function selection(input = fixture(), original = proposal()) {
  return resolveNativeInstanceSelection({ ...input, proposal: original });
}
function configuration(input = fixture(), selected = selection(input)) {
  return { ...input, selection: selected, nodeId: selected.instances[0].id };
}
function fakeModel(output, calls = [], inspect) {
  return {
    withStructuredOutput(schema, options) {
      calls.push({ schema, options });
      return {
        async invoke(messages) {
          calls.at(-1).messages = messages;
          if (inspect) await inspect();
          if (output instanceof Error) throw output;
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

function nativeQuestion(input, message = 'What is enabled?') {
  return resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: { decision: { status: 'needs-clarification', message } },
  });
}

test('standalone selection contains only roles and ownership; code derives stable distinct IDs and schemas', () => {
  const input = fixture();
  const original = proposal();
  original.instances.push({ ...original.instances[0], purpose: 'second role' });
  const result = selection(input, original);
  assert.equal(result.instances.length, 2);
  assert.notEqual(result.instances[0].id, result.instances[1].id);
  const reversed = selection(input, {
    ...original,
    instances: [...original.instances].reverse(),
  });
  assert.equal(result.instances[0].id, reversed.instances[1].id);
  assert.deepEqual(result.instances[0].runtimeParameters, {
    pointers: ['/count', '/nested/value'],
  });
  assert.deepEqual(result.instances[0].literalParametersSchema.required, [
    'enabled',
  ]);
  for (const field of [
    'id',
    'parameters',
    'ports',
    'literalParametersSchema',
    'runtimeParameters',
  ]) {
    const invalid = globalThis.structuredClone(original);
    invalid.instances[0][field] = 'invented';
    assert.throws(() => selection(input, invalid));
  }
});

test('duplicate roles, unknown capabilities and invalid/overlapping runtime pointers fail without repair', () => {
  const input = fixture(),
    duplicate = proposal();
  duplicate.instances.push(globalThis.structuredClone(duplicate.instances[0]));
  assert.throws(() => selection(input, duplicate), /repeated/);
  const unknown = proposal();
  unknown.instances[0].capability = 'not-supplied';
  assert.throws(() => selection(input, unknown));
  for (const pointers of [
    ['/missing'],
    ['/nested', '/nested/value'],
    ['/count', '/count'],
    [''],
    ['not-a-pointer'],
  ]) {
    const invalid = proposal();
    invalid.instances[0].pointers = pointers;
    assert.throws(() => selection(input, invalid));
  }
  assert.throws(
    () => selection({ ...input, allowRuntimeParameters: false }),
    /literal/,
  );
});

test('mixed values exclude runtime owners, retain required literal types, and materialize unchanged', () => {
  const input = configuration();
  const schema = createNativeNodeParametersSchema(input);
  const description = describeNativeNodeConfiguration(input);
  const output = {
    decision: { status: 'provided', parameters: { enabled: false } },
  };
  assert.deepEqual(schema.parse(output), output);
  for (const parameters of [
    {},
    { enabled: 'false' },
    { enabled: false, count: 0 },
    { enabled: false, nested: { value: 'invented' } },
  ])
    assert.equal(
      schema.safeParse({ decision: { status: 'provided', parameters } })
        .success,
      false,
    );
  const result = resolveNativeNodeParameters({
    ...input,
    fingerprint: description.fingerprint,
    proposal: output,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node.parameters, { enabled: false });
  const slots = collectNativeRuntimeInputSlots({
    nativeNodes: [result.node],
    capabilities: input.capabilities,
  });
  const actual = Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      slot.targetPointer === '/count' ? 0 : '={{ literal }}',
    ]),
  );
  const inspection = inspectNativeRuntimeInputs({
    nativeNodes: [result.node],
    capabilities: input.capabilities,
    inputValues: actual,
  });
  assert.equal(inspection.status, 'ready');
  assert.deepEqual(inspection.nativeNodes[0].parameters, {
    enabled: false,
    count: 0,
    nested: { value: '={{ literal }}' },
  });
  assert.equal(
    Object.hasOwn(inspection.nativeNodes[0], 'runtimeParameters'),
    false,
  );
  assert.deepEqual(
    createNativeNodePlan({
      ...input,
      proposal: { nativeNodes: [result.node], gaps: [] },
    }).nativeNodes,
    [result.node],
  );
});

test('persisted selection, configuration source and generation fingerprint cannot be silently rebased', () => {
  const input = configuration();
  for (const mutate of [
    (copy) => {
      copy.selection.instances[0].hasLiteralParameters = false;
    },
    (copy) => {
      copy.selection.instances[0].literalParametersSchema = {};
    },
    (copy) => {
      copy.scenario += 'changed';
    },
    (copy) => {
      copy.planId = 'other';
    },
    (copy) => {
      copy.selection.instances[0].id = 'invented';
    },
  ]) {
    const copy = {
      ...input,
      selection: globalThis.structuredClone(input.selection),
    };
    mutate(copy);
    assert.throws(
      () => describeNativeNodeConfiguration(copy),
      /stale|modified/,
    );
  }
  assert.throws(
    () =>
      resolveNativeNodeParameters({
        ...input,
        fingerprint: 'stale',
        proposal: {
          decision: { status: 'provided', parameters: { enabled: false } },
        },
      }),
    /fingerprint/,
  );
});

test('unconfigured selected roles do not acquire fabricated output schemas', () => {
  const input = fixture(),
    original = proposal();
  original.instances.push({
    ...original.instances[0],
    purpose: 'another context',
  });
  const selected = selection(input, original);
  const first = {
    ...input,
    selection: selected,
    nodeId: selected.instances[0].id,
  };
  assert.deepEqual(describeNativeNodeConfiguration(first).outputs, []);
  const resolved = resolveNativeNodeParameters({
    ...first,
    fingerprint: describeNativeNodeConfiguration(first).fingerprint,
    proposal: {
      decision: { status: 'provided', parameters: { enabled: false } },
    },
  });
  const next = {
    ...first,
    nodeId: selected.instances[1].id,
    configuredNodes: [resolved.node],
  };
  assert.deepEqual(
    describeNativeNodeConfiguration(next).outputs.map(
      (output) => output.nodeId,
    ),
    [resolved.node.id],
  );
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...next,
        configuredNodes: [{ ...resolved.node, id: 'fake' }],
      }),
    /distinct selected/,
  );
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...next,
        configuredNodes: [{ ...resolved.node, runtimeParameters: true }],
      }),
    /owner/,
  );
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...next,
        configuredNodes: [{ ...resolved.node, parameters: {} }],
      }),
    /enabled/,
  );
});

test('role selection and typed value generation are independent one-call stages', async () => {
  const input = fixture(),
    calls = [];
  const selected = await selectNativeNodeInstances({
    ...input,
    model: fakeModel(proposal(), calls),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.name, 'select_native_node_instances');
  assert.deepEqual(JSON.parse(calls[0].messages[1].content).parameterPlanning, {
    stage: 'separate-value-generation',
    missingPlanTimeValues: 'ask-in-value-stage',
  });
  assert.equal(
    JSON.stringify(calls[0].schema.properties.instances).includes(
      'literalParametersSchema',
    ),
    false,
  );
  const result = await generateNativeNodeParameters({
    ...configuration(input, selected),
    model: fakeModel(
      { decision: { status: 'provided', parameters: { enabled: false } } },
      calls,
    ),
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.name, 'generate_native_node_parameters');
  const sent = JSON.parse(calls[1].messages[1].content);
  assert.equal(sent.target.capability.name, 'context');
  assert.equal(sent.target.capability.description, 'Actual typed values');
  assert.equal(sent.target.id, selected.instances[0].id);
  assert.deepEqual(Object.keys(sent.parametersSchema.properties), ['enabled']);
  assert.equal(
    Object.hasOwn(
      calls[1].schema.properties.decision.anyOf[0].properties,
      'nodeId',
    ),
    false,
  );
  assert.equal(calls[1].messages[0].getType(), 'system');
  assert.equal(calls[1].messages[1].getType(), 'human');
});

test('whole-object, fully field-owned and proven empty parameter settings use zero value calls', async () => {
  const input = fixture(),
    calls = [];
  const choices = [proposal('workflow-input'), proposal()];
  choices[1].instances[0].pointers.push('/enabled');
  for (const original of choices) {
    const selected = selection(input, original);
    assert.equal(selected.instances[0].hasLiteralParameters, false);
    const result = await generateNativeNodeParameters(
      configuration(input, selected),
    );
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.node.parameters, {});
  }
  const empty = {
    ...input,
    capabilities: [
      createJsonOutputCapability({
        name: 'context',
        description: 'No configuration',
        parametersSchema: z.strictObject({}),
      }),
    ],
  };
  const result = await generateNativeNodeParameters({
    ...configuration(empty, selection(empty, proposal('literal'))),
    model: fakeModel(new Error('must not call'), calls),
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls.length, 0);
  assert.deepEqual(
    (
      await selectNativeNodeInstances({
        planId: 'empty',
        scenario: 'No native inputs',
        includeExplanations: true,
      })
    ).instances,
    [],
  );
});

test('clarification returns the original decision without fabricating an executable node', async () => {
  const output = {
    decision: {
      status: 'needs-clarification',
      message: 'Which literal value is intended?',
    },
  };
  const result = await generateNativeNodeParameters({
    ...configuration(),
    model: fakeModel(output),
  });
  assert.equal(result.status, 'needs-clarification');
  assert.deepEqual(result.proposal, output);
  assert.equal(Object.hasOwn(result, 'node'), false);
});

test('transport failures preserve identity and resume does not repeat role selection', async () => {
  const input = fixture(),
    selectionCalls = [],
    valueCalls = [];
  const selected = await selectNativeNodeInstances({
    ...input,
    model: fakeModel(proposal(), selectionCalls),
  });
  const failure = new Error('transport unavailable');
  await assert.rejects(
    generateNativeNodeParameters({
      ...configuration(input, selected),
      model: fakeModel(failure, valueCalls),
    }),
    (error) => error === failure,
  );
  const result = await generateNativeNodeParameters({
    ...configuration(input, selected),
    model: fakeModel(
      { decision: { status: 'provided', parameters: { enabled: false } } },
      valueCalls,
    ),
  });
  assert.equal(result.status, 'ready');
  assert.equal(selectionCalls.length, 1);
  assert.equal(valueCalls.length, 2);
});

test('schema and concurrent source failures preserve original output and never retry', async () => {
  const input = fixture(),
    selected = selection(input),
    calls = [];
  const invalid = {
    decision: { status: 'provided', parameters: { enabled: 'false' } },
  };
  await assert.rejects(
    generateNativeNodeParameters({
      ...configuration(input, selected),
      model: fakeModel(invalid, calls),
    }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'parameter-schema' &&
      assert.deepEqual(error.failure.output, invalid) === undefined,
  );
  assert.equal(calls.length, 1);
  const args = { ...configuration(input, selected) };
  const valid = {
    decision: { status: 'provided', parameters: { enabled: false } },
  };
  args.model = fakeModel(valid, calls, () => {
    args.scenario += 'changed';
  });
  await assert.rejects(
    generateNativeNodeParameters(args),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'parameter-validation' &&
      assert.deepEqual(error.failure.output, valid) === undefined,
  );
  assert.equal(calls.length, 2);
});

test('optional reasons stay outside execution parameters and are validated at both stages', async () => {
  const input = { ...fixture(), includeExplanations: true },
    original = proposal();
  assert.equal(
    createNativeInstanceSelectionSchema(input).safeParse(original).success,
    false,
  );
  original.reason =
    'The requested context is available in the supplied registry.';
  original.instances[0].reason =
    'The scenario explicitly defers count and nested value.';
  const selected = selection(input, original);
  const result = await generateNativeNodeParameters({
    ...configuration(input, selected),
    model: fakeModel({
      decision: {
        status: 'provided',
        parameters: { enabled: false },
        reason: 'The scenario explicitly says false.',
      },
    }),
  });
  assert.deepEqual(result.node.parameters, { enabled: false });
  assert.equal(
    result.proposal.decision.reason,
    'The scenario explicitly says false.',
  );
  assert.equal(Object.hasOwn(result.node, 'reason'), false);
});

test('an actual LangGraph checkpoint resumes parameter generation without repeating completed selection', async () => {
  const input = fixture(),
    selectionCalls = [],
    valueCalls = [];
  const failure = new Error('first parameter transport failed');
  const valueOutput = {
    decision: { status: 'provided', parameters: { enabled: false } },
  };
  const state = z.object({
    selection: z.custom().optional(),
    result: z.custom().optional(),
  });
  const graph = new StateGraph(state)
    .addNode('select-instances', async () => ({
      selection: await selectNativeNodeInstances({
        ...input,
        model: fakeModel(proposal(), selectionCalls),
      }),
    }))
    .addNode('configure-instance', async (current) => ({
      result: await generateNativeNodeParameters({
        ...configuration(input, current.selection),
        model: fakeModel(
          valueCalls.length === 0 ? failure : valueOutput,
          valueCalls,
        ),
      }),
    }))
    .addEdge(START, 'select-instances')
    .addEdge('select-instances', 'configure-instance')
    .addEdge('configure-instance', END)
    .compile({ checkpointer: new MemorySaver() });
  const config = { configurable: { thread_id: 'native-parameter-resume' } };
  await assert.rejects(graph.invoke({}, config), (error) => error === failure);
  const checkpoint = await graph.getState(config);
  assert.equal(checkpoint.values.selection.instances.length, 1);
  assert.equal(checkpoint.values.result, undefined);
  const resumed = await graph.invoke(null, config);
  assert.equal(resumed.result.status, 'ready');
  assert.deepEqual(resumed.result.node.parameters, { enabled: false });
  assert.equal(selectionCalls.length, 1);
  assert.equal(valueCalls.length, 2);
});

test('selection rejects concurrent option changes and invalid explicitly supplied models without substitution', async () => {
  const input = fixture(),
    calls = [];
  input.model = fakeModel(proposal(), calls, () => {
    input.planId = 'changed-during-selection';
  });
  await assert.rejects(
    selectNativeNodeInstances(input),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'instance-selection',
  );
  assert.equal(calls.length, 1);
  await assert.rejects(
    selectNativeNodeInstances({
      planId: 'empty',
      scenario: 'No registered materials',
      model: {},
    }),
    /model.*when supplied/,
  );
  const args = fixture();
  const selected = selection(args, proposal('workflow-input'));
  await assert.rejects(
    generateNativeNodeParameters({
      ...configuration(args, selected),
      model: {},
    }),
    /model.*when supplied/,
  );
});

test('scoped native answers preserve the selection, original scenario, question record and exact text', async () => {
  const input = configuration();
  const original = globalThis.structuredClone(input.selection);
  const question = nativeQuestion(input);
  assert.match(question.id, /^native-question:/);
  const reply = { question, text: '  enabled는 false로 설정해줘.  ' };
  const answered = { ...input, replies: [reply] };
  const description = describeNativeNodeConfiguration(answered);
  assert.deepEqual(description.replies, [reply]);
  assert.notEqual(description.fingerprint, question.fingerprint);
  const calls = [];
  const result = await generateNativeNodeParameters({
    ...answered,
    model: fakeModel(
      { decision: { status: 'provided', parameters: { enabled: false } } },
      calls,
    ),
  });
  assert.equal(result.status, 'ready');
  const sent = JSON.parse(calls[0].messages[1].content);
  assert.equal(sent.scenario, input.scenario);
  assert.deepEqual(sent.replies, [reply]);
  assert.deepEqual(result.node.parameters, { enabled: false });
  assert.deepEqual(input.selection, original);
  assert.equal(Object.hasOwn(result.node, 'replies'), false);
  assert.equal(input.replies, undefined);
});

test('native answer history rejects altered questions, other targets, malformed text and stale source revisions before a model call', async () => {
  const input = configuration(),
    question = nativeQuestion(input),
    calls = [];
  const original = { question, text: 'false' };
  const invalid = [
    null,
    [{ ...original, text: '' }],
    [{ ...original, text: ' \n\t ' }],
    [{ ...original, text: 0 }],
    [{ ...original, question: { ...question, id: 'forged' } }],
    [{ ...original, question: { ...question, nodeId: 'other-target' } }],
    [{ ...original, question: { ...question, fingerprint: 'stale' } }],
    [{ ...original, question: { ...question, message: 'altered' } }],
    [
      {
        ...original,
        question: {
          ...question,
          message: 'altered',
          proposal: {
            decision: { status: 'needs-clarification', message: 'altered' },
          },
        },
      },
    ],
    [{ ...original, unknown: 'extra' }],
  ];
  for (const replies of invalid)
    await assert.rejects(
      generateNativeNodeParameters({
        ...input,
        replies,
        model: fakeModel(new Error('must not invoke'), calls),
      }),
    );
  assert.equal(calls.length, 0);
  const withReply = { ...input, replies: [original] };
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...withReply,
        scenario: 'changed scenario',
      }),
    /stale|modified/,
  );
  const candidate = proposal();
  candidate.instances.push({
    ...candidate.instances[0],
    purpose: 'other role',
  });
  const selected = selection(fixture(), candidate);
  const other = {
    ...fixture(),
    selection: selected,
    nodeId: selected.instances[1].id,
  };
  const source = resolveNativeNodeParameters({
    ...other,
    fingerprint: describeNativeNodeConfiguration(other).fingerprint,
    proposal: {
      decision: { status: 'provided', parameters: { enabled: false } },
    },
  });
  const base = {
    ...fixture(),
    selection: selected,
    nodeId: selected.instances[0].id,
    configuredNodes: [source.node],
  };
  const scopedQuestion = nativeQuestion(base);
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...base,
        configuredNodes: [{ ...source.node, parameters: { enabled: true } }],
        replies: [{ question: scopedQuestion, text: 'false' }],
      }),
    /material revision/,
  );
});

test('multiple native clarification rounds form an ordered chain without rewriting earlier answers', () => {
  const input = configuration(),
    first = nativeQuestion(input);
  const initialReply = {
    question: first,
    text: 'Please clarify which setting is requested.',
  };
  const secondInput = { ...input, replies: [initialReply] };
  const second = nativeQuestion(
    secondInput,
    'Should enabled be true or false?',
  );
  assert.notEqual(first.id, second.id);
  const nextReply = { question: second, text: 'false' };
  const finalInput = { ...input, replies: [initialReply, nextReply] };
  const result = resolveNativeNodeParameters({
    ...finalInput,
    fingerprint: describeNativeNodeConfiguration(finalInput).fingerprint,
    proposal: {
      decision: { status: 'provided', parameters: { enabled: false } },
    },
  });
  assert.equal(result.status, 'ready');
  for (const replies of [
    [nextReply, initialReply],
    [initialReply, initialReply],
    [{ ...initialReply, text: 'changed earlier answer' }, nextReply],
    [nextReply],
  ])
    assert.throws(
      () => describeNativeNodeConfiguration({ ...input, replies }),
      /out of order|stale/,
    );
});

test('concurrent answer edits reject the original response instead of applying it to new user text', async () => {
  const input = configuration(),
    question = nativeQuestion(input),
    calls = [];
  const output = {
    decision: { status: 'provided', parameters: { enabled: false } },
  };
  const args = { ...input, replies: [{ question, text: 'false' }] };
  args.model = fakeModel(output, calls, () => {
    args.replies[0].text = 'true';
  });
  await assert.rejects(
    generateNativeNodeParameters(args),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'parameter-validation' &&
      assert.deepEqual(error.failure.output, output) === undefined,
  );
  assert.equal(calls.length, 1);
});

test('native replies cannot be silently ignored by whole-owned or fixed-empty zero-call paths', async () => {
  const input = fixture(),
    literal = configuration(input),
    question = nativeQuestion(literal);
  const whole = configuration(
    input,
    selection(input, proposal('workflow-input')),
  );
  await assert.rejects(
    generateNativeNodeParameters({
      ...whole,
      replies: [{ question, text: 'false' }],
    }),
    /remaining literal/,
  );
  assert.equal((await generateNativeNodeParameters(whole)).status, 'ready');
});

test('actual LangGraph HITL preserves selection and resumes only the requested value stage with its answer', async () => {
  const input = fixture(),
    selectionCalls = [],
    valueCalls = [];
  const state = z.object({
    selection: z.custom().optional(),
    result: z.custom().optional(),
    replies: z.array(z.custom()).optional(),
  });
  const graph = new StateGraph(state)
    .addNode('select-instances', async () => ({
      selection: await selectNativeNodeInstances({
        ...input,
        model: fakeModel(proposal(), selectionCalls),
      }),
      replies: [],
    }))
    .addNode('generate-parameters', async (current) => ({
      result: await generateNativeNodeParameters({
        ...configuration(input, current.selection),
        replies: current.replies,
        model: fakeModel(
          current.replies.length
            ? {
                decision: {
                  status: 'provided',
                  parameters: { enabled: false },
                },
              }
            : {
                decision: {
                  status: 'needs-clarification',
                  message: 'What is enabled?',
                },
              },
          valueCalls,
        ),
      }),
    }))
    .addNode('ask-native-value', (current) => {
      const text = interrupt({
        kind: 'native-parameters',
        question: current.result,
      });
      return {
        replies: [...current.replies, { question: current.result, text }],
      };
    })
    .addEdge(START, 'select-instances')
    .addEdge('select-instances', 'generate-parameters')
    .addConditionalEdges('generate-parameters', (current) =>
      current.result.status === 'needs-clarification'
        ? 'ask-native-value'
        : END,
    )
    .addEdge('ask-native-value', 'generate-parameters')
    .compile({ checkpointer: new MemorySaver() });
  const config = { configurable: { thread_id: 'native-question-answer' } };
  const pending = await graph.invoke({}, config);
  assert.equal(pending.__interrupt__[0].value.kind, 'native-parameters');
  const original = globalThis.structuredClone(pending.selection);
  const result = await graph.invoke(
    new Command({ resume: 'enabled는 false야.' }),
    config,
  );
  assert.equal(result.result.status, 'ready');
  assert.deepEqual(result.selection, original);
  assert.deepEqual(result.result.node.parameters, { enabled: false });
  assert.equal(selectionCalls.length, 1);
  assert.equal(valueCalls.length, 2);
  assert.equal(
    JSON.parse(valueCalls[1].messages[1].content).replies[0].text,
    'enabled는 false야.',
  );
});
