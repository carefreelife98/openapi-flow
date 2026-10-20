import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  assembleWorkflowDraftEdit,
  createWorkflowDraftEditCandidateContext,
  prepareWorkflowDraftEdit,
  WorkflowDraftEditAssemblyError,
  approveWorkflowDraft,
  inspectDraftReadiness,
  createWorkflowDraft,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  workflowDraftEditAssemblyFixture,
  assemblyPlan,
} from './fixtures/workflow-draft-edit-assembly-fixture.mjs';

const edge = (from, to) => ({ from, output: 'main', to, input: 'main' });
const own = globalThis.structuredClone;

test('media-type edits validate newly set fields against the selected contract while explicitly removing old-format data', async () => {
  const body = (name) => ({
    type: 'object',
    properties: { [name]: { type: 'string' } },
    required: [name],
    additionalProperties: false,
  });
  const catalog = await createApiCatalog([
    {
      id: 'media-edit',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Declared format change', version: '1' },
        paths: {
          '/submit': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': { schema: body('old') },
                  'application/x-www-form-urlencoded': { schema: body('next') },
                },
              },
              responses: { 200: { description: 'Done' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const context = {
    operations: [operation],
    capabilities: [],
    messages: [
      {
        id: 'edit-1',
        text: 'Switch to the declared form format, remove old and set next to actual.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'media-edit',
      requirements: [],
      nativeNodes: [],
      edges: [],
      apiCalls: [
        {
          id: 'submit',
          operation: operation.key,
          values: { body: { old: 'original' } },
          bindings: [],
          requestMediaType: 'application/json',
        },
      ],
    },
  });
  const input = { draft, context, requestMessageIds: ['edit-1'] };
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'submit' },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-inputs',
        requestMediaType: 'application/x-www-form-urlencoded',
        edits: [
          { kind: 'remove', pointer: '/body/old' },
          { kind: 'set', pointer: '/body/next', value: 'actual' },
        ],
      },
    ],
  });
  assert.deepEqual(result.draft.apiCalls[0].values.body, { next: 'actual' });
  assert.equal(
    result.draft.apiCalls[0].requestMediaType,
    'application/x-www-form-urlencoded',
  );
  assert.deepEqual(draft.apiCalls[0].values.body, { old: 'original' });
});

test('partial input edits preserve untouched nested fields, typed false/zero/null, identities, bindings and independent approval coverage', async () => {
  const input = await workflowDraftEditAssemblyFixture();
  input.draft = approveWorkflowDraft({
    ...input,
    expectedRevision: 0,
    nodeIds: ['source', 'follow', 'independent'],
  });
  const before = own(input.draft);
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'source' },
  ]);
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'api-inputs',
      edits: [{ kind: 'set', pointer: '/body/config/count', value: 4 }],
    },
  ];
  const prepared = prepareWorkflowDraftEdit({ ...input, plan, resolutions });
  assert.equal(prepared.kind, 'unvalidated-edit-materials');
  assert.deepEqual(prepared.pendingRepairs, []);
  assert.equal(Object.hasOwn(prepared, 'revision'), false);
  const result = assembleWorkflowDraftEdit({ ...input, plan, resolutions });
  assert.equal(result.status, 'changed');
  assert.equal(result.draft.revision, before.revision + 1);
  const expected = own(before.apiCalls[0]);
  expected.values.body.config.count = 4;
  assert.deepEqual(result.draft.apiCalls[0], expected);
  assert.deepEqual(result.draft.apiCalls.slice(1), before.apiCalls.slice(1));
  assert.deepEqual(result.draft.edges, before.edges);
  assert.deepEqual(result.impact.affectedNodeIds.sort(), ['follow', 'source']);
  assert.equal(
    inspectDraftReadiness({
      draft: result.draft,
      context: input.context,
    }).nodes.find((node) => node.nodeId === 'independent').reviewed,
    true,
  );
  assert.deepEqual(input.draft, before);
});

test('explicit pointer edits preserve container identity and array siblings; missing required values become slots rather than invented values', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Edit explicit array, numeric and dotted keys, then defer name.',
  );
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'source' },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-inputs',
        edits: [
          { kind: 'set', pointer: '/body/lines/0/quantity', value: 0 },
          {
            kind: 'set',
            pointer: '/body/config/0',
            value: 'still an object key',
          },
          {
            kind: 'set',
            pointer: '/body/config/a.b',
            value: '={{ ordinary data }}',
          },
          { kind: 'remove', pointer: '/body/name' },
        ],
      },
    ],
  });
  const body = result.draft.apiCalls[0].values.body;
  assert.equal(body.lines[0].quantity, 0);
  assert.deepEqual(body.lines[1], input.draft.apiCalls[0].values.body.lines[1]);
  assert.equal(Array.isArray(body.config), false);
  assert.equal(body.config['a.b'], '={{ ordinary data }}');
  assert.equal(Object.hasOwn(body, 'name'), false);
  assert.ok(
    inspectDraftReadiness({
      draft: result.draft,
      context: input.context,
    }).slots.some((slot) => slot.targetPointer === '/body/name'),
  );
});

test('API additions use the allocated instance and original operation; caller cannot smuggle identity or replace old literals', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Add an independent lookup.',
  );
  const plan = assemblyPlan(input, [
    { kind: 'add-api-call', operation: input.lookup.key },
  ]);
  const resolution = {
    stepId: plan.steps[0].id,
    kind: 'api-call',
    values: { path: { id: 'new-id' } },
    bindings: [],
  };
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [resolution],
  });
  assert.deepEqual(result.draft.apiCalls.slice(0, 3), input.draft.apiCalls);
  assert.equal(result.draft.apiCalls[3].id, plan.steps[0].newNodeId);
  assert.deepEqual(result.draft.apiCalls[3].operation, input.lookup.key);
  assert.deepEqual(result.draft.apiCalls[3].values, resolution.values);
  assert.throws(() =>
    assembleWorkflowDraftEdit({
      ...input,
      plan,
      resolutions: [{ ...resolution, id: 'forged' }],
    }),
  );
});

test('a producer removal exposes real consumer repair work and requires explicit binding and edge changes in the same atomic candidate', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Remove source and explicitly read follow from independent.',
  );
  const before = own(input.draft);
  const plan = assemblyPlan(input, [{ kind: 'remove-node', nodeId: 'source' }]);
  const prepared = prepareWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [],
  });
  assert.equal(prepared.pendingRepairs.length, 1);
  const [task] = prepared.pendingRepairs;
  assert.equal(task.nodeId, 'follow');
  assert.deepEqual(task.targetPointers, ['/path/id']);
  assert.deepEqual(task.sourceNodeIds, ['source']);
  assert.equal(prepared.content.edges.length, 0); // Not silently repaired.
  assert.deepEqual(
    prepared.nodeRemovalConnections.map((change) => change.edge),
    [edge('source', 'follow')],
  );
  assert.deepEqual(
    prepared.content.apiCalls.find((call) => call.id === 'follow').bindings,
    before.apiCalls.find((call) => call.id === 'follow').bindings,
  );
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, plan, resolutions: [] }),
    (error) =>
      error instanceof WorkflowDraftEditAssemblyError &&
      error.failure.stage === 'dependency-repairs' &&
      error.failure.pendingRepairs[0].id === task.id,
  );
  const repairs = [
    {
      taskId: task.id,
      kind: 'api-bindings',
      edits: [
        {
          kind: 'set',
          binding: {
            kind: 'node-output',
            sourceNodeId: 'independent',
            sourcePointer: '/value',
            targetPointer: '/path/id',
          },
        },
      ],
    },
  ];
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({ ...input, plan, resolutions: [], repairs }),
    (error) => error.failure.stage === 'final-validation',
  );
  const connections = [
    {
      stepIds: [plan.steps[0].id],
      kind: 'add-edge',
      edge: edge('independent', 'follow'),
    },
  ];
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [],
    repairs,
    connections,
  });
  assert.deepEqual(
    result.draft.apiCalls.map((call) => call.id),
    ['follow', 'independent'],
  );
  assert.deepEqual(result.draft.edges, [edge('independent', 'follow')]);
  assert.deepEqual(input.draft, before);
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        plan,
        resolutions: [],
        repairs: [
          {
            ...repairs[0],
            edits: [{ kind: 'remove', targetPointer: '/query/unrelated' }],
          },
        ],
        connections,
      }),
    /unrelated API binding/,
  );
});

test('changing an operation, not a literal value, requests source-mapping review with snapshot-bound task identity', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Replace source with the replacement API and use renamed in follow.',
  );
  const plan = assemblyPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
  ]);
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'replacement-id' } },
      bindings: [],
    },
  ];
  const {
    pendingRepairs: [task],
  } = prepareWorkflowDraftEdit({ ...input, plan, resolutions });
  assert.ok(task);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions,
    repairs: [
      {
        taskId: task.id,
        kind: 'api-bindings',
        edits: [
          {
            kind: 'set',
            binding: {
              ...input.draft.apiCalls[1].bindings[0],
              sourcePointer: '/renamed',
            },
          },
        ],
      },
    ],
  });
  assert.equal(result.draft.apiCalls[1].bindings[0].sourcePointer, '/renamed');
  assert.deepEqual(result.draft.apiCalls[2], input.draft.apiCalls[2]);
});

test('scoped uncertainty becomes a code-owned pending requirement while an independent edit remains a valid design', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Change independent; confirm the meaning of follow later.',
  );
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'independent' },
    {
      kind: 'needs-clarification',
      owner: {
        kind: 'semantic',
        scope: { kind: 'nodes', nodeIds: ['follow'] },
      },
    },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-inputs',
        edits: [{ kind: 'set', pointer: '/path/id', value: 'actual-next-id' }],
      },
    ],
  });
  assert.equal(result.deferredRequirementIds.length, 1);
  const requirement = result.draft.requirements[0];
  assert.equal(requirement.state, 'needs-clarification');
  assert.deepEqual(requirement.sourceMessageIds, ['edit-1']);
  const readiness = inspectDraftReadiness({
    draft: result.draft,
    context: input.context,
  });
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'follow').planningStatus,
    'blocked-by-decision',
  );
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'independent')
      .planningStatus,
    'ready',
  );
});

test('native partial settings preserve siblings, explicit runtime ownership creates a real slot, and reverting requires actual literals', async () => {
  const input = await workflowDraftEditAssemblyFixture('Edit context.');
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      id: 'native-edit',
      requirements: [],
      apiCalls: [],
      edges: [],
      nativeNodes: [
        {
          id: 'context',
          capability: 'typed-context',
          parameters: { count: 0, enabled: false, nested: { value: 'old' } },
        },
      ],
    },
  });
  const plan = assemblyPlan(input, [
    { kind: 'revise-native-node', nodeId: 'context' },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'native-parameters',
        edits: [{ kind: 'set', pointer: '/nested/value', value: 'next' }],
      },
    ],
  });
  assert.deepEqual(result.draft.nativeNodes[0].parameters, {
    count: 0,
    enabled: false,
    nested: { value: 'next' },
  });
  const runtime = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [{ stepId: plan.steps[0].id, kind: 'native-runtime' }],
  });
  assert.deepEqual(runtime.draft.nativeNodes[0].parameters, {});
  assert.equal(
    inspectDraftReadiness({ draft: runtime.draft, context: input.context })
      .nativeInputsReady,
    false,
  );
  const nextInput = { ...input, draft: runtime.draft };
  const nextPlan = assemblyPlan(nextInput, [
    { kind: 'revise-native-node', nodeId: 'context' },
  ]);
  const literal = assembleWorkflowDraftEdit({
    ...nextInput,
    plan: nextPlan,
    resolutions: [
      {
        stepId: nextPlan.steps[0].id,
        kind: 'native-parameters',
        edits: [
          {
            kind: 'set',
            pointer: '',
            value: { count: 1, enabled: true, nested: { value: 'actual' } },
          },
        ],
      },
    ],
  });
  assert.equal(
    Object.hasOwn(literal.draft.nativeNodes[0], 'runtimeParameters'),
    false,
  );
});

test('no-change and deterministic removals need no fabricated model resolution or new empty revision', async () => {
  const input = await workflowDraftEditAssemblyFixture('No change.');
  const plan = assemblyPlan(input, [{ kind: 'no-change' }]);
  const result = assembleWorkflowDraftEdit({ ...input, plan, resolutions: [] });
  assert.equal(result.status, 'no-change');
  assert.deepEqual(result.draft, input.draft);
  assert.notEqual(result.draft, input.draft);
  const removePlan = assemblyPlan(input, [
    { kind: 'remove-node', nodeId: 'independent' },
  ]);
  assert.equal(
    assembleWorkflowDraftEdit({ ...input, plan: removePlan, resolutions: [] })
      .draft.apiCalls.length,
    2,
  );
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        plan: removePlan,
        resolutions: [
          { stepId: removePlan.steps[0].id, kind: 'api-inputs', edits: [] },
        ],
      }),
    /Unexpected resolution/,
  );
});

test('malformed, missing, duplicate, forged and stale resolution identities fail without using values from another source', async () => {
  const input = await workflowDraftEditAssemblyFixture();
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'source' },
  ]);
  const resolution = {
    stepId: plan.steps[0].id,
    kind: 'api-inputs',
    edits: [{ kind: 'set', pointer: '/body/config/count', value: 4 }],
  };
  for (const resolutions of [
    [],
    [resolution, resolution],
    [{ ...resolution, stepId: 'wrong' }],
    [{ stepId: resolution.stepId, kind: 'native-runtime' }],
    [
      {
        ...resolution,
        edits: [{ kind: 'set', pointer: '/body/config/count' }],
      },
    ],
  ])
    assert.throws(() =>
      assembleWorkflowDraftEdit({ ...input, plan, resolutions }),
    );
  const changed = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [resolution],
  });
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        draft: changed.draft,
        plan,
        resolutions: [resolution],
      }),
    /stale|modified/,
  );
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        plan,
        resolutions: [resolution],
        repairs: [{ taskId: 'stale', kind: 'api-bindings', edits: [] }],
      }),
    /unknown or stale/,
  );
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        plan,
        resolutions: [resolution],
        connections: [
          {
            stepIds: [resolution.stepId],
            kind: 'add-edge',
            edge: edge('independent', 'source'),
          },
        ],
      }),
    /connection-planning/,
  );
});

test('invalid OAS values, absent removals, malformed pointers and sparse arrays leave the original draft untouched', async () => {
  const input = await workflowDraftEditAssemblyFixture();
  const before = own(input.draft);
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'source' },
  ]);
  for (const edit of [
    { kind: 'set', pointer: '/body/config/count', value: '4' },
    { kind: 'set', pointer: '/body/unknown', value: 4 },
    { kind: 'remove', pointer: '/body/lines/9' },
    { kind: 'set', pointer: '/body/lines/5/quantity', value: 4 },
    { kind: 'set', pointer: '/body/~x', value: 4 },
  ]) {
    assert.throws(() =>
      assembleWorkflowDraftEdit({
        ...input,
        plan,
        resolutions: [
          { stepId: plan.steps[0].id, kind: 'api-inputs', edits: [edit] },
        ],
      }),
    );
    assert.deepEqual(input.draft, before);
  }
});

test('binding deltas preserve other bindings and literal fields; switching from a literal requires its explicit removal', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Change only the follow ID binding.',
  );
  const apiCalls = own(input.draft.apiCalls);
  apiCalls[1].bindings.push({
    kind: 'node-output',
    sourceNodeId: 'independent',
    sourcePointer: '/value',
    targetPointer: '/query/locale',
  });
  apiCalls[1].values = { query: { view: 'full' } };
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      id: input.draft.id,
      requirements: [],
      nativeNodes: [],
      apiCalls,
      edges: [edge('independent', 'source'), edge('source', 'follow')],
    },
  });
  const plan = assemblyPlan(input, [
    { kind: 'revise-api-bindings', nodeId: 'follow' },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-bindings',
        edits: [
          {
            kind: 'set',
            binding: {
              ...apiCalls[1].bindings[0],
              sourceNodeId: 'independent',
            },
          },
        ],
        valueEdits: [],
      },
    ],
  });
  assert.deepEqual(
    result.draft.apiCalls[1].bindings[1],
    apiCalls[1].bindings[1],
  );
  assert.deepEqual(result.draft.apiCalls[1].values, apiCalls[1].values);
  const literalInput = await workflowDraftEditAssemblyFixture(
    'Replace the independent ID literal with source output.',
  );
  const literalPlan = assemblyPlan(literalInput, [
    { kind: 'revise-api-bindings', nodeId: 'independent' },
  ]);
  const binding = {
    kind: 'node-output',
    sourceNodeId: 'source',
    sourcePointer: '/value',
    targetPointer: '/path/id',
  };
  const resolution = {
    stepId: literalPlan.steps[0].id,
    kind: 'api-bindings',
    edits: [{ kind: 'set', binding }],
    valueEdits: [],
  };
  const connections = [
    {
      stepIds: [literalPlan.steps[0].id],
      kind: 'add-edge',
      edge: edge('source', 'independent'),
    },
  ];
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...literalInput,
        plan: literalPlan,
        resolutions: [resolution],
        connections,
      }),
    /literal and binding/,
  );
  const converted = assembleWorkflowDraftEdit({
    ...literalInput,
    plan: literalPlan,
    resolutions: [
      { ...resolution, valueEdits: [{ kind: 'remove', pointer: '/path/id' }] },
    ],
    connections,
  });
  assert.equal(
    Object.hasOwn(converted.draft.apiCalls[2].values.path, 'id'),
    false,
  );
  assert.deepEqual(converted.draft.apiCalls[2].bindings, [binding]);
});

test('native repair output contract changes derive a further API task, rather than treating the first repair as final readiness', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Change producer shape.',
  );
  const output = (field) => ({
    type: 'object',
    properties: { [field]: { type: 'string' } },
    required: [field],
    additionalProperties: false,
  });
  const common = {
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  const producer = {
    ...common,
    name: 'shape-producer',
    description: 'Declared parameter-dependent output contract',
    parametersSchema: z.strictObject({ field: z.string() }),
    outputSchema: (parameters) => output(parameters.field),
  };
  const adapter = {
    ...common,
    name: 'declared-source',
    description: 'Declared source and output contract',
    parametersSchema: z.strictObject({
      sourceNodeId: z.string(),
      pointer: z.string(),
      outputField: z.string(),
    }),
    nodeOutputReferences: (parameters) => [
      {
        source: 'node-output',
        nodeId: parameters.sourceNodeId,
        pointer: parameters.pointer,
      },
    ],
    outputSchema: (parameters) => output(parameters.outputField),
  };
  input.context = { ...input.context, capabilities: [producer, adapter] };
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      id: 'cascade',
      requirements: [],
      nativeNodes: [
        {
          id: 'producer',
          capability: producer.name,
          parameters: { field: 'first' },
        },
        {
          id: 'adapter',
          capability: adapter.name,
          parameters: {
            sourceNodeId: 'producer',
            pointer: '/first',
            outputField: 'old',
          },
        },
      ],
      apiCalls: [
        {
          id: 'follow',
          operation: input.lookup.key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'adapter',
              sourcePointer: '/old',
              targetPointer: '/path/id',
            },
          ],
        },
      ],
      edges: [edge('producer', 'adapter'), edge('adapter', 'follow')],
    },
  });
  const plan = assemblyPlan(input, [
    { kind: 'revise-native-node', nodeId: 'producer' },
  ]);
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'native-parameters',
      edits: [{ kind: 'set', pointer: '/field', value: 'second' }],
    },
  ];
  const first = prepareWorkflowDraftEdit({ ...input, plan, resolutions });
  assert.deepEqual(
    first.pendingRepairs.map((task) => task.nodeId),
    ['adapter'],
  );
  const repair = {
    taskId: first.pendingRepairs[0].id,
    kind: 'native-parameters',
    edits: [
      { kind: 'set', pointer: '/pointer', value: '/second' },
      { kind: 'set', pointer: '/outputField', value: 'new' },
    ],
  };
  const second = prepareWorkflowDraftEdit({
    ...input,
    plan,
    resolutions,
    repairs: [repair],
  });
  assert.deepEqual(
    second.pendingRepairs.map((task) => task.nodeId),
    ['follow'],
  );
  const nextRepair = {
    taskId: second.pendingRepairs[0].id,
    kind: 'api-bindings',
    edits: [
      {
        kind: 'set',
        binding: {
          ...input.draft.apiCalls[0].bindings[0],
          sourcePointer: '/new',
        },
      },
    ],
  };
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions,
    repairs: [nextRepair, repair],
  });
  assert.equal(result.draft.nativeNodes[1].parameters.pointer, '/second');
  assert.equal(result.draft.apiCalls[0].bindings[0].sourcePointer, '/new');
  assert.equal(result.draft.revision, input.draft.revision + 1);
});

test('requirements retain their identity and source history while explicit reviewed state and scope are validated', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Defer purpose for follow.',
  );
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      id: input.draft.id,
      apiCalls: input.draft.apiCalls,
      nativeNodes: [],
      edges: input.draft.edges,
      requirements: [
        {
          id: 'purpose',
          text: 'Initial purpose',
          state: 'confirmed',
          scope: { kind: 'workflow' },
          sourceMessageIds: ['initial'],
        },
      ],
    },
  });
  const plan = assemblyPlan(input, [
    { kind: 'revise-requirement', requirementId: 'purpose' },
  ]);
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'requirement',
        answerMessageId: 'typed-purpose',
        text: 'Purpose pending',
        state: 'deferred',
        scope: { kind: 'nodes', nodeIds: ['follow'] },
      },
    ],
  });
  assert.deepEqual(result.draft.requirements[0], {
    id: 'purpose',
    text: 'Purpose pending',
    state: 'deferred',
    scope: { kind: 'nodes', nodeIds: ['follow'] },
    sourceMessageIds: ['edit-1', 'typed-purpose'],
  });
  assert.equal(
    inspectDraftReadiness({
      draft: result.draft,
      context: createWorkflowDraftEditCandidateContext({
        ...input,
        plan,
        resolutions: [
          {
            stepId: plan.steps[0].id,
            kind: 'requirement',
            answerMessageId: 'typed-purpose',
            text: 'Purpose pending',
            state: 'deferred',
            scope: { kind: 'nodes', nodeIds: ['follow'] },
          },
        ],
      }),
    }).nodes.find((node) => node.nodeId === 'source').planningStatus,
    'ready',
  );
});

test('a port-only native change needs explicit rewiring but does not ask the unchanged data binding to be replanned', async () => {
  const input = await workflowDraftEditAssemblyFixture(
    'Change the producer output port.',
  );
  const capability = {
    name: 'port-producer',
    description: 'Same declared data on explicit output ports',
    parametersSchema: z.strictObject({ branch: z.boolean() }),
    inputPorts: () => ['main'],
    outputPorts: (parameters) => (parameters.branch ? ['yes', 'no'] : ['main']),
    responseReferences: () => [],
    outputSchema: () => ({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
    waitsForAllInputs: false,
    exclusiveOutputPorts: true,
  };
  input.context = { ...input.context, capabilities: [capability] };
  input.draft = createWorkflowDraft({
    context: input.context,
    content: {
      id: 'port-edit',
      requirements: [],
      nativeNodes: [
        {
          id: 'producer',
          capability: capability.name,
          parameters: { branch: false },
        },
      ],
      apiCalls: [
        {
          id: 'follow',
          operation: input.lookup.key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'producer',
              sourcePointer: '/value',
              targetPointer: '/path/id',
            },
          ],
        },
      ],
      edges: [edge('producer', 'follow')],
    },
  });
  const plan = assemblyPlan(input, [
    { kind: 'revise-native-node', nodeId: 'producer' },
  ]);
  const resolutions = [
    {
      stepId: plan.steps[0].id,
      kind: 'native-parameters',
      edits: [{ kind: 'set', pointer: '/branch', value: true }],
    },
  ];
  assert.deepEqual(
    prepareWorkflowDraftEdit({ ...input, plan, resolutions }).pendingRepairs,
    [],
  );
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, plan, resolutions }),
    (error) => error.failure.stage === 'final-validation',
  );
  const result = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions,
    connections: [
      {
        stepIds: [plan.steps[0].id],
        kind: 'remove-edge',
        edge: edge('producer', 'follow'),
      },
      {
        stepIds: [plan.steps[0].id],
        kind: 'add-edge',
        edge: { from: 'producer', output: 'yes', to: 'follow', input: 'main' },
      },
    ],
  });
  assert.deepEqual(
    result.draft.apiCalls[0].bindings,
    input.draft.apiCalls[0].bindings,
  );
});
