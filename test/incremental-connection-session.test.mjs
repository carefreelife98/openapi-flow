import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  finalizeWorkflowConnectionSession,
  workflowConnectionEdgeId,
  extendWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  incrementalConnectionFixture as fixture,
  incrementalConnectionPatch as patch,
} from './fixtures/incremental-connection-fixture.mjs';

function apply(source, session, proposal) {
  return applyWorkflowConnectionStep({
    ...source,
    session,
    expected: {
      sessionId: session.id,
      sourceFingerprint: session.sourceFingerprint,
      revision: session.revision,
    },
    proposal,
  });
}

function complete(source, goals, plan) {
  const session = createWorkflowConnectionSession({ ...source, goals });
  const result = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: plan.edges,
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  assert.equal(
    result.inspection.ready,
    true,
    JSON.stringify(result.inspection),
  );
  return result.session;
}

test('native augmentation preserves accepted bundles, goals and original API data while invalidating old proposals', () => {
  const { source, goals, plan } = fixture();
  const additionalNativeNodes = source.nativeNodes;
  source.nativeNodes = [];
  const session = createWorkflowConnectionSession({
    ...source,
    goals: goals.filter((goal) => goal.kind !== 'join'),
  });
  const first = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: plan.edges.filter((edge) => edge.from === 'source'),
    }),
  );
  assert.equal(first.status, 'accepted');
  const before = globalThis.structuredClone(first.session);
  const expected = describeWorkflowConnectionStep({
    ...source,
    session: before,
  }).expected;
  const extended = extendWorkflowConnectionSession({
    ...source,
    session: before,
    expected,
    additionalNativeNodes,
  });
  assert.equal(extended.session.id, before.id);
  assert.equal(extended.session.revision, before.revision);
  assert.notEqual(extended.session.sourceFingerprint, before.sourceFingerprint);
  for (const field of ['edges', 'goals', 'history', 'rootNodeIds', 'terminals'])
    assert.deepEqual(extended.session[field], before[field]);
  assert.deepEqual(extended.previous, expected);
  assert.deepEqual(extended.addedNativeNodeIds, ['join']);
  const expanded = { ...source, nativeNodes: additionalNativeNodes };
  assert.throws(
    () =>
      applyWorkflowConnectionStep({
        ...expanded,
        session: extended.session,
        expected,
        proposal: patch({
          addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
        }),
      }),
    /Stale connection step/,
  );
  const finished = apply(
    expanded,
    extended.session,
    patch({
      addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(finished.status, 'accepted');
  assert.deepEqual(
    finalizeWorkflowConnectionSession({
      ...expanded,
      session: finished.session,
    }).edges,
    plan.edges,
  );
  assert.deepEqual(first.session, before);
  assert.deepEqual(source.materials, fixture().source.materials);
});

test('native augmentation rejects empty, duplicate, unsupported and invalid material atomically', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const expected = describeWorkflowConnectionStep({
    ...source,
    session,
  }).expected;
  const before = globalThis.structuredClone(session);
  for (const additionalNativeNodes of [
    undefined,
    null,
    {},
    [null],
    [],
    [source.nativeNodes[0]],
    [{ ...source.nativeNodes[0], id: 'extra', capability: 'unknown' }],
    [{ ...source.nativeNodes[0], id: 'extra', parameters: { invented: true } }],
  ]) {
    assert.throws(() =>
      extendWorkflowConnectionSession({
        ...source,
        session,
        expected,
        additionalNativeNodes,
      }),
    );
    assert.deepEqual(session, before);
  }
});

test('native augmentation rejects a stale receipt or changed API source before extending it', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const expected = describeWorkflowConnectionStep({
    ...source,
    session,
  }).expected;
  const additionalNativeNodes = [{ ...source.nativeNodes[0], id: 'extra' }];
  assert.throws(
    () =>
      extendWorkflowConnectionSession({
        ...source,
        session,
        expected: { ...expected, revision: 1 },
        additionalNativeNodes,
      }),
    /stale/,
  );
  const changed = { ...source, scenario: source.scenario + ' Changed.' };
  assert.throws(
    () =>
      extendWorkflowConnectionSession({
        ...changed,
        session,
        expected,
        additionalNativeNodes,
      }),
    /different source snapshot/,
  );
});

test('a new partial graph does not turn unconnected nodes into roots or claim completion', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  assert.deepEqual(session.rootNodeIds, []);
  assert.equal(session.revision, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), session);
  const inspection = inspectWorkflowConnectionCompletion({
    ...source,
    session,
  });
  assert.equal(inspection.ready, false);
  assert.equal(inspection.pendingNodeIds.length, 6);
  assert.ok(inspection.openBoundaries.length > 0);
  assert.throws(
    () => finalizeWorkflowConnectionSession({ ...source, session }),
    /incomplete/,
  );
});

test('fan-out and join bundles keep the same final five-API DAG without per-edge approval', () => {
  const { source, goals, plan } = fixture();
  const original = createWorkflowConnectionSession({ ...source, goals });
  const first = apply(
    source,
    original,
    patch({
      addRootNodeIds: ['source'],
      addEdges: plan.edges.filter((edge) => edge.from === 'source'),
    }),
  );
  assert.equal(first.status, 'accepted', JSON.stringify(first));
  assert.equal(first.inspection.ready, false);
  assert.deepEqual(first.session.rootNodeIds, ['source']);
  assert.deepEqual(first.inspection.pendingNodeIds, ['summary', 'join']);
  assert.deepEqual(original.edges, []);
  assert.equal(original.revision, 0);
  const second = apply(
    source,
    first.session,
    patch({
      addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(second.status, 'accepted', JSON.stringify(second));
  assert.equal(
    second.inspection.ready,
    true,
    JSON.stringify(second.inspection),
  );
  assert.equal(second.session.revision, 2);
  const actual = finalizeWorkflowConnectionSession({
    ...source,
    session: second.session,
  });
  assert.deepEqual(actual.edges, plan.edges);
  assert.deepEqual(actual.starts, ['source']);
  assert.deepEqual(actual.nativeNodes, plan.nativeNodes);
  assert.deepEqual(actual.calls, plan.calls);
  assert.deepEqual(source.materials, fixture().source.materials);
});

test('every independent producer precedes the summary through an all-input join; another required input is not a bypass', () => {
  const { source, goals, plan } = fixture();
  const basis = {
    factIds: ['intent'],
    reason: 'All three responses must be completed before the summary.',
  };
  const confirmed = [
    ...goals,
    ...['detail', 'price', 'stock'].map((before) => ({
      kind: 'precedence',
      before,
      after: 'summary',
      ...basis,
    })),
    { kind: 'route', from: 'detail', output: 'main', to: 'summary', ...basis },
  ];
  const session = complete(source, confirmed, plan);
  const inspection = inspectWorkflowConnectionCompletion({
    ...source,
    session,
  });
  assert.equal(inspection.ready, true);
  assert.deepEqual(inspection.unmetGoalIds, []);
  assert.equal(Object.hasOwn(inspection, 'routeStates'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(inspection)), inspection);
});

test('output-route proof combines required join inputs but still rejects a real direct bypass', () => {
  const { source } = fixture();
  source.materials = [];
  const pass = {
    name: 'test-route-pass',
    description: 'A reference-free pass-through test contract',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  source.capabilities.push(pass, {
    ...pass,
    name: 'test-route-source',
    outputPorts: () => ['left', 'right'],
  });
  source.nativeNodes = [
    { id: 'root', capability: 'test-route-source', parameters: {} },
    ...['a', 'b', 'end'].map((id) => ({
      id,
      capability: pass.name,
      parameters: {},
    })),
    { id: 'join', capability: 'merge-append', parameters: { numberInputs: 2 } },
  ];
  const basis = {
    factIds: ['intent'],
    reason: 'Preserve the exact required predecessor and output event.',
  };
  const goals = [
    { kind: 'precedence', before: 'a', after: 'end', ...basis },
    { kind: 'route', from: 'root', output: 'left', to: 'end', ...basis },
  ];
  const plan = {
    edges: [
      { from: 'root', output: 'left', to: 'a', input: 'main' },
      { from: 'root', output: 'right', to: 'b', input: 'main' },
      { from: 'a', output: 'main', to: 'join', input: 'input1' },
      { from: 'b', output: 'main', to: 'join', input: 'input2' },
      { from: 'join', output: 'main', to: 'end', input: 'main' },
    ],
  };
  const initial = createWorkflowConnectionSession({ ...source, goals });
  const accepted = apply(
    source,
    initial,
    patch({
      addRootNodeIds: ['root'],
      addEdges: plan.edges,
      addTerminals: [{ nodeId: 'end', output: 'main' }],
    }),
  );
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.inspection.ready, true);
  const bypass = apply(
    source,
    accepted.session,
    patch({
      addEdges: [{ from: 'root', output: 'right', to: 'end', input: 'main' }],
    }),
  );
  assert.equal(bypass.status, 'accepted');
  assert.deepEqual(bypass.inspection.violations, []);
  assert.equal(bypass.inspection.ready, false);
  assert.deepEqual(
    bypass.inspection.unmetGoalIds.slice().sort(),
    initial.goals.map((goal) => goal.id).sort(),
  );
  assert.throws(
    () =>
      finalizeWorkflowConnectionSession({ ...source, session: bypass.session }),
    /incomplete/,
  );
});

test('one invalid edge rejects the entire bundle and leaves source and session unchanged', () => {
  const { source, goals, plan } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const before = globalThis.structuredClone(session);
  const result = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: [plan.edges[0], { ...plan.edges[1], output: 'invented-port' }],
    }),
  );
  assert.equal(result.status, 'rejected');
  assert.equal(result.violations[0].code, 'INVALID_EDGE');
  assert.deepEqual(session, before);
});

test('a consumer of a preceding response cannot become an independent root', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const result = apply(source, session, patch({ addRootNodeIds: ['detail'] }));
  assert.equal(result.status, 'rejected');
  assert.equal(result.violations[0].code, 'INVALID_BOUNDARY');
});

test('cycles are rejected even in an open region', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const result = apply(
    source,
    session,
    patch({
      addEdges: [
        { from: 'detail', output: 'main', to: 'price', input: 'main' },
        { from: 'price', output: 'main', to: 'detail', input: 'main' },
      ],
    }),
  );
  assert.equal(result.status, 'rejected');
  assert.equal(result.violations[0].code, 'CYCLE');
});

test('a closed region must preserve response availability; missing connections are not ignored', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const result = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: [
        { from: 'source', output: 'main', to: 'summary', input: 'main' },
      ],
    }),
  );
  assert.equal(result.status, 'rejected');
  assert.equal(result.violations[0].code, 'CLOSED_REGION_INVALID');
});

test('original edges stay protected unless the caller explicitly makes their IDs editable', () => {
  const { source, goals, plan } = fixture();
  source.edges = [plan.edges[0]];
  const edgeId = workflowConnectionEdgeId(source.edges[0]);
  let session = createWorkflowConnectionSession({ ...source, goals });
  const rejected = apply(source, session, patch({ removeEdgeIds: [edgeId] }));
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.violations[0].message, /not editable/);
  source.editableEdgeIds = [edgeId];
  session = createWorkflowConnectionSession({ ...source, goals });
  const accepted = apply(source, session, patch({ removeEdgeIds: [edgeId] }));
  assert.equal(accepted.status, 'accepted');
  assert.deepEqual(accepted.session.edges, []);
});

test('a stale revision or changed source is an input failure, not a replannable model proposal', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  assert.throws(
    () =>
      applyWorkflowConnectionStep({
        ...source,
        session,
        expected: {
          sessionId: session.id,
          sourceFingerprint: session.sourceFingerprint,
          revision: 1,
        },
        proposal: patch({}),
      }),
    /Stale/,
  );
  assert.throws(
    () =>
      describeWorkflowConnectionStep({
        ...source,
        session,
        scenario: `${source.scenario} changed`,
      }),
    /different source snapshot/,
  );
});

test('an equally numbered response from another session cannot be applied even when source snapshots match', () => {
  const { source, goals } = fixture();
  const first = createWorkflowConnectionSession({ ...source, goals });
  const second = createWorkflowConnectionSession({ ...source, goals });
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(first.revision, second.revision);
  assert.notEqual(first.id, second.id);
  assert.throws(
    () =>
      applyWorkflowConnectionStep({
        ...source,
        session: second,
        expected: describeWorkflowConnectionStep({ ...source, session: first })
          .expected,
        proposal: patch({ addRootNodeIds: ['source'] }),
      }),
    (error) => {
      assert.equal(error.diagnostic.code, 'PLANNING_INPUT_INVALID');
      assert.match(error.message, /Stale connection step/);
      return true;
    },
  );
  assert.deepEqual(second.rootNodeIds, []);
});

test('mutable graph state and accepted history are checked together after JSON checkpoint restore', () => {
  const { source, goals, plan } = fixture();
  const session = complete(source, goals, plan);
  const restored = JSON.parse(JSON.stringify(session));
  assert.equal(
    inspectWorkflowConnectionCompletion({ ...source, session: restored }).ready,
    true,
  );
  restored.edges.pop();
  assert.throws(
    () => inspectWorkflowConnectionCompletion({ ...source, session: restored }),
    /differs from/,
  );
  restored.edges = globalThis.structuredClone(session.edges);
  restored.history[0].baseRevision = 99;
  assert.throws(
    () => inspectWorkflowConnectionCompletion({ ...source, session: restored }),
    /stale revision/,
  );
});

test('an empty repeated patch is rejected as no progress', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const result = apply(source, session, patch({}));
  assert.equal(result.status, 'rejected');
  assert.equal(result.violations[0].code, 'NO_PROGRESS');
});

test('a return to an earlier partial state is rejected instead of consuming an unlimited loop', () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const first = apply(source, session, patch({ addRootNodeIds: ['source'] }));
  assert.equal(first.status, 'accepted');
  const repeated = apply(
    source,
    first.session,
    patch({ removeRootNodeIds: ['source'] }),
  );
  assert.equal(repeated.status, 'rejected');
  assert.equal(repeated.violations[0].code, 'NO_PROGRESS');
  assert.equal(first.session.revision, 1);
});

test('reordering the same execution edges is not a new planning state', () => {
  const { source, goals, plan } = fixture();
  const edges = plan.edges.filter((edge) => edge.from === 'source');
  const session = createWorkflowConnectionSession({ ...source, goals });
  const first = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: edges,
    }),
  );
  assert.equal(first.status, 'accepted');
  const reordered = apply(
    source,
    first.session,
    patch({
      removeEdgeIds: [workflowConnectionEdgeId(edges[0])],
      addEdges: [edges[0]],
    }),
  );
  assert.equal(reordered.status, 'rejected');
  assert.equal(reordered.violations[0].code, 'NO_PROGRESS');
  assert.deepEqual(first.session.edges, edges);
});

test('semantic assessments do not bypass open boundaries or pretend to be deterministic proof', () => {
  const { source, goals, plan } = fixture();
  goals.push({
    kind: 'semantic',
    factIds: ['intent'],
    reason: 'Review the business intent.',
  });
  let session = createWorkflowConnectionSession({ ...source, goals });
  const goalId = session.goals.find(
    (goal) => goal.decision.kind === 'semantic',
  ).id;
  const result = apply(source, session, {
    kind: 'request-completion',
    assessments: [
      {
        goalId,
        satisfied: true,
        nodeIds: ['source'],
        reason: 'Source is present.',
      },
    ],
    reason: 'Request a code-owned completion check.',
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.inspection.ready, false);
  assert.deepEqual(result.inspection.semanticAssessmentGoalIds, [goalId]);
  session = result.session;
  const patched = apply(
    source,
    session,
    patch({
      addEdges: plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(patched.status, 'accepted');
  assert.equal(patched.inspection.ready, false);
  assert.deepEqual(patched.session.assessments, []);
  assert.deepEqual(patched.inspection.unmetGoalIds, [goalId]);
});

test('goal proposals must cite every fact and use actual contract nodes and outputs', () => {
  const { source, goals } = fixture();
  for (const invalid of [
    [],
    [
      {
        kind: 'precedence',
        before: 'source',
        after: 'absent',
        factIds: ['intent'],
        reason: 'Unknown node.',
      },
    ],
    [
      {
        kind: 'route',
        from: 'source',
        output: 'absent',
        to: 'detail',
        factIds: ['intent'],
        reason: 'Unknown port.',
      },
    ],
    [{ ...goals[0], factIds: ['unknown'] }],
  ])
    assert.throws(() =>
      createWorkflowConnectionSession({ ...source, goals: invalid }),
    );
});

test('terminals are explicit decisions and must be reopened in the same atomic patch as a new outgoing edge', () => {
  const { source, goals, plan } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const first = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'source', output: 'main' }],
    }),
  );
  assert.equal(first.status, 'accepted');
  const rejected = apply(
    source,
    first.session,
    patch({ addEdges: [plan.edges[0]] }),
  );
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.violations[0].code, 'INVALID_BOUNDARY');
  const accepted = apply(
    source,
    first.session,
    patch({
      removeTerminals: [{ nodeId: 'source', output: 'main' }],
      addEdges: [plan.edges[0]],
    }),
  );
  assert.equal(accepted.status, 'accepted');
});

test('mutually exclusive alternatives cannot close an all-input join, even in an otherwise connected bundle', () => {
  const { source, goals, plan } = fixture();
  source.capabilities.push({
    name: 'test-switch',
    description: 'Two mutually exclusive alternatives.',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['yes', 'no'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: true,
  });
  source.nativeNodes.push({
    id: 'switch',
    capability: 'test-switch',
    parameters: {},
  });
  const session = createWorkflowConnectionSession({ ...source, goals });
  const edges = plan.edges.filter(
    (edge) =>
      !(edge.from === 'source' && ['detail', 'price'].includes(edge.to)),
  );
  edges.push(
    { from: 'source', output: 'main', to: 'switch', input: 'main' },
    { from: 'switch', output: 'yes', to: 'detail', input: 'main' },
    { from: 'switch', output: 'no', to: 'price', input: 'main' },
  );
  const rejected = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: edges,
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.violations[0].code, 'CLOSED_REGION_INVALID');
  assert.match(rejected.violations[0].message, /mutually exclusive/);
  assert.deepEqual(session.edges, []);
});

test('a structurally valid serial graph is incomplete when it violates confirmed independent execution', () => {
  const { source, goals, plan } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const edges = plan.edges.filter(
    (edge) => !(edge.from === 'source' && edge.to === 'price'),
  );
  edges.push({ from: 'detail', output: 'main', to: 'price', input: 'main' });
  const result = apply(
    source,
    session,
    patch({
      addRootNodeIds: ['source'],
      addEdges: edges,
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  assert.deepEqual(result.inspection.violations, []);
  assert.equal(result.inspection.ready, false);
  assert.deepEqual(result.inspection.unmetGoalIds, [
    session.goals.find((goal) => goal.decision.kind === 'independent').id,
  ]);
  assert.throws(
    () =>
      finalizeWorkflowConnectionSession({ ...source, session: result.session }),
    /incomplete/,
  );
});

test('a bypass added to a finished draft candidate cannot destroy previously proven response availability', () => {
  const { source, goals, plan } = fixture();
  const session = complete(source, goals, plan);
  const before = globalThis.structuredClone(session);
  const rejected = apply(
    source,
    session,
    patch({
      addEdges: [
        { from: 'detail', output: 'main', to: 'summary', input: 'main' },
      ],
    }),
  );
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.violations[0].code, 'CLOSED_REGION_INVALID');
  assert.deepEqual(session, before);
  assert.deepEqual(
    finalizeWorkflowConnectionSession({ ...source, session }).edges,
    plan.edges,
  );
});
