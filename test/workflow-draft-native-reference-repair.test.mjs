import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  describeNativeReferenceBindings,
  describeWorkflowDraftNativeReferenceRepair,
  createWorkflowDraftNativeReferenceRepairSchema,
  resolveWorkflowDraftNativeReferenceRepair,
  stageWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  createWorkflowDraft,
  describeWorkflowDraftApiBindingEdit,
} from '@openapi-flow/core';
import {
  planWorkflowDraftNativeReferenceRepair,
  WorkflowDraftNativeReferenceRepairPlanningError,
} from '@openapi-flow/langchain';
import {
  resolveN8nNativeFeatures,
  N8nNativeFeature,
  createExclusiveBranchMergeCapability,
} from '@openapi-flow/n8n';
import {
  nativeReferenceRepairFixture,
  nativeReferenceProposal,
  resolveNativeReferences,
} from './fixtures/workflow-draft-native-reference-repair-fixture.mjs';
import {
  nativeFeatureRegistryFixture,
  nativeFeatureParameters,
} from './fixtures/native-feature-registry-fixture.mjs';
import { nativeParameterModel } from './fixtures/workflow-draft-native-parameter-edit-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import { collectNativeReferenceRepairPointers } from '../packages/core/dist/draft/edits/native/repairs/collect-native-reference-repair-pointers.js';

test('reference repair authority closes only over implementation-declared shared physical locations', () => {
  const bindings = [
    {
      nodeIdPointer: '/producer',
      reference: { source: 'exclusive-output', nodeId: 'branch' },
    },
    {
      nodeIdPointer: '/producer',
      valuePointer: '/dataPointer',
      reference: {
        source: 'node-output',
        nodeId: 'branch',
        pointer: '/payload',
      },
    },
    {
      nodeIdPointer: '/independent',
      valuePointer: '/otherPointer',
      reference: { source: 'response', nodeId: 'other', pointer: '/value' },
    },
  ];
  assert.deepEqual(
    collectNativeReferenceRepairPointers(
      bindings,
      new Set(),
      new Set(['branch']),
    ),
    ['/dataPointer', '/producer'],
  );
  assert.deepEqual(
    collectNativeReferenceRepairPointers(
      bindings,
      new Set(['other']),
      new Set(),
    ),
    ['/independent', '/otherPointer'],
  );
  assert.deepEqual(
    collectNativeReferenceRepairPointers(bindings, new Set(), new Set()),
    [],
  );
});

test('all registered built-ins declare implementation-owned data/control reference locations', async () => {
  const registry = resolveN8nNativeFeatures(
    await nativeFeatureRegistryFixture(),
  );
  assert.equal(
    registry.capabilities.length,
    Object.keys(N8nNativeFeature).length,
  );
  for (const [index, capability] of registry.capabilities.entries()) {
    const node = {
      id: `native-${index}`,
      capability: capability.name,
      parameters:
        nativeFeatureParameters[
          capability.name === 'original-context'
            ? N8nNativeFeature.JsonOutput
            : capability.name
        ],
    };
    const bindings = describeNativeReferenceBindings({ node, capability });
    assert.ok(Array.isArray(bindings));
    if (capability.name === N8nNativeFeature.JoinApiItems) {
      assert.deepEqual(
        bindings.map((binding) => binding.nodeIdPointer),
        ['/sourceCallIds/0', '/sourceCallIds/1', '/scopeNodeId'],
      );
      assert.ok(
        bindings.every(
          (binding) =>
            binding.valuePointer === undefined &&
            binding.reference.pointer === '',
        ),
      );
    }
    if (capability.name === N8nNativeFeature.RejoinExclusiveBranches)
      assert.deepEqual(bindings, [
        {
          nodeIdPointer: '/sourceNodeId',
          reference: { source: 'exclusive-output', nodeId: 'if-branch' },
        },
      ]);
  }
  const capability = resolveN8nNativeFeatures({
    features: [N8nNativeFeature.If],
  }).capabilities[0];
  const reference = { source: 'response', nodeId: 'source', pointer: '/value' };
  const node = {
    id: 'gate',
    capability: 'if',
    parameters: {
      combinator: 'and',
      conditions: [{ left: reference, right: reference, operator: 'equals' }],
    },
  };
  const declared = describeNativeReferenceBindings({ node, capability });
  assert.equal(declared.length, 2);
  for (const parameterReferenceBindings of [
    undefined,
    () => [],
    () => [declared[0], declared[0]],
    () => [{ ...declared[0], nodeIdPointer: '/conditions/0/operator' }],
    () => [{ ...declared[0], valuePointer: '/conditions/0/operator' }],
  ])
    assert.throws(
      () =>
        describeNativeReferenceBindings({
          node,
          capability: { ...capability, parameterReferenceBindings },
        }),
      /reference|binding|location|declare/i,
    );
});

test('one bounded repair changes only a declared pointer and preserves all other parameters and explicit DAG', async () => {
  const input = await nativeReferenceRepairFixture();
  const before = globalThis.structuredClone(input.draft);
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  assert.deepEqual(context.task.targetPointers, [
    '/conditions/0/left/nodeId',
    '/conditions/0/left/pointer',
  ]);
  assert.deepEqual(
    context.bindings.map((binding) => binding.reference),
    [{ source: 'response', nodeId: 'source', pointer: '/value' }],
  );
  assert.ok(
    context.sources.values.some(
      (source) =>
        source.nodeId === 'source' &&
        source.operation.path === '/replacement/{id}',
    ),
  );
  assert.ok(
    !context.sources.exclusiveOutputs.some(
      (source) => source.nodeId === 'gate',
    ),
  );
  const result = resolveNativeReferences(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
  ]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.repair.edits, [
    { kind: 'set', pointer: '/conditions/0/left/pointer', value: '/renamed' },
  ]);
  const partial = { ...input, repairs: [result.repair] };
  assert.equal(
    stageWorkflowDraftEdit(partial).pendingRepairs.some(
      (task) => task.nodeId === 'gate',
    ),
    false,
  );
  assert.throws(() => assembleWorkflowDraftEdit(partial), /repair/i);
  const checkTask = stageWorkflowDraftEdit(partial).pendingRepairs.find(
    (task) => task.nodeId === 'check',
  );
  const checkResult = resolveNativeReferences(
    { ...partial, taskId: checkTask.id },
    [{ kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' }],
  );
  const followTask = stageWorkflowDraftEdit(partial).pendingRepairs.find(
    (task) => task.nodeId === 'follow',
  );
  const complete = {
    ...partial,
    repairs: [
      result.repair,
      checkResult.repair,
      {
        taskId: followTask.id,
        kind: 'api-bindings',
        edits: [
          {
            kind: 'set',
            binding: {
              ...before.apiCalls[1].bindings[0],
              sourcePointer: '/renamed',
            },
          },
        ],
      },
    ],
  };
  const assembled = assembleWorkflowDraftEdit(complete);
  assert.deepEqual(assembled.draft.edges, before.edges);
  const expected = globalThis.structuredClone(before.nativeNodes);
  expected[0].parameters.conditions[0].left.pointer = '/renamed';
  expected[1].parameters.checks[0].left.pointer = '/renamed';
  assert.deepEqual(assembled.draft.nativeNodes, expected);
  assert.deepEqual(input.draft, before);
  assert.throws(
    () =>
      stageWorkflowDraftEdit({
        ...input,
        repairs: [
          {
            ...result.repair,
            edits: [
              {
                kind: 'set',
                pointer: '/conditions/0/operator',
                value: 'notEquals',
              },
            ],
          },
        ],
      }),
    /unrelated native parameter/,
  );
});

test('keeps validate actual new contracts; missing mappings become questions without partial repairs', async () => {
  const input = await nativeReferenceRepairFixture();
  assert.throws(
    () => resolveNativeReferences(input, [{ kind: 'keep' }]),
    /pointer|value|schema/i,
  );
  const question = resolveNativeReferences(input, [
    {
      kind: 'needs-clarification',
      message: 'Which renamed field is the intended comparison value?',
    },
  ]);
  assert.equal(question.status, 'needs-clarification');
  assert.equal(Object.hasOwn(question, 'repair'), false);
  const keptInput = await nativeReferenceRepairFixture(false, '/lookup/{id}');
  const kept = resolveNativeReferences(keptInput, [{ kind: 'keep' }]);
  assert.equal(kept.status, 'ready');
  assert.deepEqual(kept.repair.edits, []);
});

test('model schema fixes reference keys and actual source kinds, rejects extra settings, pointers and evidence', async () => {
  const input = await nativeReferenceRepairFixture(true);
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  const schema = createWorkflowDraftNativeReferenceRepairSchema(context);
  for (const choice of [
    { kind: 'bind', sourceNodeId: 'invented', sourcePointer: '/renamed' },
    { kind: 'bind', sourceNodeId: 'gate', sourcePointer: '/renamed' },
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/body/renamed' },
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/~2' },
    { kind: 'bind', sourceNodeId: 'source' },
    { kind: 'keep', operator: 'notEquals' },
  ])
    assert.throws(() => resolveNativeReferences(input, [choice]));
  const proposal = nativeReferenceProposal(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
  ]);
  assert.equal(schema.safeParse(proposal).success, true);
  assert.equal(schema.safeParse({ decisions: {} }).success, false);
  assert.equal(schema.safeParse({ ...proposal, edits: [] }).success, false);
  assert.equal(
    schema.safeParse({
      decisions: { ...proposal.decisions, invented: { kind: 'keep' } },
    }).success,
    false,
  );
  const resolved = resolveWorkflowDraftNativeReferenceRepair({
    ...input,
    fingerprint: context.fingerprint,
    proposal,
  });
  const actualEvidence = resolved.decisions[context.bindings[0].id];
  assert.equal(actualEvidence.sources[0].quote, context.messages[0].text);
  assert.deepEqual(actualEvidence.explanation.evidence[1], {
    kind: 'oas',
    operation: input.replacement.key,
    pointer: '',
  });
  const quoted = globalThis.structuredClone(proposal);
  quoted.decisions[context.bindings[0].id].explanation.evidence[0].quote =
    'A schema field is not a user quotation';
  assert.equal(schema.safeParse(quoted).success, false);
  proposal.decisions[context.bindings[0].id].sourceMessageIds[0] =
    'unknown-message';
  assert.throws(
    () =>
      resolveWorkflowDraftNativeReferenceRepair({
        ...input,
        fingerprint: context.fingerprint,
        proposal,
      }),
    (error) =>
      error instanceof z.ZodError &&
      JSON.stringify(error.issues).includes('sourceMessageIds'),
  );
  assert.throws(
    () =>
      resolveWorkflowDraftNativeReferenceRepair({
        ...input,
        fingerprint: 'stale',
        proposal,
      }),
    /stale/,
  );
});

test('unregistered reference metadata fails explicitly and unavailable sources cannot be invented', async () => {
  const input = await nativeReferenceRepairFixture();
  const ifCapability = input.context.capabilities.find(
    (capability) => capability.name === 'if',
  );
  delete ifCapability.parameterReferenceBindings;
  input.taskId = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'gate',
  ).id;
  assert.throws(
    () => describeWorkflowDraftNativeReferenceRepair(input),
    /parameterReferenceBindings/,
  );
});

test('code resolves selected message and instance IDs into original unique contract evidence without model quotations', async () => {
  const input = await nativeReferenceRepairFixture(true);
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  const proposal = nativeReferenceProposal(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
  ]);
  const id = context.bindings[0].id;
  proposal.decisions[id].explanation.evidence = [
    { kind: 'source', nodeId: 'follow' },
    { kind: 'source', nodeId: 'independent' },
    { kind: 'message', messageId: 'edit-1' },
  ];
  const result = resolveWorkflowDraftNativeReferenceRepair({
    ...input,
    fingerprint: context.fingerprint,
    proposal,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.decisions[id].explanation.evidence, [
    { kind: 'oas', operation: input.lookup.key, pointer: '' },
    { kind: 'message', messageId: 'edit-1', quote: context.messages[0].text },
  ]);
  assert.deepEqual(result.proposal, proposal);
  const bad = globalThis.structuredClone(proposal);
  bad.decisions[id].explanation.evidence[0].nodeId = 'invented';
  assert.throws(() =>
    resolveWorkflowDraftNativeReferenceRepair({
      ...input,
      fingerprint: context.fingerprint,
      proposal: bad,
    }),
  );
  bad.decisions[id].explanation.evidence[0].nodeId = 'follow';
  bad.decisions[id].explanation.evidence.push({
    kind: 'source',
    nodeId: 'follow',
  });
  assert.throws(() =>
    resolveWorkflowDraftNativeReferenceRepair({
      ...input,
      fingerprint: context.fingerprint,
      proposal: bad,
    }),
  );
});

test('fixed implementation pointers stay out of model output and no-source schemas offer only keep/question', async () => {
  const input = await nativeReferenceRepairFixture();
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  const fixed = {
    ...context,
    bindings: context.bindings.map(({ valuePointer, ...binding }) => {
      assert.ok(valuePointer);
      return binding;
    }),
  };
  const schema = createWorkflowDraftNativeReferenceRepairSchema(fixed);
  const id = fixed.bindings[0].id;
  const evidence = nativeReferenceProposal(input, [{ kind: 'keep' }]).decisions[
    id
  ];
  assert.equal(
    schema.safeParse({
      decisions: {
        [id]: { ...evidence, kind: 'bind', sourceNodeId: 'source' },
      },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      decisions: {
        [id]: {
          ...evidence,
          kind: 'bind',
          sourceNodeId: 'source',
          sourcePointer: '/renamed',
        },
      },
    }).success,
    false,
  );
  const unavailable = createWorkflowDraftNativeReferenceRepairSchema({
    ...context,
    sources: { values: [], exclusiveOutputs: [] },
  });
  assert.equal(
    unavailable.safeParse(
      nativeReferenceProposal(input, [
        { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
      ]),
    ).success,
    false,
  );
  assert.equal(
    unavailable.safeParse(
      nativeReferenceProposal(input, [
        { kind: 'needs-clarification', message: 'Provide the source.' },
      ]),
    ).success,
    true,
  );
});

test('shared physical source locations reject conflicting decisions and a question cannot conceal an invalid keep', async () => {
  const input = await nativeReferenceRepairFixture();
  const pairSchema = z.strictObject({
    sourceId: z.string(),
    first: z.string(),
    second: z.string(),
  });
  input.context.capabilities.push({
    name: 'reference-pair',
    description: 'Two references sharing one explicit producer setting.',
    parametersSchema: pairSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    responseReferences: (value) => {
      const parameters = pairSchema.parse(value);
      return [parameters.first, parameters.second].map((pointer) => ({
        source: 'response',
        nodeId: parameters.sourceId,
        pointer,
      }));
    },
    outputSchema: () => ({ type: 'string' }),
    parameterReferenceBindings: (value) => {
      const parameters = pairSchema.parse(value);
      return ['first', 'second'].map((field) => ({
        nodeIdPointer: '/sourceId',
        valuePointer: `/${field}`,
        reference: {
          source: 'response',
          nodeId: parameters.sourceId,
          pointer: parameters[field],
        },
      }));
    },
  });
  const { revision, approvals, requirementHistory, ...content } = input.draft;
  assert.ok(Array.isArray(requirementHistory));
  assert.equal(revision, 0);
  assert.deepEqual(approvals, []);
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      ...content,
      nativeNodes: [
        {
          id: 'pair',
          capability: 'reference-pair',
          parameters: { sourceId: 'source', first: '/value', second: '/value' },
        },
      ],
      edges: [
        { from: 'source', output: 'main', to: 'pair', input: 'main' },
        ...content.edges.filter((edge) => edge.to === 'follow'),
      ],
    },
  });
  input.plan = connectionEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
  ]);
  input.resolutions = [
    {
      stepId: input.plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'replacement-id' } },
      bindings: [],
    },
  ];
  input.taskId = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'pair',
  ).id;
  const followScope = {
    kind: 'repair',
    taskId: stageWorkflowDraftEdit(input).pendingRepairs.find(
      (task) => task.nodeId === 'follow',
    ).id,
  };
  assert.equal(
    describeWorkflowDraftApiBindingEdit({
      ...input,
      scope: followScope,
    }).sourceCandidates.some((source) => source.nodeId === 'pair'),
    false,
  );
  assert.throws(
    () =>
      resolveNativeReferences(input, [
        { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
        { kind: 'bind', sourceNodeId: 'independent', sourcePointer: '/value' },
      ]),
    /conflict.*shared parameter/,
  );
  assert.throws(
    () =>
      resolveNativeReferences(input, [
        { kind: 'needs-clarification', message: 'Which first field?' },
        { kind: 'keep' },
      ]),
    /pointer|schema|value/i,
  );
  const partial = resolveNativeReferences(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
    { kind: 'needs-clarification', message: 'Which second field?' },
  ]);
  assert.equal(partial.status, 'needs-clarification');
  assert.equal(Object.hasOwn(partial, 'repair'), false);
  const result = resolveNativeReferences(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
  ]);
  assert.deepEqual(result.repair.edits, [
    { kind: 'set', pointer: '/first', value: '/renamed' },
    { kind: 'set', pointer: '/second', value: '/renamed' },
  ]);
  assert.equal(
    describeWorkflowDraftApiBindingEdit({
      ...input,
      repairs: [result.repair],
      scope: followScope,
    }).sourceCandidates.some((source) => source.nodeId === 'pair'),
    true,
  );
  // Distinct fixed references may intentionally share the producer setting.
  const pair = input.context.capabilities.find(
    (capability) => capability.name === 'reference-pair',
  );
  pair.responseReferences = (value) => {
    const parameters = pairSchema.parse(value);
    return ['/value', ''].map((pointer) => ({
      source: 'response',
      nodeId: parameters.sourceId,
      pointer,
    }));
  };
  pair.parameterReferenceBindings = (value) =>
    pair
      .responseReferences(value)
      .map((reference) => ({ nodeIdPointer: '/sourceId', reference }));
  input.plan = connectionEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
  ]);
  input.resolutions[0].stepId = input.plan.steps[0].id;
  input.taskId = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'pair',
  ).id;
  const fixedContext = describeWorkflowDraftNativeReferenceRepair(input);
  assert.equal(
    new Set(fixedContext.bindings.map((binding) => binding.id)).size,
    2,
  );
  const fixedResult = resolveNativeReferences(input, [
    { kind: 'bind', sourceNodeId: 'independent' },
    { kind: 'bind', sourceNodeId: 'independent' },
  ]);
  assert.deepEqual(fixedResult.repair.edits, [
    { kind: 'set', pointer: '/sourceId', value: 'independent' },
  ]);
});

test('control source removal schedules rejoin repair; only actual stable exclusive producers are available', async () => {
  const input = await nativeReferenceRepairFixture();
  const { revision, approvals, requirementHistory, ...content } = input.draft;
  assert.ok(Array.isArray(requirementHistory));
  assert.equal(revision, 0);
  assert.deepEqual(approvals, []);
  input.context.capabilities.push(createExclusiveBranchMergeCapability());
  const condition = {
    combinator: 'and',
    conditions: [
      {
        left: { source: 'literal', value: 0 },
        right: { source: 'literal', value: 0 },
        operator: 'equals',
      },
    ],
  };
  const nodes = ['old-branch', 'new-branch'].map((id) => ({
    id,
    capability: 'if',
    parameters: condition,
  }));
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      ...content,
      apiCalls: [],
      nativeNodes: [
        ...nodes,
        {
          id: 'rejoin',
          capability: 'rejoin-exclusive-branches',
          parameters: { sourceNodeId: 'old-branch' },
        },
      ],
      edges: [
        { from: 'old-branch', output: 'true', to: 'rejoin', input: 'input1' },
        { from: 'old-branch', output: 'false', to: 'rejoin', input: 'input2' },
      ],
    },
  });
  input.plan = connectionEditPlan(input, [
    { kind: 'remove-node', nodeId: 'old-branch' },
  ]);
  input.resolutions = [];
  const task = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'rejoin',
  );
  assert.ok(task);
  input.taskId = task.id;
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  assert.deepEqual(
    context.sources.exclusiveOutputs.map((source) => source.nodeId),
    ['new-branch'],
  );
  assert.deepEqual(task.targetPointers, ['/sourceNodeId']);
  const result = resolveNativeReferences(input, [
    { kind: 'bind', sourceNodeId: 'new-branch' },
  ]);
  assert.deepEqual(result.repair.edits, [
    { kind: 'set', pointer: '/sourceNodeId', value: 'new-branch' },
  ]);
  assert.throws(
    () => resolveNativeReferences(input, [{ kind: 'keep' }]),
    /exclusive-output source/,
  );
  assert.throws(() =>
    resolveNativeReferences(input, [
      { kind: 'bind', sourceNodeId: 'new-branch', sourcePointer: '' },
    ]),
  );
});

test('one model call preserves structured failure, cause and stale-stage boundary without retries', async () => {
  const input = await nativeReferenceRepairFixture();
  const proposal = nativeReferenceProposal(input, [
    { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
  ]);
  const model = nativeParameterModel([proposal]);
  const result = await planWorkflowDraftNativeReferenceRepair({
    ...input,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].messages[0].constructor.name, 'SystemMessage');
  assert.equal(model.requests[0].messages[1].constructor.name, 'HumanMessage');
  const payload = JSON.parse(model.requests[0].messages[1].content);
  for (const name of ['stage', 'fingerprint', 'taskId', 'revision', 'planId'])
    assert.equal(Object.hasOwn(payload, name), false);
  assert.equal(Object.hasOwn(model.requests[0].schema, '~standard'), false);
  const bad = nativeParameterModel([{ decisions: {} }]);
  await assert.rejects(
    () => planWorkflowDraftNativeReferenceRepair({ ...input, model: bad }),
    (error) =>
      error instanceof WorkflowDraftNativeReferenceRepairPlanningError &&
      error.failure.stage === 'proposal-schema' &&
      error.cause instanceof Error,
  );
  assert.equal(bad.requests.length, 1);
  const stale = nativeParameterModel([proposal], () => {
    input.context.messages.at(-1).text += ' Changed after submission.';
  });
  await assert.rejects(
    () => planWorkflowDraftNativeReferenceRepair({ ...input, model: stale }),
    (error) =>
      error instanceof WorkflowDraftNativeReferenceRepairPlanningError &&
      error.failure.stage === 'proposal-validation' &&
      /stale/.test(error.cause.message),
  );
  assert.equal(stale.requests.length, 1);
});
