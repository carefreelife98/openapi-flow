import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  validateWorkflowDraft,
  inspectDraftReadiness,
  applyDraftChangeSet,
  analyzeDraftChangeImpact,
  approveWorkflowDraft,
} from '@openapi-flow/core';
import {
  workflowDraftFixture,
  scopedRequirement,
} from './fixtures/workflow-draft-fixture.mjs';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';

test('canonical drafts preserve repeated API roles and isolate the caller content', async () => {
  const { draft, content, context } = await workflowDraftFixture();
  assert.equal(draft.revision, 0);
  assert.deepEqual(draft.approvals, []);
  assert.deepEqual(
    draft.apiCalls.map((call) => call.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(draft.apiCalls[0].operation, draft.apiCalls[1].operation);
  draft.apiCalls[0].values.query.mode = 'changed';
  assert.equal(content.apiCalls[0].values.query.mode, 'first');
  assert.doesNotThrow(() => validateWorkflowDraft({ draft, context }));
});

test('a deferred decision blocks its dependency closure, not an independent branch', async () => {
  for (const state of ['needs-clarification', 'deferred']) {
    const { draft, context } = await workflowDraftFixture([
      scopedRequirement(state),
    ]);
    const readiness = inspectDraftReadiness({ draft, context });
    assert.equal(readiness.designReady, false);
    assert.equal(
      readiness.nodes.find((node) => node.nodeId === 'a').planningStatus,
      'blocked-by-decision',
    );
    assert.equal(
      readiness.nodes.find((node) => node.nodeId === 'b').planningStatus,
      'blocked-by-decision',
    );
    assert.deepEqual(
      readiness.nodes.find((node) => node.nodeId === 'b').dependencyNodeIds,
      ['a'],
    );
    assert.equal(
      readiness.nodes.find((node) => node.nodeId === 'c').planningStatus,
      'ready',
    );
    assert.throws(
      () =>
        approveWorkflowDraft({
          draft,
          context,
          expectedRevision: 0,
          nodeIds: ['a'],
        }),
      /decision-blocked/,
    );
    const approved = approveWorkflowDraft({
      draft,
      context,
      expectedRevision: 0,
      nodeIds: ['c'],
    });
    assert.equal(
      inspectDraftReadiness({ draft: approved, context }).nodes.find(
        (node) => node.nodeId === 'c',
      ).reviewed,
      true,
    );
  }
});

test('a missing actual value leaves planning ready while dependent runtime inputs remain pending', async () => {
  const { operation } = await clarificationOperation();
  const context = { operations: [operation], capabilities: [], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'deferred-runtime',
      requirements: [],
      nativeNodes: [],
      apiCalls: [
        { id: 'read', operation: operation.key, values: {}, bindings: [] },
        {
          id: 'follow',
          operation: operation.key,
          values: {},
          bindings: [
            {
              kind: 'node-output',
              sourceNodeId: 'read',
              sourcePointer: '/id',
              targetPointer: '/path/id',
            },
          ],
        },
        {
          id: 'independent',
          operation: operation.key,
          values: { path: { id: 'known' } },
          bindings: [],
        },
      ],
      edges: [{ from: 'read', output: 'main', to: 'follow', input: 'main' }],
    },
  });
  const readiness = inspectDraftReadiness({ draft, context });
  assert.equal(readiness.designReady, true);
  assert.equal(readiness.requestInputsReady, false);
  assert.equal(readiness.slots.length, 1);
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'follow').requestInputStatus,
    'needs-input',
  );
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'independent')
      .requestInputStatus,
    'ready',
  );
});

test('one content edit preserves other IDs and values, invalidating only affected approval coverage', async () => {
  const { draft, context } = await workflowDraftFixture();
  const approved = approveWorkflowDraft({
    draft,
    context,
    expectedRevision: 0,
    nodeIds: ['a', 'b', 'c'],
  });
  const before = globalThis.structuredClone(approved);
  const changed = {
    ...approved.apiCalls[0],
    values: { query: { mode: 'second' } },
  };
  const result = applyDraftChangeSet({
    draft: approved,
    context,
    changeSet: {
      baseRevision: 1,
      changes: [{ kind: 'update-api-call', call: changed }],
    },
  });
  assert.equal(result.draft.revision, 2);
  assert.deepEqual(result.impact.affectedNodeIds.sort(), ['a', 'b']);
  assert.deepEqual(result.impact.preservedNodeIds, ['c']);
  assert.deepEqual(result.draft.apiCalls[2], approved.apiCalls[2]);
  assert.deepEqual(result.draft.approvals[0].nodeIds, ['a', 'b', 'c']);
  assert.deepEqual(result.draft.approvals[0].invalidatedNodeIds.sort(), [
    'a',
    'b',
  ]);
  assert.equal(
    inspectDraftReadiness({ draft: result.draft, context }).nodes.find(
      (node) => node.nodeId === 'c',
    ).reviewed,
    true,
  );
  assert.deepEqual(approved, before);
  assert.throws(
    () =>
      applyDraftChangeSet({
        draft: result.draft,
        context,
        changeSet: {
          baseRevision: 1,
          changes: [{ kind: 'update-api-call', call: changed }],
        },
      }),
    /Stale draft revision/,
  );
  assert.throws(
    () =>
      approveWorkflowDraft({
        draft: result.draft,
        context,
        expectedRevision: 1,
        nodeIds: ['a'],
      }),
    /Stale approval revision/,
  );
});

test('adding a new consumer does not invalidate existing sibling consumers of an unchanged response', async () => {
  const { draft, context } = await workflowDraftFixture();
  const approved = approveWorkflowDraft({
    draft,
    context,
    expectedRevision: 0,
    nodeIds: ['a', 'b', 'c'],
  });
  const extra = { ...draft.apiCalls[1], id: 'd' };
  const result = applyDraftChangeSet({
    draft: approved,
    context,
    changeSet: {
      baseRevision: 1,
      changes: [
        { kind: 'add-api-call', call: extra },
        {
          kind: 'add-edge',
          edge: { from: 'a', output: 'main', to: 'd', input: 'main' },
        },
      ],
    },
  });
  assert.deepEqual(result.impact.affectedNodeIds.sort(), ['a', 'd']);
  assert.deepEqual(result.impact.preservedNodeIds.sort(), ['b', 'c']);
  assert.equal(
    inspectDraftReadiness({ draft: result.draft, context }).nodes.find(
      (node) => node.nodeId === 'b',
    ).reviewed,
    true,
  );
  assert.deepEqual(result.draft.apiCalls.slice(0, 3), draft.apiCalls);
});

test('failed multi-action changes are atomic and never repair dangling bindings, invalid ports or cycles', async () => {
  const { draft, context } = await workflowDraftFixture();
  const before = globalThis.structuredClone(draft);
  const invalid = [
    [{ kind: 'remove-node', nodeId: 'a' }],
    [
      {
        kind: 'add-edge',
        edge: { from: 'b', output: 'main', to: 'a', input: 'main' },
      },
    ],
    [
      {
        kind: 'add-edge',
        edge: { from: 'c', output: 'wrong', to: 'a', input: 'main' },
      },
    ],
    [
      { kind: 'add-api-call', call: { ...draft.apiCalls[0], id: 'new' } },
      { kind: 'remove-node', nodeId: 'not-declared' },
    ],
    [
      {
        kind: 'update-api-call',
        call: {
          ...draft.apiCalls[0],
          operation: { ...draft.apiCalls[0].operation, snapshotId: 'stale' },
        },
      },
    ],
    [
      {
        kind: 'update-api-call',
        call: { ...draft.apiCalls[0], values: { query: { mode: 0 } } },
      },
    ],
  ];
  for (const changes of invalid) {
    assert.throws(() =>
      applyDraftChangeSet({
        draft,
        context,
        changeSet: { baseRevision: 0, changes },
      }),
    );
    assert.deepEqual(draft, before);
  }
});

test('a deliberate deletion must remove its data reference and wire in the same transaction', async () => {
  const { draft, context } = await workflowDraftFixture();
  const approved = approveWorkflowDraft({
    draft,
    context,
    expectedRevision: 0,
    nodeIds: ['a', 'b', 'c'],
  });
  const result = applyDraftChangeSet({
    draft: approved,
    context,
    changeSet: {
      baseRevision: 1,
      changes: [
        { kind: 'remove-edge', edge: draft.edges[0] },
        {
          kind: 'update-api-call',
          call: { ...draft.apiCalls[1], bindings: [] },
        },
        { kind: 'remove-node', nodeId: 'a' },
      ],
    },
  });
  assert.deepEqual(result.impact.removedNodeIds, ['a']);
  assert.deepEqual(
    result.draft.apiCalls.map((call) => call.id),
    ['b', 'c'],
  );
  assert.deepEqual(result.draft.approvals[0].invalidatedNodeIds.sort(), [
    'a',
    'b',
  ]);
  assert.equal(
    inspectDraftReadiness({ draft: result.draft, context }).nodes.find(
      (node) => node.nodeId === 'c',
    ).reviewed,
    true,
  );
});

test('resolving a scoped question affects only that scope and its dependent nodes', async () => {
  const { draft, context } = await workflowDraftFixture([
    scopedRequirement('deferred', ['b']),
  ]);
  const result = applyDraftChangeSet({
    draft,
    context,
    changeSet: {
      baseRevision: 0,
      changes: [
        {
          kind: 'set-requirement',
          requirement: scopedRequirement('confirmed', ['b']),
        },
      ],
    },
  });
  assert.deepEqual(result.impact.affectedNodeIds, ['b']);
  assert.deepEqual(result.impact.preservedNodeIds.sort(), ['a', 'c']);
  assert.equal(
    inspectDraftReadiness({ draft: result.draft, context }).designReady,
    true,
  );
  assert.deepEqual(result.impact.changedRequirementIds, ['purpose']);
});

test('workflow-scoped questions block all branches without inventing a smaller scope', async () => {
  const { draft, context } = await workflowDraftFixture([
    { ...scopedRequirement('deferred'), scope: { kind: 'workflow' } },
  ]);
  assert.ok(
    inspectDraftReadiness({ draft, context }).nodes.every(
      (node) => node.planningStatus === 'blocked-by-decision',
    ),
  );
});

test('empty drafts remain incomplete and source IDs, identity collisions and no-op proposals fail clearly', async () => {
  const { draft, context, content } = await workflowDraftFixture();
  const empty = createWorkflowDraft({
    content: { ...content, apiCalls: [], edges: [] },
    context,
  });
  assert.equal(
    inspectDraftReadiness({ draft: empty, context }).designReady,
    false,
  );
  assert.throws(
    () =>
      createWorkflowDraft({
        content: {
          ...content,
          requirements: [
            {
              ...scopedRequirement('confirmed'),
              sourceMessageIds: ['fabricated'],
            },
          ],
        },
        context,
      }),
    /source message/,
  );
  assert.throws(
    () =>
      createWorkflowDraft({
        content: {
          ...content,
          requirements: [scopedRequirement('confirmed', ['unknown'])],
        },
        context,
      }),
    /unknown node/,
  );
  assert.throws(
    () =>
      applyDraftChangeSet({
        draft,
        context,
        changeSet: {
          baseRevision: 0,
          changes: [{ kind: 'update-api-call', call: draft.apiCalls[0] }],
        },
      }),
    /does not change/,
  );
  assert.throws(
    () =>
      applyDraftChangeSet({
        draft,
        context,
        changeSet: {
          baseRevision: 0,
          changes: [{ kind: 'add-api-call', call: draft.apiCalls[0] }],
        },
      }),
    /already exists/,
  );
  assert.throws(() =>
    applyDraftChangeSet({
      draft,
      context,
      changeSet: { baseRevision: 0, changes: [], approvals: [] },
    }),
  );
  assert.throws(
    () =>
      analyzeDraftChangeImpact({
        before: draft,
        after: { ...content, id: 'another-workflow' },
        context,
      }),
    /identity/,
  );
});

test('the same native capability can have multiple independent instance roles', async () => {
  const { content, context } = await workflowDraftFixture();
  const draft = createWorkflowDraft({
    context,
    content: {
      ...content,
      apiCalls: [],
      edges: [],
      nativeNodes: [
        {
          id: 'stop-one',
          capability: 'stop-and-error',
          parameters: { message: 'First case' },
        },
        {
          id: 'stop-two',
          capability: 'stop-and-error',
          parameters: { message: 'Second case' },
        },
      ],
    },
  });
  assert.deepEqual(
    inspectDraftReadiness({ draft, context }).nodes.map((node) => node.nodeId),
    ['stop-one', 'stop-two'],
  );
  assert.throws(
    () =>
      createWorkflowDraft({
        context,
        content: {
          ...content,
          nativeNodes: [
            {
              id: 'a',
              capability: 'stop-and-error',
              parameters: { message: 'collision' },
            },
          ],
        },
      }),
    /unique/,
  );
});
