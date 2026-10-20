import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  stageWorkflowDraftEdit,
  prepareWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  describeWorkflowDraftApiBindingEdit,
  resolveWorkflowDraftApiBindingEdit,
  createWorkflowDraftApiBindingEditProposalSchema,
  createWorkflowDraft,
  inspectDraftReadiness,
  validateApiBindingAssignment,
  validateApiBindingAssignments,
} from '@openapi-flow/core';
import {
  planWorkflowDraftApiBindingEdit,
  WorkflowDraftApiBindingEditPlanningError,
} from '@openapi-flow/langchain';
import {
  bindingEditPlan,
  workflowDraftApiBindingEditFixture,
  bindingEditProposal,
  bindingEditModel,
  independentBindingDecision,
} from './fixtures/workflow-draft-api-binding-edit-fixture.mjs';

function resolve(input, decisions) {
  const described = describeWorkflowDraftApiBindingEdit(input);
  return resolveWorkflowDraftApiBindingEdit({
    ...input,
    fingerprint: described.fingerprint,
    proposal: bindingEditProposal(input, decisions),
  });
}
function replaceSource(input, operation = input.replacement) {
  const plan = bindingEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: operation.key,
    },
  ]);
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'actual-replacement-id' } },
      bindings: [],
    },
  ];
  const base = { ...input, plan, resolutions };
  const stage = stageWorkflowDraftEdit(base);
  const task = stage.pendingRepairs.find((task) => task.nodeId === 'follow');
  assert.ok(task);
  return { ...base, scope: { kind: 'repair', taskId: task.id } };
}

test('staging names unfinished results without fake canonical metadata or weakening complete assembly', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const stage = stageWorkflowDraftEdit(input);
  assert.equal(stage.kind, 'unvalidated-edit-stage');
  assert.deepEqual(stage.pendingResolutionStepIds, [input.plan.steps[0].id]);
  assert.equal(Object.hasOwn(stage.content, 'revision'), false);
  assert.equal(Object.hasOwn(stage.content, 'requirementHistory'), false);
  assert.equal(Object.hasOwn(stage.content, 'approvals'), false);
  assert.deepEqual(stage.content.apiCalls, before.apiCalls);
  assert.throws(
    () => prepareWorkflowDraftEdit(input),
    /Missing draft edit resolution/,
  );
  assert.throws(
    () => assembleWorkflowDraftEdit(input),
    /Missing draft edit resolution/,
  );
  assert.deepEqual(input.draft, before);
});

test('one bounded source decision preserves all other values and identities; connections remain explicit', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const model = bindingEditModel(
    bindingEditProposal(input, [independentBindingDecision]),
  );
  const result = await planWorkflowDraftApiBindingEdit({ ...input, model });
  assert.equal(result.status, 'ready');
  assert.equal(result.kind, 'step');
  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].messages[0].constructor.name, 'SystemMessage');
  assert.equal(model.requests[0].messages[1].constructor.name, 'HumanMessage');
  assert.equal(Object.hasOwn(model.requests[0].schema, '~standard'), false);
  const payload = JSON.parse(model.requests[0].messages[1].content);
  assert.equal(
    payload.sourceCandidates.find(
      (candidate) => candidate.nodeId === 'independent',
    ).preparation.request.values.path.id,
    'independent-id',
  );
  for (const name of ['planId', 'revision', 'stage', 'scope', 'fingerprint'])
    assert.equal(Object.hasOwn(payload, name), false);
  assert.deepEqual(result.resolution.valueEdits, []);
  assert.equal(result.resolution.edits[0].binding.kind, 'node-output');
  const complete = { ...input, resolutions: [result.resolution] };
  assert.throws(
    () => assembleWorkflowDraftEdit(complete),
    /ancestor|route|dependency|execute|available/i,
  );
  const assembled = assembleWorkflowDraftEdit({
    ...complete,
    connections: [
      {
        stepIds: [input.plan.steps[0].id],
        kind: 'remove-edge',
        edge: input.draft.edges[0],
      },
      {
        stepIds: [input.plan.steps[0].id],
        kind: 'add-edge',
        edge: {
          from: 'independent',
          to: 'follow',
          output: 'main',
          input: 'main',
        },
      },
    ],
  });
  assert.equal(
    assembled.draft.apiCalls[1].bindings[0].sourceNodeId,
    'independent',
  );
  assert.deepEqual(assembled.draft.apiCalls[0], before.apiCalls[0]);
  assert.deepEqual(assembled.draft.apiCalls[2], before.apiCalls[2]);
  assert.deepEqual(input.draft, before);
});

test('literal-to-binding replacement must be a distinct explicit decision; code derives only that exact removal', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Use source response value instead of the independent API literal id.',
  );
  input.plan = bindingEditPlan(input, [
    { kind: 'revise-api-bindings', nodeId: 'independent' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[0].id };
  const choice = { ...independentBindingDecision, sourceNodeId: 'source' };
  assert.throws(() => resolve(input, [choice]), /explicit replace-literal/);
  const result = resolve(input, [
    { ...choice, kind: 'replace-literal-with-binding' },
  ]);
  assert.deepEqual(result.resolution.valueEdits, [
    { kind: 'remove', pointer: '/path/id' },
  ]);
  assert.equal(input.draft.apiCalls[2].values.path.id, 'independent-id');
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
    connections: [
      {
        stepIds: [input.plan.steps[0].id],
        kind: 'add-edge',
        edge: {
          from: 'source',
          to: 'independent',
          input: 'main',
          output: 'main',
        },
      },
    ],
  });
  assert.deepEqual(assembled.draft.apiCalls[2].values, { path: {} });
  assert.deepEqual(assembled.draft.apiCalls[0], input.draft.apiCalls[0]);
});

test('unbind removes only an existing mapping and leaves actual missing required values as slots', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Stop taking follow id from source; fill it at execution.',
  );
  const result = resolve(input, [
    { kind: 'unbind', targetPointer: '/path/id' },
  ]);
  assert.deepEqual(result.resolution.valueEdits, []);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const readiness = inspectDraftReadiness({
    draft: assembled.draft,
    context: input.context,
  });
  assert.ok(
    readiness.slots.some(
      (slot) => slot.callId === 'follow' && slot.targetPointer === '/path/id',
    ),
  );
  assert.deepEqual(assembled.draft.apiCalls[1].values, {});
  assert.deepEqual(assembled.draft.edges, input.draft.edges);
});

test('source, pointer, type, ownership, duplicate target and provenance errors fail without correction', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  for (const changes of [
    [{ ...independentBindingDecision, sourceNodeId: 'invented' }],
    [{ ...independentBindingDecision, sourceNodeId: 'follow' }],
    [{ ...independentBindingDecision, sourcePointer: '/body/value' }],
    [{ ...independentBindingDecision, targetPointer: '/query/unknown' }],
    [{ ...independentBindingDecision, sourcePointer: '/~2' }],
    [independentBindingDecision, independentBindingDecision],
    [
      {
        kind: 'replace-literal-with-binding',
        targetPointer: '/path/id',
        sourceNodeId: 'independent',
        sourcePointer: '/value',
      },
    ],
    [{ kind: 'unbind', targetPointer: '/query/locale' }],
  ])
    assert.throws(() => resolve(input, changes));
  const forged = bindingEditProposal(input, [independentBindingDecision]);
  forged.decisions[0].sources[0].quote = 'Invented user text';
  assert.throws(
    () =>
      resolveWorkflowDraftApiBindingEdit({
        ...input,
        fingerprint: describeWorkflowDraftApiBindingEdit(input).fingerprint,
        proposal: forged,
      }),
    /fabricated quote/,
  );
  input.plan = bindingEditPlan(input, [
    { kind: 'revise-api-bindings', nodeId: 'source' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[0].id };
  assert.throws(
    () =>
      resolve(input, [
        {
          ...independentBindingDecision,
          kind: 'replace-literal-with-binding',
          targetPointer: '/body/config/count',
        },
      ]),
    /incompatible OAS types/,
  );
});

test('pending replacements never expose old producer contracts, while completed replacements expose original new OAS', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Replace source with replacement API and use its renamed response for follow.',
  );
  input.plan = bindingEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[1].id };
  const pending = describeWorkflowDraftApiBindingEdit(input);
  assert.ok(pending.stage.blockedSourceNodeIds.includes('source'));
  const selected = pending.sourceCandidates.find(
    (candidate) => candidate.nodeId === 'source',
  );
  assert.deepEqual(selected.operation.key, input.replacement.key);
  assert.equal(selected.preparation.status, 'request-pending');
  assert.equal(Object.hasOwn(selected.preparation, 'request'), false);
  assert.notDeepEqual(selected.operation.key, input.producer.key);
  assert.throws(() =>
    resolve(input, [{ ...independentBindingDecision, sourceNodeId: 'source' }]),
  );
  const planned = resolve(input, [
    {
      ...independentBindingDecision,
      sourceNodeId: 'source',
      sourcePointer: '/renamed',
    },
  ]);
  assert.equal(planned.status, 'ready');
  input.resolutions = [
    {
      stepId: input.plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'actual-replacement' } },
      bindings: [],
    },
  ];
  const ready = describeWorkflowDraftApiBindingEdit(input);
  assert.deepEqual(
    ready.sourceCandidates.find((candidate) => candidate.nodeId === 'source')
      .operation.key,
    input.replacement.key,
  );
  const result = resolve(input, [
    {
      ...independentBindingDecision,
      sourceNodeId: 'source',
      sourcePointer: '/renamed',
    },
  ]);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [...input.resolutions, result.resolution],
  });
  assert.equal(
    assembled.draft.apiCalls[1].bindings[0].sourcePointer,
    '/renamed',
  );
});

test('code-derived repairs change only affected targets and preserve task identity for final atomic assembly', async () => {
  const initial = await workflowDraftApiBindingEditFixture(
    'Replace source operation and use its renamed response.',
  );
  const input = replaceSource(initial);
  const context = describeWorkflowDraftApiBindingEdit(input);
  assert.deepEqual(context.requiredTargetPointers, ['/path/id']);
  const result = resolve(input, [
    {
      ...independentBindingDecision,
      sourceNodeId: 'source',
      sourcePointer: '/renamed',
    },
  ]);
  assert.equal(result.kind, 'repair');
  assert.equal(result.repair.taskId, input.scope.taskId);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    repairs: [result.repair],
  });
  assert.equal(
    assembled.draft.apiCalls[1].bindings[0].sourcePointer,
    '/renamed',
  );
  assert.deepEqual(assembled.draft.apiCalls[2], input.draft.apiCalls[2]);
  assert.throws(() =>
    resolve(input, [
      { ...independentBindingDecision, targetPointer: '/query/locale' },
    ]),
  );
  assert.throws(
    () => resolve(input, [{ kind: 'keep', targetPointer: '/path/id' }]),
    /not declared/,
  );
});

test('keep is explicit repair acknowledgment, not a way to bypass changed-contract checks', async () => {
  const initial = await workflowDraftApiBindingEditFixture(
    'Replace source with lookup, preserving its response value mapping.',
  );
  const input = replaceSource(initial, initial.lookup);
  const result = resolve(input, [{ kind: 'keep', targetPointer: '/path/id' }]);
  assert.deepEqual(result.repair.edits, []);
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    repairs: [result.repair],
  });
  assert.deepEqual(
    assembled.draft.apiCalls[1].bindings,
    input.draft.apiCalls[1].bindings,
  );
});

test('repair proposals cover every affected target exactly once and cannot edit unrelated mappings', async () => {
  const initial = await workflowDraftApiBindingEditFixture(
    'Replace source and update both follow dependencies.',
  );
  const content = globalThis.structuredClone(initial.draft);
  delete content.revision;
  delete content.approvals;
  delete content.requirementHistory;
  content.apiCalls[1].bindings.push({
    kind: 'node-output',
    targetPointer: '/query/locale',
    sourceNodeId: 'source',
    sourcePointer: '/value',
  });
  initial.draft = createWorkflowDraft({ content, context: initial.context });
  const input = replaceSource(initial);
  assert.throws(
    () =>
      resolve(input, [
        {
          ...independentBindingDecision,
          sourceNodeId: 'source',
          sourcePointer: '/renamed',
        },
      ]),
    /every affected target/,
  );
  const result = resolve(input, [
    {
      ...independentBindingDecision,
      sourceNodeId: 'source',
      sourcePointer: '/renamed',
    },
    { kind: 'unbind', targetPointer: '/query/locale' },
  ]);
  assert.equal(result.repair.edits.length, 2);
  assert.throws(
    () =>
      resolve(input, [
        { kind: 'keep', targetPointer: '/path/id' },
        {
          kind: 'needs-clarification',
          targetPointer: '/query/locale',
          message: 'Which output should supply locale?',
        },
      ]),
    /not declared/,
  );
});

test('uncertain dependencies produce stable scoped questions, not a partial resolution or invented values', async () => {
  const input = replaceSource(
    await workflowDraftApiBindingEditFixture(
      'Remove the old source capability; ask which replacement to use.',
    ),
  );
  const choices = [
    {
      kind: 'needs-clarification',
      targetPointer: '/path/id',
      message: 'Which available source should supply follow id?',
    },
  ];
  const first = resolve(input, choices);
  const second = resolve(input, choices);
  assert.equal(first.status, 'needs-clarification');
  assert.equal(first.questions[0].nodeId, 'follow');
  assert.equal(first.questions[0].id, second.questions[0].id);
  assert.equal(Object.hasOwn(first, 'resolution'), false);
  assert.equal(Object.hasOwn(first, 'repair'), false);
  assert.equal(input.draft.apiCalls[1].bindings[0].sourcePointer, '/value');
});

test('native output candidates use actual capability contracts and unresolved native changes hide their old contracts', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Use native context nested value for follow id.',
  );
  const content = globalThis.structuredClone(input.draft);
  delete content.revision;
  delete content.approvals;
  delete content.requirementHistory;
  content.nativeNodes = [
    {
      id: 'native-context',
      capability: 'typed-context',
      parameters: {
        count: 4,
        enabled: false,
        nested: { value: 'actual-native-value' },
      },
    },
  ];
  input.draft = createWorkflowDraft({ content, context: input.context });
  input.plan = bindingEditPlan(input, [
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[0].id };
  assert.ok(
    describeWorkflowDraftApiBindingEdit(input).sourceCandidates.some(
      (candidate) => candidate.nodeId === 'native-context',
    ),
  );
  assert.equal(
    resolve(input, [
      {
        ...independentBindingDecision,
        sourceNodeId: 'native-context',
        sourcePointer: '/nested/value',
      },
    ]).status,
    'ready',
  );
  input.plan = bindingEditPlan(input, [
    { kind: 'revise-native-node', nodeId: 'native-context' },
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[1].id };
  assert.equal(
    describeWorkflowDraftApiBindingEdit(input).sourceCandidates.some(
      (candidate) => candidate.nodeId === 'native-context',
    ),
    false,
  );
});

test('empty source contexts omit bind alternatives and requirement uncertainty blocks only its named contract scope', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Remove source and independent; defer follow id.',
  );
  input.plan = bindingEditPlan(input, [
    { kind: 'remove-node', nodeId: 'source' },
    { kind: 'remove-node', nodeId: 'independent' },
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[2].id };
  const context = describeWorkflowDraftApiBindingEdit(input);
  assert.deepEqual(context.sourceCandidates, []);
  const wire = z.toJSONSchema(
    createWorkflowDraftApiBindingEditProposalSchema(context),
  );
  assert.equal(JSON.stringify(wire).includes('sourceNodeId'), false);
  assert.equal(
    resolve(input, [{ kind: 'unbind', targetPointer: '/path/id' }]).status,
    'ready',
  );
  const scoped = await workflowDraftApiBindingEditFixture(
    'Ask about source changes; use independent for follow.',
  );
  scoped.plan = bindingEditPlan(scoped, [
    {
      kind: 'needs-clarification',
      owner: {
        kind: 'semantic',
        scope: { kind: 'nodes', nodeIds: ['source'] },
      },
    },
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  scoped.scope = { kind: 'step', stepId: scoped.plan.steps[1].id };
  const sources = describeWorkflowDraftApiBindingEdit(
    scoped,
  ).sourceCandidates.map((candidate) => candidate.nodeId);
  assert.deepEqual(sources, ['independent']);
  assert.equal(resolve(scoped, [independentBindingDecision]).status, 'ready');
});

test('stale staged materials, malformed scopes and invalid model outputs retain original errors without retry', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  const unknown = bindingEditModel(
    bindingEditProposal(input, [independentBindingDecision]),
  );
  await assert.rejects(
    planWorkflowDraftApiBindingEdit({
      ...input,
      scope: { kind: 'repair', taskId: 'invented' },
      model: unknown,
    }),
    /current API binding repair/,
  );
  assert.equal(unknown.requests.length, 0);
  assert.throws(() =>
    describeWorkflowDraftApiBindingEdit({ ...input, scope: null }),
  );
  const proposal = bindingEditProposal(input, [
    { ...independentBindingDecision, sourceNodeId: 'invented' },
  ]);
  const invalid = bindingEditModel(proposal);
  await assert.rejects(
    planWorkflowDraftApiBindingEdit({ ...input, model: invalid }),
    (error) => {
      assert.ok(error instanceof WorkflowDraftApiBindingEditPlanningError);
      assert.equal(error.failure.stage, 'proposal-schema');
      assert.deepEqual(
        error.failure.output,
        modelMessageEvidenceSelections(proposal),
      );
      return true;
    },
  );
  const model = bindingEditModel(
    bindingEditProposal(input, [independentBindingDecision]),
    () => {
      input.context.messages[1].text += ' changed during call';
    },
  );
  await assert.rejects(
    planWorkflowDraftApiBindingEdit({ ...input, model }),
    /stale|fingerprint/,
  );
  assert.equal(model.requests.length, 1);
});

test('stage fingerprint binds explicit receipts and returned source descriptions cannot mutate original contracts', async () => {
  const input = replaceSource(await workflowDraftApiBindingEditFixture());
  const described = describeWorkflowDraftApiBindingEdit(input);
  described.sourceCandidates.find(
    (source) => source.nodeId === 'source',
  ).operation.path = '/changed-description-only';
  assert.equal(input.replacement.path, '/replacement/{id}');
  const fingerprint = describeWorkflowDraftApiBindingEdit(input).fingerprint;
  input.resolutions[0].values.path.id = 'different-explicit-receipt';
  assert.throws(
    () =>
      resolveWorkflowDraftApiBindingEdit({
        ...input,
        fingerprint,
        proposal: bindingEditProposal(input, [
          {
            ...independentBindingDecision,
            sourceNodeId: 'source',
            sourcePointer: '/renamed',
          },
        ]),
      }),
    /fingerprint/,
  );
});

test('single-assignment checks do not fabricate empty bindings to hide unrelated invalid work', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  const materials = input.draft.apiCalls.map((call) => ({
    callId: call.id,
    operation: input.context.operations.find(
      (operation) => operation.key.operationRef === call.operation.operationRef,
    ),
    requestMediaType: call.requestMediaType,
  }));
  const binding = {
    kind: 'node-output',
    targetPointer: '/path/id',
    sourceNodeId: 'independent',
    sourcePointer: '/value',
  };
  validateApiBindingAssignment({ callId: 'follow', binding, materials });
  const calls = input.draft.apiCalls.map((call) => ({
    callId: call.id,
    bindings: call.id === 'follow' ? [binding] : call.bindings,
  }));
  calls[0].bindings = [{ ...binding, sourceNodeId: 'unavailable' }];
  assert.throws(
    () => validateApiBindingAssignments({ calls, materials }),
    /unknown sourceNodeId/,
  );
  assert.throws(
    () =>
      validateApiBindingAssignment({
        callId: 'follow',
        binding,
        materials: [null],
      }),
    /callIds/,
  );
  assert.throws(
    () =>
      validateApiBindingAssignment({
        callId: 'follow',
        binding,
        materials: null,
      }),
    /materials must be an array/,
  );
});

test('schema factories reject malformed metadata instead of emitting empty enums or implicit explanation settings', async () => {
  const input = await workflowDraftApiBindingEditFixture();
  const context = describeWorkflowDraftApiBindingEdit(input);
  for (const patch of [
    { messages: [] },
    { sourceCandidates: null },
    {
      sourceCandidates: [
        ...context.sourceCandidates,
        context.sourceCandidates[0],
      ],
    },
    { includeExplanations: undefined },
    {
      scope: { kind: 'repair', taskId: 'actual-task-shape' },
      requiredTargetPointers: [],
    },
  ])
    assert.throws(() =>
      createWorkflowDraftApiBindingEditProposalSchema({ ...context, ...patch }),
    );
  const resolved = resolve(input, [independentBindingDecision]);
  assert.throws(
    () =>
      describeWorkflowDraftApiBindingEdit({
        ...input,
        resolutions: [resolved.resolution],
      }),
    /already has a supplied result/,
  );
});

test('known response contracts remain usable during explicit pending input changes without presenting the old input as confirmed', async () => {
  const input = await workflowDraftApiBindingEditFixture(
    'Change source count to 4, then revise follow input mapping.',
  );
  input.plan = bindingEditPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'source' },
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  input.scope = { kind: 'step', stepId: input.plan.steps[1].id };
  const model = bindingEditModel(
    bindingEditProposal(input, [independentBindingDecision]),
  );
  const result = await planWorkflowDraftApiBindingEdit({ ...input, model });
  assert.equal(result.status, 'ready');
  const payload = JSON.parse(model.requests[0].messages[1].content);
  assert.deepEqual(
    payload.pendingSourceChanges.map((change) => change.nodeId),
    ['source'],
  );
  assert.equal(payload.pendingSourceChanges[0].kind, 'revise-api-inputs');
  assert.equal(input.draft.apiCalls[0].values.body.config.count, 0);
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({ ...input, resolutions: [result.resolution] }),
    /Missing draft edit resolution/,
  );
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
