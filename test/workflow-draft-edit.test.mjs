import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  validateWorkflowDraftEditPlan,
  describeWorkflowDraftEditContext,
  approveWorkflowDraft,
  applyDraftChangeSet,
} from '@openapi-flow/core';
import {
  analyzeWorkflowDraftEdit,
  WorkflowDraftEditPlanningError,
} from '@openapi-flow/langchain';
import {
  workflowDraftEditFixture,
  editDecision,
  scriptedDraftEditModel,
} from './fixtures/workflow-draft-edit-fixture.mjs';

const options = { includeExplanations: false };

test('malformed persisted edit plans fail at the named metadata boundary before contextual reconstruction', async () => {
  const input = await workflowDraftEditFixture();
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options,
    proposal: {
      decisions: [
        editDecision(
          { kind: 'remove-node', nodeId: 'c' },
          'second item lookup',
        ),
      ],
    },
  });
  for (const malformed of [
    null,
    {},
    { ...plan, steps: [null] },
    { ...plan, steps: [{ ...plan.steps[0], decision: null }] },
    { ...plan, steps: [{ ...plan.steps[0], stages: ['model-only-stage'] }] },
    { ...plan, approvals: [] },
    Object.fromEntries(
      Object.entries(plan).filter(
        ([key]) => key !== 'nodeContractsFingerprint',
      ),
    ),
    { ...plan, nodeContractsFingerprint: '' },
    { ...plan, nodeContractsFingerprint: null },
  ])
    assert.throws(
      () => validateWorkflowDraftEditPlan({ ...input, plan: malformed }),
      /invalid metadata or step fields/,
    );
});

test('code binds edit plans to the actual draft/context/request and allocates stable new instance IDs without changing confirmed data', async () => {
  const input = await workflowDraftEditFixture(
    'Look up the same item before the check and after the check.',
  );
  const before = globalThis.structuredClone(input.draft);
  const proposal = {
    decisions: [
      editDecision(
        { kind: 'add-api-call', operation: input.context.operations[0].key },
        'before the check',
      ),
      editDecision(
        { kind: 'add-api-call', operation: input.context.operations[0].key },
        'after the check',
      ),
    ],
  };
  const plan = createWorkflowDraftEditPlan({ ...input, options, proposal });
  assert.equal(plan.baseRevision, input.draft.revision);
  assert.equal(
    plan.draftFingerprint,
    describeWorkflowDraftEditContext(input).draftFingerprint,
  );
  assert.equal(
    plan.nodeContractsFingerprint,
    describeWorkflowDraftEditContext(input).nodeContractsFingerprint,
  );
  assert.equal(plan.status, 'ready-for-planning');
  assert.notEqual(plan.steps[0].newNodeId, plan.steps[1].newNodeId);
  assert.ok(
    plan.steps.every(
      (step) =>
        !input.draft.apiCalls.some((call) => call.id === step.newNodeId),
    ),
  );
  assert.deepEqual(
    plan,
    createWorkflowDraftEditPlan({ ...input, options, proposal }),
  );
  assert.doesNotThrow(() => validateWorkflowDraftEditPlan({ ...input, plan }));
  assert.doesNotThrow(() =>
    validateWorkflowDraftEditPlan({
      ...input,
      plan: JSON.parse(JSON.stringify(plan)),
    }),
  );
  assert.deepEqual(input.draft, before);
  assert.equal(Object.hasOwn(plan, 'approvals'), false);
  assert.equal(Object.hasOwn(plan.steps[0].decision, 'values'), false);
});

test('value, binding, native, connection and requirement edits have separate explicit code-owned stage contracts', async () => {
  const input = await workflowDraftEditFixture(
    'Change input a, binding b, native stop, wires and purpose.',
  );
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      ...input.content,
      nativeNodes: [
        {
          id: 'stop',
          capability: 'stop-and-error',
          parameters: { message: 'existing message' },
        },
      ],
      requirements: [
        {
          id: 'purpose',
          text: 'Existing purpose',
          state: 'confirmed',
          scope: { kind: 'workflow' },
          sourceMessageIds: ['request-1'],
        },
      ],
    },
  });
  const proposal = {
    decisions: [
      editDecision(
        { kind: 'revise-api-inputs', nodeId: 'a' },
        'Change input a',
      ),
      editDecision({ kind: 'revise-api-bindings', nodeId: 'b' }, 'binding b'),
      editDecision(
        { kind: 'revise-native-node', nodeId: 'stop' },
        'native stop',
      ),
      editDecision(
        { kind: 'revise-connections', nodeIds: ['a', 'b'] },
        'wires',
      ),
      editDecision(
        { kind: 'revise-requirement', requirementId: 'purpose' },
        'purpose',
      ),
    ],
  };
  const plan = createWorkflowDraftEditPlan({ ...input, options, proposal });
  assert.deepEqual(
    plan.steps.map((step) => step.stages),
    [
      ['api-arguments'],
      ['api-bindings', 'api-arguments', 'connections'],
      ['native-parameters', 'api-bindings', 'connections'],
      ['connections'],
      ['requirements'],
    ],
  );
  assert.ok(plan.steps.every((step) => !Object.hasOwn(step, 'newNodeId')));
});

test('partial semantic uncertainty is scoped separately and missing runtime values are not generated', async () => {
  const input = await workflowDraftEditFixture(
    'Change a and decide whether b should use a or c.',
  );
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options,
    proposal: {
      decisions: [
        editDecision({ kind: 'revise-api-inputs', nodeId: 'a' }, 'Change a'),
        editDecision(
          {
            kind: 'needs-clarification',
            owner: {
              kind: 'semantic',
              scope: { kind: 'nodes', nodeIds: ['b'] },
            },
          },
          'whether b should use a or c',
        ),
      ],
    },
  });
  assert.equal(plan.status, 'needs-clarification');
  assert.deepEqual(plan.steps[0].stages, ['api-arguments']);
  assert.deepEqual(plan.steps[1].stages, ['clarification']);
  assert.deepEqual(input.draft.apiCalls[1].values, {});
});

test('stale revisions, approvals, context contracts, request IDs and modified derived plan fields cannot be silently rebased', async () => {
  const input = await workflowDraftEditFixture();
  const proposal = {
    decisions: [
      editDecision(
        { kind: 'remove-node', nodeId: 'c' },
        'second item lookup',
        'second item lookup',
      ),
    ],
  };
  const plan = createWorkflowDraftEditPlan({ ...input, options, proposal });
  const variants = [
    {
      ...input,
      draft: approveWorkflowDraft({
        ...input,
        expectedRevision: 0,
        nodeIds: ['c'],
      }),
    },
    {
      ...input,
      draft: {
        ...input.draft,
        apiCalls: input.draft.apiCalls.map((call) =>
          call.id === 'c'
            ? { ...call, values: { query: { mode: 'changed' } } }
            : call,
        ),
      },
    },
    {
      ...input,
      context: {
        ...input.context,
        messages: input.context.messages.map((message) =>
          message.id === 'edit-1'
            ? { ...message, text: message.text + ' and retain c' }
            : message,
        ),
      },
    },
    { ...input, requestMessageIds: ['request-1'] },
  ];
  for (const variant of variants)
    assert.throws(() => validateWorkflowDraftEditPlan({ ...variant, plan }));
  for (const changed of [
    { ...plan, baseRevision: plan.baseRevision + 1 },
    { ...plan, nodeContractsFingerprint: 'modified-contract-fingerprint' },
    { ...plan, status: 'no-change' },
    { ...plan, steps: plan.steps.map((step) => ({ ...step, stages: [] })) },
    {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step,
        newNodeId: 'model-created',
      })),
    },
  ])
    assert.throws(
      () => validateWorkflowDraftEditPlan({ ...input, plan: changed }),
      /stale|modified/,
    );
});

test('edit sources must be exact current-request quotes, even when explanation display is disabled', async () => {
  const input = await workflowDraftEditFixture();
  const base = editDecision(
    { kind: 'remove-node', nodeId: 'c' },
    'second item lookup',
  );
  for (const sources of [
    [{ kind: 'message', messageId: 'edit-1', quote: 'fabricated' }],
    [{ kind: 'message', messageId: 'unknown', quote: 'second item lookup' }],
    [{ kind: 'message', messageId: 'request-1', quote: 'c is independent' }],
  ])
    assert.throws(
      () =>
        createWorkflowDraftEditPlan({
          ...input,
          options,
          proposal: { decisions: [{ ...base, sources }] },
        }),
      /quote|unknown|current request/,
    );
});

test('unknown targets, wrong node kinds, stale OAS, duplicate roles and contradictory instructions fail without repair', async () => {
  const input = await workflowDraftEditFixture();
  const make = (fields) => editDecision(fields, 'second item lookup');
  for (const decisions of [
    [make({ kind: 'remove-node', nodeId: 'unknown' })],
    [make({ kind: 'revise-native-node', nodeId: 'a' })],
    [
      make({
        kind: 'add-api-call',
        operation: { ...input.context.operations[0].key, snapshotId: 'stale' },
      }),
    ],
    [
      make({
        kind: 'replace-api-operation',
        nodeId: 'a',
        operation: input.context.operations[0].key,
      }),
    ],
    [make({ kind: 'add-native-node', capability: 'not-registered' })],
    [
      make({ kind: 'remove-node', nodeId: 'a' }),
      make({ kind: 'revise-api-inputs', nodeId: 'a' }),
    ],
    [make({ kind: 'no-change' }), make({ kind: 'remove-node', nodeId: 'a' })],
    [
      make({
        kind: 'add-api-call',
        operation: input.context.operations[0].key,
      }),
      make({
        kind: 'add-api-call',
        operation: input.context.operations[0].key,
      }),
    ],
    [make({ kind: 'revise-connections', nodeIds: ['a', 'a'] })],
  ])
    assert.throws(() =>
      createWorkflowDraftEditPlan({
        ...input,
        options,
        proposal: { decisions },
      }),
    );
});

test('semantic removal proposals do not themselves delete nodes, repair references, invalidate approvals or claim full impact validation', async () => {
  const input = await workflowDraftEditFixture('Remove a.');
  const before = globalThis.structuredClone(input.draft);
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options,
    proposal: {
      decisions: [
        editDecision({ kind: 'remove-node', nodeId: 'a' }, 'Remove a'),
      ],
    },
  });
  assert.equal(plan.status, 'ready-for-planning');
  assert.deepEqual(input.draft, before);
  assert.throws(() =>
    applyDraftChangeSet({
      ...input,
      changeSet: {
        baseRevision: 0,
        changes: [{ kind: 'remove-node', nodeId: 'a' }],
      },
    }),
  );
  assert.deepEqual(input.draft, before);
});

test('one model call resolves only supplied operation candidates and removes display-disabled explanations from the output contract', async () => {
  const input = await workflowDraftEditFixture();
  const model = scriptedDraftEditModel({
    decisions: [
      editDecision(
        { kind: 'add-api-call', operation: 'candidate-1' },
        'second item lookup',
      ),
    ],
  });
  const plan = await analyzeWorkflowDraftEdit({ ...input, options, model });
  assert.equal(model.calls.length, 1);
  assert.deepEqual(
    plan.steps[0].decision.operation,
    input.context.operations[0].key,
  );
  const { schema, messages } = model.calls[0];
  const text = JSON.stringify(schema);
  assert.equal(text.includes('"explanation"'), false);
  assert.equal(text.includes('"baseRevision"'), false);
  assert.equal(text.includes('"snapshotId"'), false);
  assert.equal(text.includes('"values"'), false);
  assert.equal(text.includes('"newNodeId"'), false);
  assert.equal(messages[0].constructor.name, 'SystemMessage');
  assert.equal(messages[1].constructor.name, 'HumanMessage');
});

test('schema and source errors preserve original model proposals; mutable inputs cannot change during an awaited model call', async () => {
  const input = await workflowDraftEditFixture();
  const invalid = [
    {
      decisions: [
        editDecision(
          { kind: 'add-api-call', operation: 'unknown' },
          'second item lookup',
        ),
      ],
    },
    {
      decisions: [
        editDecision({ kind: 'remove-node', nodeId: 'c' }, 'fabricated quote'),
      ],
    },
    {
      baseRevision: 0,
      decisions: [editDecision({ kind: 'no-change' }, 'second item lookup')],
    },
  ];
  for (const [index, canonical] of invalid.entries()) {
    // The fabricated quote is deliberately a raw invalid wire field, not fixture-encoded away.
    const proposal =
      index === 1 ? canonical : modelMessageEvidenceSelections(canonical);
    let calls = 0;
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            calls++;
            return proposal;
          },
        };
      },
    };
    await assert.rejects(
      () => analyzeWorkflowDraftEdit({ ...input, options, model }),
      (error) =>
        error instanceof WorkflowDraftEditPlanningError &&
        error.failure.proposal === proposal &&
        error.cause instanceof Error,
    );
    assert.equal(calls, 1);
  }
  const model = scriptedDraftEditModel(() => {
    input.draft.apiCalls[2].values.query.mode = 'external-edit';
    return {
      decisions: [
        editDecision(
          { kind: 'remove-node', nodeId: 'c' },
          'second item lookup',
        ),
      ],
    };
  });
  await assert.rejects(
    () => analyzeWorkflowDraftEdit({ ...input, options, model }),
    /changed during model invocation/,
  );
});

test('invalid host context and options fail before any model call; empty contexts have no invented OAS candidates', async () => {
  const input = await workflowDraftEditFixture();
  const model = scriptedDraftEditModel({ decisions: [] });
  for (const change of [
    { requestMessageIds: [] },
    { requestMessageIds: ['missing'] },
    { options: { includeExplanations: 'yes' } },
  ])
    await assert.rejects(() =>
      analyzeWorkflowDraftEdit({ ...input, model, ...change }),
    );
  assert.equal(model.calls.length, 0);
  const context = {
    operations: [],
    capabilities: [],
    messages: [{ id: 'edit-1', text: 'No change.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'empty',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const emptyModel = scriptedDraftEditModel({
    decisions: [editDecision({ kind: 'no-change' }, 'No change.')],
  });
  const plan = await analyzeWorkflowDraftEdit({
    draft,
    context,
    requestMessageIds: ['edit-1'],
    options,
    model: emptyModel,
  });
  assert.equal(plan.status, 'no-change');
  assert.deepEqual(plan.steps[0].stages, []);
  assert.equal(
    JSON.stringify(emptyModel.calls[0].schema).includes('add-api-call'),
    false,
  );
  assert.equal(
    JSON.stringify(emptyModel.calls[0].schema).includes('"enum":[]'),
    false,
  );
});

test('native-only edits choose a registered capability without inserting an OAS source or inventing native settings', async () => {
  const input = await workflowDraftEditFixture('Add a stop node.');
  const context = { ...input.context, operations: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'native-only-edit',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const model = scriptedDraftEditModel({
    decisions: [
      editDecision(
        { kind: 'add-native-node', capability: 'stop-and-error' },
        'Add a stop node',
      ),
    ],
  });
  const plan = await analyzeWorkflowDraftEdit({
    draft,
    context,
    requestMessageIds: input.requestMessageIds,
    options,
    model,
  });
  assert.equal(plan.steps[0].decision.kind, 'add-native-node');
  assert.deepEqual(plan.steps[0].stages, ['native-parameters', 'connections']);
  assert.ok(plan.steps[0].newNodeId);
  assert.equal(Object.hasOwn(plan.steps[0].decision, 'parameters'), false);
  assert.deepEqual(
    JSON.parse(model.calls[0].messages[1].content).candidates,
    [],
  );
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
