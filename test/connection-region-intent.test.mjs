import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  createWorkflowConnectionRegionPatch,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  describeWorkflowConnectionCandidates,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionRevision,
  planWorkflowConnectionStep,
} from '@openapi-flow/langchain';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

function fixture(independent = false) {
  const source = {
    scenario: 'Run the declared nodes, preserving their explicit dependencies.',
    materials: [],
    capabilities: [
      {
        name: 'work',
        description: 'An independent test step.',
        parametersSchema: z.strictObject({}),
        inputPorts: () => ['main'],
        outputPorts: () => ['main'],
        responseReferences: () => [],
        waitsForAllInputs: false,
        exclusiveOutputPorts: false,
      },
    ],
    nativeNodes: ['a', 'b', 'c'].map((id) => ({
      id,
      capability: 'work',
      parameters: {},
    })),
    edges: [],
    requirements: [
      {
        id: 'intent',
        text: 'Run the declared nodes, preserving their explicit dependencies.',
        sources: [
          {
            kind: 'message',
            messageId: 'request',
            quote:
              'Run the declared nodes, preserving their explicit dependencies.',
          },
        ],
      },
    ],
  };
  const goals = [
    {
      kind: independent ? 'independent' : 'semantic',
      ...(independent ? { nodeIds: ['a', 'b'] } : { scope: 'workflow' }),
      factIds: ['intent'],
      reason: 'Keep the declared intent.',
    },
  ];
  return {
    source,
    session: createWorkflowConnectionSession({ ...source, goals }),
  };
}
const node = (nodeId, incoming = [], root = false, terminalOutputs = []) => ({
  nodeId,
  incoming,
  root,
  terminalOutputs,
});
const edge = (from) => ({ from, output: 'main', input: 'main' });
function derive(source, session, nodes) {
  return createWorkflowConnectionRegionPatch({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    region: {
      kind: 'set-region',
      nodes,
      factIds: ['intent'],
      reason: 'Set only this explicit region.',
    },
  });
}
function apply(source, session, proposal) {
  return applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal,
  });
}

test('candidate groups exclude provably impossible independent routes but retain all-input joins and unconstrained future ordering', () => {
  const { source, session } = fixture(true);
  const description = describeWorkflowConnectionStep({ ...source, session });
  const consumer = description.context.nodes.find((node) => node.id === 'c');
  consumer.references = [
    { source: 'native', nodeId: 'a', pointer: '' },
    { source: 'native', nodeId: 'b', pointer: '' },
  ];
  const allowed = (groups, from, to) =>
    groups.some(
      (group) =>
        group.sources.some((node) => node.id === from) &&
        group.targets.some((node) => node.id === to),
    );
  const groups = describeWorkflowConnectionCandidates(description);
  assert.equal(allowed(groups, 'a', 'b'), false);
  assert.equal(allowed(groups, 'a', 'c'), false);
  assert.equal(allowed(groups, 'b', 'c'), false);
  consumer.waitsForAllInputs = true;
  assert.equal(
    allowed(describeWorkflowConnectionCandidates(description), 'a', 'c'),
    true,
  );
  consumer.waitsForAllInputs = false;
  assert.equal(
    allowed(
      describeWorkflowConnectionCandidates({ ...description, goals: [] }),
      'a',
      'c',
    ),
    true,
  );
  consumer.inputs = ['first', 'second'];
  consumer.inputReferences = {
    first: [{ source: 'native', nodeId: 'b', pointer: '' }],
  };
  consumer.references = [];
  const ports = describeWorkflowConnectionCandidates(description)
    .filter((group) => group.sources.some((node) => node.id === 'a'))
    .flatMap((group) =>
      group.targets
        .filter((node) => node.id === 'c')
        .flatMap((node) => node.inputs),
    );
  assert.deepEqual(ports, ['second']);
  assert.deepEqual(consumer.inputs, ['first', 'second']);
});

test('desired existing relations are retained, omitted targets are preserved, and an unchanged region makes no progress', () => {
  const { source, session } = fixture();
  const accepted = apply(
    source,
    session,
    derive(source, session, [
      node('a', [], true),
      node('b', [edge('a')]),
      node('c', [edge('b')], false, ['main']),
    ]),
  );
  assert.equal(accepted.status, 'accepted');
  const before = globalThis.structuredClone(accepted.session);
  const delta = derive(source, accepted.session, [node('b', [edge('a')])]);
  assert.deepEqual(delta.addEdges, []);
  assert.deepEqual(delta.removeEdgeIds, []);
  assert.equal(
    apply(source, accepted.session, delta).violations[0].code,
    'NO_PROGRESS',
  );
  assert.deepEqual(accepted.session, before);
});
test('one desired region removes incoming edges and declares a new independent start atomically', () => {
  const { source, session } = fixture();
  const first = apply(
    source,
    session,
    derive(source, session, [node('a', [], true), node('b', [edge('a')])]),
  );
  assert.equal(first.status, 'accepted');
  const next = apply(
    source,
    first.session,
    derive(source, first.session, [
      node('a', [], true, ['main']),
      node('b', [], true),
    ]),
  );
  assert.equal(next.status, 'accepted');
  assert.deepEqual(next.session.edges, []);
  assert.deepEqual(next.session.rootNodeIds, ['a', 'b']);
});
test('duplicate nodes/connections, stale revisions, absent fields and omitted protected edges fail without repair', () => {
  const { source, session } = fixture();
  assert.throws(
    () => derive(source, session, [node('a'), node('a')]),
    /duplicate nodeId/,
  );
  assert.throws(
    () => derive(source, session, [node('b', [edge('a'), edge('a')])]),
    /duplicate connections/,
  );
  assert.throws(
    () => derive(source, session, [{ nodeId: 'a', incoming: [], root: true }]),
    /terminalOutputs/,
  );
  const protectedSource = {
    ...source,
    edges: [{ from: 'a', output: 'main', to: 'b', input: 'main' }],
  };
  const protectedSession = createWorkflowConnectionSession({
    ...protectedSource,
    goals: session.goals.map((goal) => goal.decision),
  });
  assert.throws(
    () => derive(protectedSource, protectedSession, [node('b', [], true)]),
    /protected original connection/,
  );
  const expected = describeWorkflowConnectionStep({
    ...source,
    session,
  }).expected;
  assert.throws(
    () =>
      createWorkflowConnectionRegionPatch({
        ...source,
        session,
        expected: { ...expected, revision: 1 },
        region: {
          kind: 'set-region',
          nodes: [node('a')],
          factIds: ['intent'],
          reason: 'Stale.',
        },
      }),
    /current session/,
  );
});
test('independence contradictions fail before adoption while open unfinished work remains allowed', () => {
  const { source, session } = fixture(true);
  const bad = apply(
    source,
    session,
    derive(source, session, [node('a', [], true), node('b', [edge('a')])]),
  );
  assert.equal(bad.status, 'rejected');
  assert.equal(bad.violations[0].code, 'GOAL_CONTRADICTION');
  assert.deepEqual(bad.violations[0].details, {
    kind: 'independence',
    goalId: session.goals[0].id,
    from: 'a',
    to: 'b',
  });
  const good = apply(
    source,
    session,
    derive(source, session, [node('a', [], true)]),
  );
  assert.equal(good.status, 'accepted');
  assert.equal(good.inspection.ready, false);
  assert.equal(session.revision, 0);
});
test('root rejection identifies the actual incoming edge and its conditional precondition', () => {
  const { source, session } = fixture();
  const result = apply(
    source,
    session,
    derive(source, session, [
      node('a', [], true),
      node('b', [edge('a')], true),
    ]),
  );
  assert.equal(result.status, 'rejected');
  const root = result.violations.find((v) => v.code === 'INVALID_BOUNDARY');
  assert.deepEqual(root.details, {
    kind: 'root-precondition',
    nodeId: 'b',
    incomingEdges: [{ from: 'a', output: 'main', to: 'b', input: 'main' }],
    blockingConditions: ['incoming-edges'],
  });
});
test('old patch wire is rejected and historical rejection feedback cannot enter a new revision', async () => {
  const { source, session } = fixture();
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel({
        decision: {
          kind: 'patch',
          addEdges: [],
          removeEdgeIds: [],
          addRootNodeIds: ['a'],
          removeRootNodeIds: [],
          addTerminals: [],
          removeTerminals: [],
          factIds: ['intent'],
          reason: 'Old wire.',
        },
      }),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
  const first = apply(
    source,
    session,
    derive(source, session, [node('a', [], true)]),
  );
  const rejected = {
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: derive(source, session, [node('a', [], true)]),
    violations: [{ code: 'NO_PROGRESS', message: 'Historical only.' }],
  };
  const model = connectionPlanningModel({});
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session: first.session,
      rejectedProposals: [rejected],
      model,
    }),
    /exact current session\/source\/revision/,
  );
  assert.equal(model.calls, 0);
});

test('candidate catalog excludes the reverse of necessary transitive data and goal order', () => {
  const { source, session } = fixture();
  const description = describeWorkflowConnectionStep({ ...source, session });
  description.context.requiredPrecedence = [{ before: 'a', after: 'b' }];
  description.goals = [
    {
      id: 'order',
      decision: {
        kind: 'precedence',
        before: 'b',
        after: 'c',
        factIds: ['intent'],
        reason: 'Declared ordering.',
      },
    },
  ];
  const candidates = describeWorkflowConnectionCandidates(description);
  const allows = (from, to) =>
    candidates.some(
      (group) =>
        group.sources.some((node) => node.id === from) &&
        group.targets.some((node) => node.id === to),
    );
  assert.equal(allows('a', 'b'), true);
  assert.equal(allows('a', 'c'), true);
  assert.equal(allows('b', 'a'), false);
  assert.equal(allows('c', 'a'), false);
  assert.equal(allows('c', 'b'), false);
});

test('material revision requires explicit deletion intent for a retired native node and its incoming boundaries', async () => {
  const { source, session } = fixture();
  const accepted = apply(
    source,
    session,
    derive(source, session, [
      node('a', [], true),
      node('b', [edge('a')]),
      node('c', [edge('b')], false, ['main']),
    ]),
  );
  assert.equal(accepted.status, 'accepted');
  const before = { ...source, session: accepted.session };
  const after = {
    ...source,
    nativeNodes: source.nativeNodes.filter((node) => node.id !== 'b'),
  };
  const input = {
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
  };
  const result = await planWorkflowConnectionRevision({
    ...input,
    model: connectionPlanningModel({
      decision: {
        kind: 'revise-connections',
        goals: session.goals.map((goal) => goal.decision),
        graphChange: {
          kind: 'set-region',
          nodes: [
            { nodeId: 'b', incoming: [], root: false, finishOutputs: [] },
            {
              nodeId: 'c',
              incoming: [{ source: { nodeId: 'a' } }],
              root: false,
              finish: true,
            },
          ],
          factIds: ['intent'],
          reason:
            'Remove the explicitly retired intermediate node and reconnect the retained consumer.',
        },
      },
    }),
  });
  assert.deepEqual(result.revision.session.edges, [
    { from: 'a', output: 'main', to: 'c', input: 'main' },
  ]);
  assert.deepEqual(result.revision.session.rootNodeIds, ['a']);
});
