import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  approveWorkflowDraft,
  describeWorkflowDraftConnectionEdit,
  createWorkflowDraftConnectionEditProposalSchema,
  resolveWorkflowDraftConnectionEdit,
  inspectDraftReadiness,
} from '@openapi-flow/core';
import {
  planWorkflowDraftConnectionEdit,
  WorkflowDraftConnectionEditPlanningError,
} from '@openapi-flow/langchain';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import {
  workflowDraftConnectionEditFixture,
  connectionEditPlan,
  connectionEditProposal,
  resolveConnectionEdit,
  addConnection,
  connectionEditModel,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';

test('one bounded connection delta preserves unrelated nodes, values, edges and original revision', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const before = globalThis.structuredClone(input.draft);
  const model = connectionEditModel(
    connectionEditProposal(input, [addConnection('follow', 'independent')]),
  );
  const result = await planWorkflowDraftConnectionEdit({ ...input, model });
  assert.equal(result.status, 'ready');
  assert.equal(model.requests.length, 1);
  assert.equal(result.candidate.draft.revision, before.revision + 1);
  assert.deepEqual(result.candidate.draft.apiCalls, before.apiCalls);
  assert.deepEqual(result.candidate.draft.edges[0], before.edges[0]);
  assert.equal(result.connections.length, 1);
  assert.deepEqual(result.connections[0].stepIds, [input.plan.steps[0].id]);
  assert.deepEqual(input.draft, before);
  const request = model.requests[0];
  assert.equal(request.messages[0].constructor.name, 'SystemMessage');
  assert.equal(request.messages[1].constructor.name, 'HumanMessage');
  assert.equal(Object.hasOwn(request.schema, '~standard'), false);
  const payload = JSON.parse(request.messages[1].content);
  assert.equal(
    payload.apiInstances.find((item) => item.nodeId === 'independent').values
      .path.id,
    'independent-id',
  );
  for (const key of ['stage', 'planId', 'fingerprint', 'revision', 'starts'])
    assert.equal(Object.hasOwn(payload, key), false);
  assert.equal(Object.hasOwn(payload.apiInstances[0], 'operation'), false);
});

test('literal-only edits and no-change plans make no connection model call', async () => {
  const input = await workflowDraftConnectionEditFixture();
  for (const decision of [
    { kind: 'revise-api-inputs', nodeId: 'source' },
    { kind: 'no-change' },
  ]) {
    const plan = connectionEditPlan(input, [decision]);
    const model = connectionEditModel({});
    const result = await planWorkflowDraftConnectionEdit({
      ...input,
      plan,
      model,
    });
    assert.equal(result.status, 'not-required');
    assert.equal(model.requests.length, 0);
  }
});

test('explicit keep preserves the revision; connection impacts invalidate only actual affected approval coverage', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const kept = resolveConnectionEdit(input, [{ kind: 'keep-connections' }]);
  assert.equal(kept.status, 'ready');
  assert.equal(kept.candidate.status, 'no-change');
  assert.deepEqual(kept.candidate.draft, input.draft);
  const approved = approveWorkflowDraft({
    ...input,
    expectedRevision: input.draft.revision,
    nodeIds: ['source', 'follow', 'independent'],
  });
  const base = { ...input, draft: approved };
  base.plan = connectionEditPlan(base, [
    { kind: 'revise-connections', nodeIds: ['independent'] },
  ]);
  const result = resolveConnectionEdit(base, [
    addConnection('follow', 'independent'),
  ]);
  assert.deepEqual(
    result.candidate.draft.approvals[0].invalidatedNodeIds.sort(),
    ['follow', 'independent'],
  );
  assert.equal(
    inspectDraftReadiness({
      draft: result.candidate.draft,
      context: base.context,
    }).nodes.find((node) => node.nodeId === 'source').reviewed,
    true,
  );
});

test('native-only plans derive actual ports without OAS or model-created node declarations', async () => {
  const context = {
    operations: [],
    capabilities: resolveN8nNativeFeatures({
      features: [N8nNativeFeature.PassThrough],
    }).capabilities,
    messages: [{ id: 'edit-1', text: 'Run second after first.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'native-only',
      apiCalls: [],
      requirements: [],
      edges: [],
      nativeNodes: ['first', 'second'].map((id) => ({
        id,
        capability: N8nNativeFeature.PassThrough,
        parameters: {},
      })),
    },
  });
  const input = {
    draft,
    context,
    requestMessageIds: ['edit-1'],
    resolutions: [],
  };
  input.plan = connectionEditPlan(input, [
    { kind: 'revise-connections', nodeIds: ['second'] },
  ]);
  const result = resolveConnectionEdit(input, [
    addConnection('first', 'second'),
  ]);
  assert.equal(result.status, 'ready');
  assert.equal(result.candidate.draft.apiCalls.length, 0);
});

test('unfinished actual contracts, binding repairs and unresolved requirements defer only this final stage without a model call', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const variants = [
    {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'source',
          operation: input.replacement.key,
        },
      ],
      resolutions: [],
    },
    {
      decisions: [{ kind: 'revise-native-node', nodeId: 'context' }],
      native: true,
    },
    {
      decisions: [
        {
          kind: 'needs-clarification',
          owner: {
            kind: 'semantic',
            scope: { kind: 'nodes', nodeIds: ['independent'] },
          },
        },
        { kind: 'revise-connections', nodeIds: ['independent'] },
      ],
      resolutions: [],
    },
  ];
  for (const variant of variants) {
    let base = input;
    if (variant.native) {
      const { revision, approvals, requirementHistory, ...content } =
        input.draft;
      assert.ok(Array.isArray(requirementHistory));
      assert.equal(revision, 0);
      assert.deepEqual(approvals, []);
      base = {
        ...input,
        draft: createWorkflowDraft({
          context: input.context,
          content: {
            ...content,
            nativeNodes: [
              {
                id: 'context',
                capability: 'typed-context',
                parameters: {
                  count: 0,
                  enabled: false,
                  nested: { value: 'actual' },
                },
              },
            ],
          },
        }),
      };
    }
    const plan = connectionEditPlan(base, variant.decisions);
    const model = connectionEditModel({});
    const result = await planWorkflowDraftConnectionEdit({
      ...base,
      plan,
      resolutions: [],
      model,
    });
    assert.equal(result.status, 'waiting-for-materials');
    assert.equal(model.requests.length, 0);
  }
  const plan = connectionEditPlan(input, [
    {
      kind: 'replace-api-operation',
      nodeId: 'source',
      operation: input.replacement.key,
    },
  ]);
  const result = await planWorkflowDraftConnectionEdit({
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-call',
        values: { path: { id: 'new-id' } },
        bindings: [],
      },
    ],
    model: connectionEditModel({}),
  });
  assert.equal(result.status, 'waiting-for-materials');
  assert.equal(result.description.stage.pendingRepairs.length, 1);
});

test('deferred runtime literals do not invent values or block actual port and DAG planning', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const plan = connectionEditPlan(input, [
    { kind: 'revise-api-inputs', nodeId: 'independent' },
    { kind: 'revise-connections', nodeIds: ['independent'] },
  ]);
  const prepared = {
    ...input,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-inputs',
        edits: [{ kind: 'remove', pointer: '/path/id' }],
      },
    ],
  };
  assert.equal(describeWorkflowDraftConnectionEdit(prepared).status, 'ready');
  const result = resolveConnectionEdit(prepared, [
    addConnection('follow', 'independent'),
  ]);
  assert.equal(result.status, 'ready');
  assert.equal(
    inspectDraftReadiness({
      draft: result.candidate.draft,
      context: input.context,
    }).slots.length,
    1,
  );
  assert.deepEqual(result.candidate.draft.apiCalls[2].values, { path: {} });
});

test('schema and resolver reject forged ports, unrelated scope, revisions, step IDs and non-editable edge removals', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const described = describeWorkflowDraftConnectionEdit(input);
  const schema = createWorkflowDraftConnectionEditProposalSchema(described);
  for (const decision of [
    addConnection('not-real', 'independent'),
    addConnection('follow', 'independent', 'true'),
    addConnection('source', 'follow'),
    { kind: 'remove', edgeId: described.existingEdges[0].id },
  ])
    assert.equal(
      schema.safeParse(connectionEditProposal(input, [decision])).success,
      false,
    );
  for (const field of [
    { revision: 4 },
    { stepIds: [input.plan.steps[0].id] },
    { nodes: [] },
  ])
    assert.equal(
      schema.safeParse({
        ...connectionEditProposal(input, [
          addConnection('follow', 'independent'),
        ]),
        ...field,
      }).success,
      false,
    );
  assert.throws(
    () =>
      resolveConnectionEdit(input, [
        addConnection('independent', 'independent'),
      ]),
    /self-cycle/,
  );
});

test('duplicate, cancelling and repeated retained edges are rejected instead of silently normalised', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const plan = connectionEditPlan(input, [
    { kind: 'revise-connections', nodeIds: ['follow'] },
  ]);
  const base = { ...input, plan };
  const edgeId = describeWorkflowDraftConnectionEdit(base).existingEdges[0].id;
  assert.throws(
    () => resolveConnectionEdit(base, [addConnection('source', 'follow')]),
    /existing edge/,
  );
  assert.throws(
    () =>
      resolveConnectionEdit(base, [
        addConnection('follow', 'independent'),
        addConnection('follow', 'independent'),
      ]),
    /duplicate/,
  );
  assert.throws(
    () =>
      resolveConnectionEdit(base, [
        { kind: 'remove', edgeId },
        addConnection('source', 'follow'),
      ]),
    /cancelling/,
  );
  assert.throws(
    () =>
      resolveConnectionEdit(base, [
        { kind: 'keep-connections' },
        addConnection('follow', 'independent'),
      ]),
    /only connection decision/,
  );
});

test('cycles and data-dependency loss fail complete atomic validation and preserve the source draft', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const plan = connectionEditPlan(input, [
    { kind: 'revise-connections', nodeIds: ['source', 'follow'] },
  ]);
  const base = { ...input, plan };
  const before = globalThis.structuredClone(input.draft);
  assert.throws(
    () => resolveConnectionEdit(base, [addConnection('follow', 'source')]),
    /cycle/i,
  );
  const edgeId = describeWorkflowDraftConnectionEdit(base).existingEdges[0].id;
  assert.throws(
    () => resolveConnectionEdit(base, [{ kind: 'remove', edgeId }]),
    /route|available|ancestor/i,
  );
  assert.deepEqual(input.draft, before);
});

test('questions return no partial candidate and still reject malformed explicit changes', async () => {
  const input = await workflowDraftConnectionEditFixture(true);
  const question = {
    kind: 'needs-clarification',
    message: 'Should independent wait for follow or remain parallel?',
  };
  const result = resolveConnectionEdit(input, [
    addConnection('follow', 'independent'),
    question,
  ]);
  assert.equal(result.status, 'needs-clarification');
  assert.equal(Object.hasOwn(result, 'connections'), false);
  assert.equal(Object.hasOwn(result, 'candidate'), false);
  assert.match(result.questions[0].id, /^connection-question:/);
  assert.ok(result.questions[0].explanation.reason);
  assert.throws(
    () =>
      resolveConnectionEdit(input, [
        addConnection('independent', 'independent'),
        question,
      ]),
    /self-cycle/,
  );
});

test('sources must quote the current request; background and invented quotations are rejected', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const description = describeWorkflowDraftConnectionEdit(input);
  const proposal = connectionEditProposal(input, [
    addConnection('follow', 'independent'),
  ]);
  for (const source of [
    {
      kind: 'message',
      messageId: 'initial',
      quote: input.context.messages[0].text,
    },
    { kind: 'message', messageId: 'edit-1', quote: 'never said' },
  ]) {
    proposal.decisions[0].sources = [source];
    assert.throws(() =>
      resolveWorkflowDraftConnectionEdit({
        ...input,
        fingerprint: description.fingerprint,
        proposal,
      }),
    );
  }
});

test('material mutations while awaiting the model invalidate the proposal without retry or rebase', async () => {
  const input = await workflowDraftConnectionEditFixture();
  const model = connectionEditModel(
    connectionEditProposal(input, [addConnection('follow', 'independent')]),
    () => {
      input.context.messages[1].text += ' Changed while awaiting.';
    },
  );
  await assert.rejects(
    planWorkflowDraftConnectionEdit({ ...input, model }),
    (error) => {
      assert.ok(error instanceof WorkflowDraftConnectionEditPlanningError);
      assert.equal(error.failure.stage, 'proposal-validation');
      return /stale|fingerprint/i.test(error.cause.message);
    },
  );
  assert.equal(model.requests.length, 1);
});

test('model-schema and topology failures retain the actual output, cause and failing stage', async () => {
  const input = await workflowDraftConnectionEditFixture();
  for (const [stage, output] of [
    ['proposal-schema', { decisions: [] }],
    [
      'proposal-validation',
      connectionEditProposal(input, [
        addConnection('independent', 'independent'),
      ]),
    ],
  ]) {
    const model = connectionEditModel(output);
    await assert.rejects(
      planWorkflowDraftConnectionEdit({ ...input, model }),
      (error) => {
        assert.ok(error instanceof WorkflowDraftConnectionEditPlanningError);
        assert.equal(error.failure.stage, stage);
        assert.deepEqual(
          error.failure.output,
          modelMessageEvidenceSelections(output),
        );
        assert.ok(error.cause);
        return true;
      },
    );
    assert.equal(model.requests.length, 1);
  }
});

test('removed-node edges are recorded code-owned changes while reconnection remains explicit', async () => {
  const input = await workflowDraftConnectionEditFixture();
  // Removing follow leaves source's original edge and no downstream data consumers.
  const plan = connectionEditPlan(input, [
    { kind: 'remove-node', nodeId: 'follow' },
  ]);
  const base = { ...input, plan };
  const described = describeWorkflowDraftConnectionEdit(base);
  assert.equal(described.status, 'ready');
  assert.ok(described.affectedNodeIds.includes('source'));
  assert.deepEqual(
    described.stage.nodeRemovalConnections.map((change) => change.edge),
    input.draft.edges,
  );
  assert.deepEqual(described.existingEdges, []);
  const kept = resolveConnectionEdit(base, [{ kind: 'keep-connections' }]);
  assert.deepEqual(kept.candidate.draft.edges, []);
  assert.deepEqual(kept.connections, []);
  const result = resolveConnectionEdit(base, [
    addConnection('source', 'independent'),
  ]);
  assert.equal(result.status, 'ready');
  assert.equal(result.candidate.draft.apiCalls.length, 2);
  assert.deepEqual(result.candidate.draft.edges, [
    { from: 'source', output: 'main', to: 'independent', input: 'main' },
  ]);
});

test('a native port change preserves obsolete edge identities until an explicit removal passes the new contract', async () => {
  const input = await workflowDraftConnectionEditFixture();
  input.context.capabilities.push(
    ...resolveN8nNativeFeatures({ features: [N8nNativeFeature.MergeAppend] })
      .capabilities,
  );
  const { revision, approvals, requirementHistory, ...content } = input.draft;
  assert.ok(Array.isArray(requirementHistory));
  assert.equal(revision, 0);
  assert.deepEqual(approvals, []);
  const draft = createWorkflowDraft({
    context: input.context,
    content: {
      ...content,
      nativeNodes: [
        {
          id: 'join',
          capability: N8nNativeFeature.MergeAppend,
          parameters: { numberInputs: 3 },
        },
      ],
      edges: [
        ...content.edges,
        ...['follow', 'independent', 'source'].map((from, index) => ({
          from,
          output: 'main',
          to: 'join',
          input: `input${index + 1}`,
        })),
      ],
    },
  });
  const base = { ...input, draft };
  const plan = connectionEditPlan(base, [
    { kind: 'revise-native-node', nodeId: 'join' },
  ]);
  const staged = {
    ...base,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'native-parameters',
        edits: [{ kind: 'set', pointer: '/numberInputs', value: 2 }],
      },
    ],
  };
  const description = describeWorkflowDraftConnectionEdit(staged);
  assert.equal(description.status, 'ready');
  assert.deepEqual(
    description.contracts.find((node) => node.id === 'join').inputs,
    ['input1', 'input2'],
  );
  const obsolete = description.existingEdges.find(
    (edge) => edge.edge.input === 'input3',
  );
  assert.equal(obsolete.editable, true);
  assert.throws(
    () => resolveConnectionEdit(staged, [{ kind: 'keep-connections' }]),
    /unknown port/,
  );
  const result = resolveConnectionEdit(staged, [
    { kind: 'remove', edgeId: obsolete.id },
  ]);
  assert.equal(result.status, 'ready');
  assert.equal(
    result.candidate.draft.edges.some((edge) => edge.input === 'input3'),
    false,
  );
  assert.deepEqual(result.candidate.draft.apiCalls, draft.apiCalls);
});

test('native branch parameters and actual Merge ports govern exclusive routing and join validation', async () => {
  const input = await workflowDraftConnectionEditFixture();
  input.context.capabilities.push(
    ...resolveN8nNativeFeatures({
      features: [N8nNativeFeature.If, N8nNativeFeature.MergeAppend],
    }).capabilities,
  );
  const plan = connectionEditPlan(input, [
    { kind: 'add-native-node', capability: N8nNativeFeature.If },
    { kind: 'add-native-node', capability: N8nNativeFeature.MergeAppend },
    {
      kind: 'revise-connections',
      nodeIds: ['source', 'follow', 'independent'],
    },
  ]);
  const [branch, merge] = plan.steps;
  const base = {
    ...input,
    plan,
    resolutions: [
      {
        stepId: branch.id,
        kind: 'native-literal',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'response', nodeId: 'source', pointer: '/value' },
              operator: 'equals',
              right: { source: 'literal', value: 'from-source' },
            },
          ],
        },
      },
      {
        stepId: merge.id,
        kind: 'native-literal',
        parameters: { numberInputs: 2 },
      },
    ],
  };
  const described = describeWorkflowDraftConnectionEdit(base);
  assert.equal(described.status, 'ready');
  assert.deepEqual(
    described.contracts.find((item) => item.id === branch.newNodeId).outputs,
    ['true', 'false'],
  );
  assert.deepEqual(
    described.contracts.find((item) => item.id === merge.newNodeId).inputs,
    ['input1', 'input2'],
  );
  const remove = { kind: 'remove', edgeId: described.existingEdges[0].id };
  const edges = [
    remove,
    addConnection('source', branch.newNodeId),
    addConnection(branch.newNodeId, 'follow', 'true'),
    addConnection(branch.newNodeId, 'independent', 'true'),
    addConnection('follow', merge.newNodeId, 'main', 'input1'),
    addConnection('independent', merge.newNodeId, 'main', 'input2'),
  ];
  assert.equal(resolveConnectionEdit(base, edges).status, 'ready');
  const exclusive = edges.map((edge) =>
    edge.kind === 'add' && edge.target.nodeId === 'independent'
      ? addConnection(branch.newNodeId, 'independent', 'false')
      : edge,
  );
  assert.throws(
    () => resolveConnectionEdit(base, exclusive),
    /mutually exclusive|unmatched/,
  );
  assert.throws(
    () =>
      resolveConnectionEdit(
        base,
        edges.filter(
          (edge) => !(edge.kind === 'add' && edge.target.port === 'input2'),
        ),
      ),
    /each join input/,
  );
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
