import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
  createWorkflowDraftNativeNodeAdditionSchema,
  stageWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
  createWorkflowDraftEditPlan,
  resolveWorkflowDraftNativeNodeParameterOwnership,
  validateWorkflowDraftNativeNodeParameterOwnershipContract,
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftNativeNodeAddition,
  WorkflowDraftNativeNodeAdditionPlanningError,
  selectWorkflowDraftNativeNodeParameterOwnership,
} from '@openapi-flow/langchain';
import {
  compileN8nWorkflowTemplate,
  createJsonOutputCapability,
  createNativeArrayCapability,
  createN8nNativeOutputSources,
} from '@openapi-flow/n8n';
import {
  nativeNodeAdditionFixture,
  nativeAdditionParameters,
  nativeAdditionProposal,
  nativeAdditionModel,
} from './fixtures/workflow-draft-native-node-addition-fixture.mjs';
import {
  connectionEditPlan,
  connectionEditProposal,
  addConnection,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';

const describe = describeWorkflowDraftNativeNodeAddition;
const resolve = (input, proposal) =>
  resolveWorkflowDraftNativeNodeAddition({
    ...input,
    fingerprint: describe(input).fingerprint,
    proposal,
  });

function ownershipContract(input, choice) {
  const result = resolveWorkflowDraftNativeNodeParameterOwnership({
    ...input,
    fingerprint: describe(input).fingerprint,
    proposal: nativeAdditionProposal(input, choice),
  });
  assert.equal(result.status, 'ready');
  return result.contract;
}

test('separate ownership and literal calls exclude deferred fields and preserve existing materials', async () => {
  const input = {
    ...(await nativeNodeAdditionFixture(
      'typed-context',
      true,
      'Add a separate context with enabled false; supply only count and nested value at execution. Keep every existing node and route.',
    )),
    allowRuntimeParameters: true,
  };
  const original = globalThis.structuredClone(input.draft);
  const ownershipModel = nativeAdditionModel(
    nativeAdditionProposal(input, {
      status: 'runtime-fields',
      pointers: ['/count', '/nested/value'],
    }),
  );
  const selected = await selectWorkflowDraftNativeNodeParameterOwnership({
    ...input,
    model: ownershipModel,
  });
  assert.equal(selected.status, 'ready');
  assert.equal(ownershipModel.requests.length, 1);
  const stage = { ...input, parameterOwnership: selected.contract };
  const schema = createWorkflowDraftNativeNodeAdditionSchema(stage);
  for (const parameters of [
    {},
    { enabled: 'false' },
    { enabled: false, count: 4 },
    { enabled: false, nested: { value: 'invented' } },
  ])
    assert.equal(
      schema.safeParse(
        nativeAdditionProposal(input, { status: 'provided', parameters }),
      ).success,
      false,
    );
  assert.equal(
    schema.safeParse(
      nativeAdditionProposal(input, { status: 'runtime-parameters' }),
    ).success,
    false,
  );
  const valuesModel = nativeAdditionModel(
    nativeAdditionProposal(input, {
      status: 'provided',
      parameters: { enabled: false },
    }),
  );
  const result = await generateWorkflowDraftNativeNodeAddition({
    ...stage,
    model: valuesModel,
  });
  assert.equal(result.status, 'ready');
  assert.equal(valuesModel.requests.length, 1);
  assert.equal(result.resolution.kind, 'native-mixed');
  const payload = JSON.parse(valuesModel.requests[0].messages[1].content);
  assert.equal(
    Object.hasOwn(payload.parametersSchema.properties, 'count'),
    false,
  );
  assert.deepEqual(payload.parametersSchema.required, ['enabled']);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const node = candidate.draft.nativeNodes.find(
    (node) => node.id === describe(input).nodeId,
  );
  assert.deepEqual(node.parameters, { enabled: false });
  assert.deepEqual(node.runtimeParameters, {
    pointers: ['/count', '/nested/value'],
  });
  assert.deepEqual(
    candidate.draft.nativeNodes.slice(0, original.nativeNodes.length),
    original.nativeNodes,
  );
  assert.deepEqual(candidate.draft.apiCalls, original.apiCalls);
  assert.deepEqual(candidate.draft.edges, original.edges);
  const material = {
    nativeNodes: candidate.draft.nativeNodes,
    capabilities: input.context.capabilities,
  };
  const slots = collectNativeRuntimeInputSlots(material);
  const values = new Map([
    ['/count', 0],
    ['/nested/value', '={{ unchanged text }}'],
  ]);
  const actual = inspectNativeRuntimeInputs({
    ...material,
    inputValues: Object.fromEntries(
      slots.map((slot) => [slot.id, values.get(slot.targetPointer)]),
    ),
  });
  assert.equal(actual.status, 'ready');
  assert.deepEqual(
    actual.nativeNodes.find((node) => node.id === describe(input).nodeId)
      .parameters,
    { count: 0, enabled: false, nested: { value: '={{ unchanged text }}' } },
  );
  assert.equal(
    compileN8nWorkflowTemplate({
      draft: candidate.draft,
      context: input.context,
      name: 'Added mixed fields',
    }).inputSlots.length,
    2,
  );
  assert.deepEqual(input.draft, original);
});

test('fully deferred or whole-owned additions make no value call; literal-only policy needs no ownership model', async () => {
  const literalInput = await nativeNodeAdditionFixture();
  const literal =
    await selectWorkflowDraftNativeNodeParameterOwnership(literalInput);
  assert.equal(literal.status, 'ready');
  assert.equal(literal.contract.runtimeParameters, undefined);
  const input = { ...literalInput, allowRuntimeParameters: true };
  for (const choice of [
    { status: 'runtime-parameters' },
    {
      status: 'runtime-fields',
      pointers: ['/count', '/enabled', '/nested/value'],
    },
  ]) {
    const parameterOwnership = ownershipContract(input, choice);
    assert.equal(parameterOwnership.hasLiteralParameters, false);
    const result = await generateWorkflowDraftNativeNodeAddition({
      ...input,
      parameterOwnership,
    });
    assert.equal(result.status, 'ready');
    assert.equal(
      result.resolution.kind,
      choice.status === 'runtime-parameters'
        ? 'native-runtime'
        : 'native-mixed',
    );
    const candidate = assembleWorkflowDraftEdit({
      ...input,
      resolutions: [result.resolution],
    });
    assert.deepEqual(candidate.draft.nativeNodes.at(-1).parameters, {});
  }
});

test('ownership targets, receipts and current authority are validated without broadening or rewriting them', async () => {
  const input = {
    ...(await nativeNodeAdditionFixture('typed-context', true)),
    allowRuntimeParameters: true,
  };
  for (const pointers of [
    ['/unknown'],
    ['/nested', '/nested/value'],
    ['/count', '/count'],
    [''],
    ['/bad~2pointer'],
  ])
    assert.throws(() =>
      ownershipContract(input, { status: 'runtime-fields', pointers }),
    );
  const contract = ownershipContract(input, {
    status: 'runtime-fields',
    pointers: ['/count'],
  });
  for (const changed of [
    { ...contract, nodeId: 'invented' },
    { ...contract, literalParametersSchema: true },
    { ...contract, hasLiteralParameters: false },
    { ...contract, runtimeParameters: { pointers: ['/enabled'] } },
  ])
    assert.throws(
      () =>
        validateWorkflowDraftNativeNodeParameterOwnershipContract({
          ...input,
          parameterOwnership: changed,
        }),
      /modified|stale/,
    );
  input.parameterOwnership = contract;
  await assert.rejects(
    generateWorkflowDraftNativeNodeAddition({
      ...input,
      model: nativeAdditionModel(
        nativeAdditionProposal(input, {
          status: 'provided',
          parameters: { enabled: false, nested: { value: 'actual' } },
        }),
        () => {
          contract.hasLiteralParameters = false;
        },
      ),
    }),
    /ownership changed/,
  );
});

test('recursive resources preserve unselected siblings and only the finite owned path is projected', async () => {
  const base = await nativeNodeAdditionFixture();
  const recursive = z.lazy(() =>
    z.strictObject({ value: z.number(), child: recursive.optional() }),
  );
  const capability = createJsonOutputCapability({
    name: 'recursive-mixed',
    description: 'Recursive original parameters',
    parametersSchema: z.strictObject({ left: recursive, right: recursive }),
  });
  const context = {
    ...base.context,
    capabilities: [...base.context.capabilities, capability],
  };
  const input = {
    ...base,
    context,
    plan: connectionEditPlan({ ...base, context }, [
      { kind: 'add-native-node', capability: capability.name },
    ]),
    allowRuntimeParameters: true,
  };
  input.stepId = input.plan.steps[0].id;
  const parameterOwnership = ownershipContract(input, {
    status: 'runtime-fields',
    pointers: ['/left/child/value'],
  });
  const stage = { ...input, parameterOwnership };
  const parameters = {
    left: { value: 0 },
    right: { value: 2, child: { value: 3 } },
  };
  const result = resolve(
    stage,
    nativeAdditionProposal(input, { status: 'provided', parameters }),
  );
  assert.equal(result.status, 'ready');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const material = {
    nativeNodes: candidate.draft.nativeNodes,
    capabilities: context.capabilities,
  };
  const [slot] = collectNativeRuntimeInputSlots(material);
  const actual = inspectNativeRuntimeInputs({
    ...material,
    inputValues: { [slot.id]: 4 },
  });
  assert.equal(actual.status, 'ready');
  assert.deepEqual(actual.nativeNodes.at(-1).parameters, {
    left: { value: 0, child: { value: 4 } },
    right: parameters.right,
  });
  assert.throws(
    () =>
      resolve(
        stage,
        nativeAdditionProposal(input, {
          status: 'provided',
          parameters: { left: { value: 0 } },
        }),
      ),
    /JSON Schema/,
  );
});

test('a deferred array element requires its real literal prefix instead of fabricated positions', async () => {
  const base = await nativeNodeAdditionFixture();
  const capability = createJsonOutputCapability({
    name: 'array-mixed',
    description: 'Exact three inputs',
    parametersSchema: z.strictObject({ rows: z.array(z.string()).length(3) }),
  });
  const context = {
    ...base.context,
    capabilities: [...base.context.capabilities, capability],
  };
  const input = {
    ...base,
    context,
    plan: connectionEditPlan({ ...base, context }, [
      { kind: 'add-native-node', capability: capability.name },
    ]),
    allowRuntimeParameters: true,
  };
  input.stepId = input.plan.steps[0].id;
  const parameterOwnership = ownershipContract(input, {
    status: 'runtime-fields',
    pointers: ['/rows/2'],
  });
  const stage = { ...input, parameterOwnership };
  assert.throws(
    () =>
      resolve(
        stage,
        nativeAdditionProposal(input, {
          status: 'provided',
          parameters: { rows: [] },
        }),
      ),
    /JSON Schema/,
  );
  const result = resolve(
    stage,
    nativeAdditionProposal(input, {
      status: 'provided',
      parameters: { rows: ['a', 'b'] },
    }),
  );
  assert.equal(result.status, 'ready');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const material = {
    nativeNodes: candidate.draft.nativeNodes,
    capabilities: context.capabilities,
  };
  const [slot] = collectNativeRuntimeInputSlots(material);
  assert.deepEqual(
    inspectNativeRuntimeInputs({
      ...material,
      inputValues: { [slot.id]: 'c' },
    }).nativeNodes.at(-1).parameters,
    { rows: ['a', 'b', 'c'] },
  );
});

test('open native objects keep explicit field prohibitions instead of losing them through additional properties', async () => {
  const base = await nativeNodeAdditionFixture();
  const capability = createJsonOutputCapability({
    name: 'open-mixed',
    description: 'Open original numeric values',
    parametersSchema: z
      .object({ count: z.number(), enabled: z.boolean() })
      .catchall(z.number()),
  });
  const context = {
    ...base.context,
    capabilities: [...base.context.capabilities, capability],
  };
  const input = {
    ...base,
    context,
    plan: connectionEditPlan({ ...base, context }, [
      { kind: 'add-native-node', capability: capability.name },
    ]),
    allowRuntimeParameters: true,
  };
  input.stepId = input.plan.steps[0].id;
  const parameterOwnership = ownershipContract(input, {
    status: 'runtime-fields',
    pointers: ['/count'],
  });
  assert.equal(
    parameterOwnership.literalParametersSchema.properties.count,
    false,
  );
  const stage = { ...input, parameterOwnership };
  assert.throws(
    () =>
      resolve(
        stage,
        nativeAdditionProposal(input, {
          status: 'provided',
          parameters: { enabled: false, count: 7 },
        }),
      ),
    /JSON Schema/,
  );
  assert.equal(
    resolve(
      stage,
      nativeAdditionProposal(input, {
        status: 'provided',
        parameters: { enabled: false, explicitExtra: 0 },
      }),
    ).status,
    'ready',
  );
});

test('selected native addition keeps code-owned identity, sibling settings and the complete original parameter contract', async () => {
  const input = await nativeNodeAdditionFixture('typed-context', true);
  const original = globalThis.structuredClone(input.draft);
  const description = describe(input);
  assert.equal(description.nodeId, input.plan.steps[0].newNodeId);
  assert.ok(
    !original.nativeNodes.some((node) => node.id === description.nodeId),
  );
  assert.equal(description.parameterMode, 'values');
  assert.ok(description.parametersSchema.properties.count);
  const proposal = nativeAdditionProposal(
    input,
    { status: 'provided', parameters: nativeAdditionParameters },
    ['config', 'source'],
  );
  const result = resolve(input, proposal);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.proposal, proposal);
  assert.equal(Object.hasOwn(result.decision, 'sourceMessageIds'), false);
  assert.equal(
    result.decision.sources[0].quote,
    input.context.messages.find((message) => message.id === 'edit-1').text,
  );
  assert.ok(
    result.decision.explanation.evidence.some(
      (evidence) => evidence.kind === 'oas',
    ),
  );
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.equal(candidate.status, 'changed');
  assert.equal(
    candidate.draft.nativeNodes.length,
    original.nativeNodes.length + 1,
  );
  assert.deepEqual(
    candidate.draft.nativeNodes.slice(0, original.nativeNodes.length),
    original.nativeNodes,
  );
  assert.deepEqual(candidate.draft.apiCalls, original.apiCalls);
  assert.deepEqual(candidate.draft.edges, original.edges);
  assert.deepEqual(input.draft, original);
  const artifact = compileN8nWorkflowTemplate({
    draft: candidate.draft,
    context: input.context,
    name: 'Added actual registered native',
  });
  assert.ok(
    artifact.nodeMappings.some(
      (mapping) =>
        mapping.nodeId === description.nodeId && mapping.kind === 'native',
    ),
  );
});

test('two additions of one capability retain distinct allocated IDs rather than model-owned or deduplicated roles', async () => {
  const base = await nativeNodeAdditionFixture();
  const request = base.context.messages.find(
    (message) => message.id === 'edit-1',
  );
  request.text =
    'Add distinct request-context and audit-context nodes, each with count 4, enabled true and nested value new.';
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: ['Request context', 'Audit context'].map((instruction) => ({
        kind: 'add-native-node',
        capability: 'typed-context',
        instruction,
        sources: [
          { kind: 'message', messageId: request.id, quote: request.text },
        ],
      })),
    },
  });
  const input = { ...base, plan };
  const resolutions = [];
  for (const step of plan.steps) {
    const scoped = { ...input, stepId: step.id, resolutions };
    const result = resolve(
      scoped,
      nativeAdditionProposal(scoped, {
        status: 'provided',
        parameters: nativeAdditionParameters,
      }),
    );
    assert.equal(result.status, 'ready');
    resolutions.push(result.resolution);
  }
  const candidate = assembleWorkflowDraftEdit({ ...input, resolutions });
  const ids = plan.steps.map((step) => step.newNodeId);
  assert.equal(new Set(ids).size, 2);
  assert.ok(
    ids.every((id) =>
      candidate.draft.nativeNodes.some((node) => node.id === id),
    ),
  );
});

test('output schema exposes only typed configuration and allowed ownership, never known IDs, capability names or graph metadata', async () => {
  const input = await nativeNodeAdditionFixture();
  const schema = createWorkflowDraftNativeNodeAdditionSchema(input);
  const valid = nativeAdditionProposal(input, {
    status: 'provided',
    parameters: nativeAdditionParameters,
  });
  assert.equal(schema.safeParse(valid).success, true);
  for (const extra of [
    { nodeId: 'invented' },
    { capability: 'if' },
    { edges: [] },
    { fingerprint: 'old' },
    { revision: 0 },
  ])
    assert.equal(
      schema.safeParse({ ...valid, decision: { ...valid.decision, ...extra } })
        .success,
      false,
    );
  assert.equal(
    schema.safeParse(
      nativeAdditionProposal(input, { status: 'runtime-parameters' }),
    ).success,
    false,
  );
  assert.equal(
    schema.safeParse(
      nativeAdditionProposal(input, {
        status: 'provided',
        parameters: { ...nativeAdditionParameters, count: '4' },
      }),
    ).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      ...valid,
      decision: { ...valid.decision, sourceMessageIds: ['initial'] },
    }).success,
    false,
  );
});

test('questions carry stable code-owned IDs and canonical evidence but no partially applicable resolution', async () => {
  const input = await nativeNodeAdditionFixture();
  const proposal = nativeAdditionProposal(input, {
    status: 'needs-clarification',
    message: 'Which nested value should the new node use?',
  });
  const first = resolve(input, proposal);
  const second = resolve(input, proposal);
  assert.equal(first.status, 'needs-clarification');
  assert.equal(Object.hasOwn(first, 'resolution'), false);
  assert.equal(first.questions[0].id, second.questions[0].id);
  assert.equal(first.questions[0].nodeId, input.plan.steps[0].newNodeId);
  assert.deepEqual(stageWorkflowDraftEdit(input).pendingResolutionStepIds, [
    input.stepId,
  ]);
});

test('runtime parameter ownership is explicitly offered, validated and exported as a typed slot', async () => {
  const base = await nativeNodeAdditionFixture();
  const input = { ...base, allowRuntimeParameters: true };
  const result = resolve(
    input,
    nativeAdditionProposal(input, { status: 'runtime-parameters' }),
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.resolution.kind, 'native-runtime');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const artifact = compileN8nWorkflowTemplate({
    draft: candidate.draft,
    context: input.context,
    name: 'Deferred native addition',
  });
  assert.ok(
    artifact.inputSlots.some(
      (slot) =>
        slot.kind === 'native-parameters-input' &&
        slot.nodeId === input.plan.steps[0].newNodeId,
    ),
  );
  const unsupported = {
    ...(await nativeNodeAdditionFixture('if')),
    allowRuntimeParameters: true,
  };
  assert.throws(() =>
    resolve(
      unsupported,
      nativeAdditionProposal(unsupported, { status: 'runtime-parameters' }),
    ),
  );
});

test('fixed empty parameters come from the implementation contract with zero model calls, without filling open objects or defaults', async () => {
  for (const includeExplanations of [false, true]) {
    const input = await nativeNodeAdditionFixture(
      'pass-through',
      includeExplanations,
    );
    assert.equal(describe(input).parameterMode, 'fixed-empty');
    const model = nativeAdditionModel({ not: 'a permitted model result' });
    const result = await generateWorkflowDraftNativeNodeAddition({
      ...input,
      model,
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.resolution.parameters, {});
    assert.equal(model.requests.length, 0);
  }
  const input = await nativeNodeAdditionFixture();
  for (const parametersSchema of [
    z.object({}),
    z.strictObject({ count: z.number().default(4) }),
    z.strictObject({}).catch({}),
  ]) {
    const replacement = createJsonOutputCapability({
      name: 'typed-context',
      description: 'Explicit changed contract',
      parametersSchema,
    });
    const context = {
      ...input.context,
      capabilities: input.context.capabilities.map((capability) =>
        capability.name === replacement.name ? replacement : capability,
      ),
    };
    // A changed original implementation invalidates this draft, so use a fresh empty native set with the actual contract.
    const draft = { ...input.draft, nativeNodes: [] };
    const scoped = { ...input, draft, context };
    scoped.plan = connectionEditPlan(scoped, [
      { kind: 'add-native-node', capability: replacement.name },
    ]);
    scoped.stepId = scoped.plan.steps[0].id;
    assert.equal(describe(scoped).parameterMode, 'values');
  }
});

test('stale contexts, completed steps, wrong decisions and changed model inputs fail without rebase or mutation', async () => {
  const input = await nativeNodeAdditionFixture();
  const proposal = nativeAdditionProposal(input, {
    status: 'provided',
    parameters: nativeAdditionParameters,
  });
  assert.throws(
    () =>
      resolveWorkflowDraftNativeNodeAddition({
        ...input,
        fingerprint: 'stale',
        proposal,
      }),
    /fingerprint is stale/,
  );
  const ready = resolve(input, proposal);
  assert.throws(
    () => describe({ ...input, resolutions: [ready.resolution] }),
    /already has an explicit result/,
  );
  assert.throws(
    () => describe({ ...input, stepId: 'missing' }),
    /add-native-node decision/,
  );
  const original = globalThis.structuredClone(input.draft);
  const model = nativeAdditionModel(proposal, () =>
    input.context.messages.push({
      id: 'late',
      text: 'Changed during generation',
    }),
  );
  await assert.rejects(
    generateWorkflowDraftNativeNodeAddition({ ...input, model }),
    (error) =>
      error instanceof WorkflowDraftNativeNodeAdditionPlanningError &&
      error.failure.stage === 'node-validation' &&
      /stale|context/.test(error.cause.message),
  );
  assert.deepEqual(input.draft, original);
  assert.equal(model.requests.length, 1);
});

test('invalid explicit references, pointers and source evidence are rejected before assembly', async () => {
  const input = await nativeNodeAdditionFixture('if', true);
  const parameters = {
    combinator: 'and',
    conditions: [
      {
        left: { source: 'response', nodeId: 'source', pointer: '/value' },
        operator: 'equals',
        right: { source: 'literal', value: 'expected' },
      },
    ],
  };
  const valid = nativeAdditionProposal(
    input,
    { status: 'provided', parameters },
    ['source'],
  );
  assert.equal(resolve(input, valid).status, 'ready');
  for (const left of [
    {
      source: 'response',
      nodeId: input.plan.steps[0].newNodeId,
      pointer: '/value',
    },
    { source: 'response', nodeId: 'source', pointer: '/undeclared' },
    { source: 'node-output', nodeId: 'source', pointer: '/value' },
  ])
    assert.throws(() =>
      resolve(
        input,
        nativeAdditionProposal(
          input,
          {
            status: 'provided',
            parameters: {
              ...parameters,
              conditions: [{ ...parameters.conditions[0], left }],
            },
          },
          ['source'],
        ),
      ),
    );
  assert.throws(() =>
    resolve(input, {
      ...valid,
      decision: {
        ...valid.decision,
        explanation: {
          ...valid.decision.explanation,
          evidence: [{ kind: 'source', nodeId: 'missing' }],
        },
      },
    }),
  );
});

test('an added IF is not silently wired: explicit SDK-valid connection edits place it before the existing consumer', async () => {
  const input = await nativeNodeAdditionFixture('if');
  input.context.messages.find((message) => message.id === 'edit-1').text =
    'Insert an IF between source and follow. Keep literal values and independent roots.';
  input.plan = connectionEditPlan(input, [
    { kind: 'add-native-node', capability: 'if' },
    { kind: 'revise-connections', nodeIds: ['source', 'follow'] },
  ]);
  input.stepId = input.plan.steps[0].id;
  const parameters = {
    combinator: 'and',
    conditions: [
      {
        left: { source: 'response', nodeId: 'source', pointer: '/value' },
        operator: 'equals',
        right: { source: 'literal', value: 'expected' },
      },
    ],
  };
  const result = resolve(
    input,
    nativeAdditionProposal(input, { status: 'provided', parameters }),
  );
  const staged = { ...input, resolutions: [result.resolution] };
  assert.throws(
    () => assembleWorkflowDraftEdit(staged),
    /not available on every incoming route/,
  );
  const description = describeWorkflowDraftConnectionEdit(staged);
  assert.equal(description.status, 'ready');
  const oldEdge = description.existingEdges.find(
    (edge) => edge.edge.from === 'source' && edge.edge.to === 'follow',
  );
  const id = input.plan.steps[0].newNodeId;
  const connected = resolveWorkflowDraftConnectionEdit({
    ...staged,
    fingerprint: description.fingerprint,
    proposal: connectionEditProposal(input, [
      { kind: 'remove', edgeId: oldEdge.id },
      addConnection('source', id),
      addConnection(id, 'follow', 'true'),
    ]),
  });
  assert.equal(connected.status, 'ready');
  const artifact = compileN8nWorkflowTemplate({
    draft: connected.candidate.draft,
    context: input.context,
    name: 'Explicit new native instance and connections',
  });
  assert.ok(
    artifact.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.if' && node.id === id,
    ),
  );
  assert.ok(
    artifact.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length === input.draft.apiCalls.length,
  );
});

test('material-dependent additions bind actual supplied native outputs and never captured or missing sources', async () => {
  const base = await nativeNodeAdditionFixture();
  const producer = createJsonOutputCapability({
    name: 'array-context',
    description: 'Explicit source array',
    parametersSchema: z.strictObject({ values: z.array(z.number()) }),
  });
  base.context.capabilities.push(producer);
  base.draft.nativeNodes.push({
    id: 'array-source',
    capability: producer.name,
    parameters: { values: [1, 1, 2] },
  });
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes: base.draft.nativeNodes,
    capabilities: base.context.capabilities,
    apiNodeNames: {},
  });
  const nativeArray = createNativeArrayCapability({
    sources: nativeOutputSources,
    itemMode: 'linked',
  });
  const input = {
    ...base,
    context: {
      ...base.context,
      capabilities: [...base.context.capabilities, nativeArray],
    },
  };
  input.plan = connectionEditPlan(input, [
    { kind: 'add-native-node', capability: nativeArray.name },
  ]);
  input.stepId = input.plan.steps[0].id;
  const valid = resolve(
    input,
    nativeAdditionProposal(input, {
      status: 'provided',
      parameters: { sourceNodeId: 'array-source', pointer: '/values' },
    }),
  );
  assert.equal(valid.status, 'ready');
  const scoped = { ...input, resolutions: [valid.resolution] };
  const connections = describeWorkflowDraftConnectionEdit(scoped);
  const linked = resolveWorkflowDraftConnectionEdit({
    ...scoped,
    fingerprint: connections.fingerprint,
    proposal: connectionEditProposal(input, [
      addConnection('array-source', input.plan.steps[0].newNodeId),
    ]),
  });
  assert.equal(linked.status, 'ready');
  assert.ok(
    compileN8nWorkflowTemplate({
      draft: linked.candidate.draft,
      context: input.context,
      name: 'Material-bound added split',
      itemMode: 'linked',
    }).workflow.nodes.some((node) => node.type === 'n8n-nodes-base.splitOut'),
  );
  assert.throws(
    () =>
      resolve(
        input,
        nativeAdditionProposal(input, {
          status: 'provided',
          parameters: { sourceNodeId: 'config', pointer: '/not-an-array' },
        }),
      ),
    /array|pointer|declar/i,
  );
  assert.throws(() =>
    resolve(
      input,
      nativeAdditionProposal(input, {
        status: 'provided',
        parameters: { sourceNodeId: 'old-captured', pointer: '/nested' },
      }),
    ),
  );
});

test('original Zod refinements, defaults, coercion and transformations are never weakened into accepted model values', async () => {
  for (const [parametersSchema, parameters, serializable] of [
    [
      z.strictObject({ count: z.number().refine((value) => value > 0) }),
      { count: -1 },
      true,
    ],
    [z.strictObject({ count: z.coerce.number() }), { count: '4' }, true],
    [z.strictObject({ count: z.number().default(4) }), {}, true],
    [
      z
        .strictObject({ count: z.number() })
        .transform((value) => ({ count: value.count + 1 })),
      { count: 4 },
      false,
    ],
  ]) {
    const base = await nativeNodeAdditionFixture();
    const capability = createJsonOutputCapability({
      name: 'validation-contract',
      description: 'Explicit original validator',
      parametersSchema,
    });
    const context = {
      ...base.context,
      capabilities: [...base.context.capabilities, capability],
    };
    const input = { ...base, context };
    input.plan = connectionEditPlan(input, [
      { kind: 'add-native-node', capability: capability.name },
    ]);
    input.stepId = input.plan.steps[0].id;
    const proposal = nativeAdditionProposal(input, {
      status: 'provided',
      parameters,
    });
    assert.throws(() => resolve(input, proposal));
    const model = nativeAdditionModel(proposal);
    await assert.rejects(
      generateWorkflowDraftNativeNodeAddition({ ...input, model }),
      serializable
        ? (error) =>
            error instanceof WorkflowDraftNativeNodeAdditionPlanningError &&
            error.failure.output === proposal
        : /Transforms cannot be represented in JSON Schema/,
    );
    assert.equal(model.requests.length, serializable ? 1 : 0);
  }
});

test('model schema and transport failures preserve the original output/cause and never retry', async () => {
  const input = await nativeNodeAdditionFixture();
  const output = nativeAdditionProposal(input, {
    status: 'provided',
    parameters: { ...nativeAdditionParameters, count: '4' },
  });
  const model = nativeAdditionModel(output);
  await assert.rejects(
    generateWorkflowDraftNativeNodeAddition({ ...input, model }),
    (error) =>
      error instanceof WorkflowDraftNativeNodeAdditionPlanningError &&
      error.failure.output === output &&
      error.failure.stage === 'proposal-schema',
  );
  assert.equal(model.requests.length, 1);
  const transport = new Error('Fixture transport failure');
  const failing = nativeAdditionModel(output, () => {
    throw transport;
  });
  await assert.rejects(
    generateWorkflowDraftNativeNodeAddition({ ...input, model: failing }),
    (error) => error === transport,
  );
  assert.equal(failing.requests.length, 1);
});

test('recursive original Zod contracts keep their local scope in the model schema and validate unchanged nested values', async () => {
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const branch = z.lazy(() =>
    z.strictObject({ value: z.string(), children: z.array(branch) }),
  );
  const parametersSchema = z.strictObject({ tree: branch });
  const capability = createJsonOutputCapability({
    name: 'tree-output',
    description: 'Exact recursive typed parameters',
    parametersSchema,
  });
  const base = await nativeNodeAdditionFixture();
  const input = {
    ...base,
    context: {
      ...base.context,
      capabilities: [...base.context.capabilities, capability],
    },
  };
  input.plan = connectionEditPlan(input, [
    { kind: 'add-native-node', capability: capability.name },
  ]);
  input.stepId = input.plan.steps[0].id;
  const parameters = {
    tree: { value: 'root', children: [{ value: 'child', children: [] }] },
  };
  const proposal = nativeAdditionProposal(input, {
    status: 'provided',
    parameters,
  });
  const model = nativeAdditionModel(proposal);
  const result = await generateWorkflowDraftNativeNodeAddition({
    ...input,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resolution.parameters, parameters);
  const ajv = new Ajv2020({ strict: false });
  const schema = model.requests[0].schema;
  assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
  const validate = ajv.compile(schema);
  assert.equal(validate(proposal), true, JSON.stringify(validate.errors));
  assert.equal(
    validate(
      nativeAdditionProposal(input, {
        status: 'provided',
        parameters: {
          tree: { value: 'root', children: [{ value: 4, children: [] }] },
        },
      }),
    ),
    false,
  );
});
