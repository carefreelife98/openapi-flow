import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionRevision,
  validateWorkflowConnectionRevision,
  finalizeWorkflowConnectionSession,
  workflowConnectionEdgeId,
} from '@openapi-flow/core';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
} from './fixtures/incremental-connection-fixture.mjs';

function prepared({ semantic = false } = {}) {
  const { source, goals, plan } = incrementalConnectionFixture();
  source.scenario =
    'Use typed results to read detail, price and stock, then collect all results.';
  source.requirements[0].text = source.scenario;
  source.requirements[0].sources[0].quote = source.scenario;
  const decisions = goals.filter((goal) => goal.kind !== 'independent');
  if (semantic)
    decisions.push(
      {
        kind: 'semantic',
        factIds: ['intent'],
        reason: 'Check the original price result.',
      },
      {
        kind: 'semantic',
        factIds: ['intent'],
        reason: 'Check the original stock result.',
      },
    );
  let session = createWorkflowConnectionSession({
    ...source,
    goals: decisions,
  });
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: incrementalConnectionPatch({
      addEdges: plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  });
  assert.equal(applied.status, 'accepted');
  session = applied.session;
  if (semantic) {
    const checked = applyWorkflowConnectionStep({
      ...source,
      session,
      expected: describeWorkflowConnectionStep({ ...source, session }).expected,
      proposal: {
        kind: 'request-completion',
        reason: 'Assess actual source nodes.',
        assessments: session.goals
          .filter((goal) => goal.decision.kind === 'semantic')
          .map((goal) => ({
            goalId: goal.id,
            satisfied: true,
            nodeIds: [
              goal.decision.reason.includes('price') ? 'price' : 'stock',
            ],
            reason: goal.decision.reason,
          })),
      },
    });
    assert.equal(checked.status, 'accepted');
    session = checked.session;
  }
  return { source, session, goals: decisions, plan };
}

function inputFor(fixture) {
  const before = { ...fixture.source, session: fixture.session };
  return {
    before,
    after: fixture.source,
    expected: describeWorkflowConnectionStep(before).expected,
    proposal: {
      goals: fixture.goals,
      graphChange: incrementalConnectionPatch({}),
    },
  };
}

test('accepted goal revisions preserve original source/history and revalidate the retained DAG in a new epoch', () => {
  const fixture = prepared();
  const original = globalThis.structuredClone(fixture.session);
  const input = inputFor(fixture);
  input.proposal.goals = [
    ...fixture.goals,
    {
      kind: 'precedence',
      before: 'detail',
      after: 'summary',
      factIds: ['intent'],
      reason: 'Detail must be complete before summary.',
    },
  ];
  const result = applyWorkflowConnectionRevision(input);
  assert.notEqual(result.session.id, original.id);
  assert.equal(result.inspection.ready, true);
  assert.deepEqual(result.session.edges, original.edges);
  assert.deepEqual(result.previousSession, original);
  assert.deepEqual(fixture.session, original);
  validateWorkflowConnectionRevision({ ...input, revision: result });
  assert.doesNotThrow(() =>
    finalizeWorkflowConnectionSession({
      ...fixture.source,
      session: result.session,
    }),
  );
  assert.throws(
    () =>
      applyWorkflowConnectionStep({
        ...fixture.source,
        session: result.session,
        expected: input.expected,
        proposal: incrementalConnectionPatch({}),
      }),
    /Stale connection step/,
  );
});

test('a binding-origin repair and its explicit rewiring invalidate causal consumers but preserve unrelated assessments', () => {
  const fixture = prepared({ semantic: true });
  const input = inputFor(fixture);
  const materials = globalThis.structuredClone(fixture.source.materials);
  materials.find(
    (material) => material.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'detail';
  input.after = { ...fixture.source, materials };
  const removed = describeWorkflowConnectionStep(input.before).edgeCatalog.find(
    (entry) => entry.edge.from === 'source' && entry.edge.to === 'price',
  );
  input.proposal.graphChange = incrementalConnectionPatch({
    removeEdgeIds: [removed.id],
    addEdges: [{ from: 'detail', output: 'main', to: 'price', input: 'main' }],
  });
  const result = applyWorkflowConnectionRevision(input);
  assert.deepEqual(result.impact.changedNodeIds, ['price']);
  assert.ok(result.impact.affectedNodeIds.includes('join'));
  assert.ok(result.impact.affectedNodeIds.includes('summary'));
  assert.ok(result.impact.preservedNodeIds.includes('stock'));
  const price = fixture.session.assessments.find((assessment) =>
    assessment.nodeIds.includes('price'),
  );
  const stock = fixture.session.assessments.find((assessment) =>
    assessment.nodeIds.includes('stock'),
  );
  assert.deepEqual(result.impact.invalidatedAssessmentGoalIds, [price.goalId]);
  assert.deepEqual(result.session.assessments, [stock]);
  assert.equal(
    result.inspection.ready,
    false,
    'affected semantic evidence must be assessed again',
  );
  validateWorkflowConnectionRevision({ ...input, revision: result });
  assert.equal(
    fixture.source.materials.find(
      (material) => material.arguments.callId === 'price',
    ).arguments.bindings[0].sourceNodeId,
    'source',
  );
});

test('changed bindings and incompatible retained goals are rejected together without choosing a fixed truth', () => {
  const fixture = prepared();
  const input = inputFor(fixture);
  const materials = globalThis.structuredClone(fixture.source.materials);
  materials.find(
    (material) => material.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'detail';
  input.after = { ...fixture.source, materials };
  input.proposal.goals.push({
    kind: 'independent',
    nodeIds: ['detail', 'price'],
    factIds: ['intent'],
    reason: 'An incompatible model hypothesis.',
  });
  assert.throws(
    () => applyWorkflowConnectionRevision(input),
    (error) => error.diagnostic.code === 'WORKFLOW_GRAPH_PLANNING_FAILED',
  );
  assert.equal(fixture.session.revision, 1);
});

test('no-op, ordering-only and display-only structural goal changes cannot reset a planning session', () => {
  for (const modify of [
    () => {},
    (input) => input.proposal.goals.reverse(),
    (input) => {
      input.proposal.goals = input.proposal.goals.map((goal) => ({
        ...goal,
        reason: goal.reason + ' reworded',
      }));
    },
    (input) => {
      input.after = {
        ...input.after,
        materials: [...input.after.materials].reverse(),
      };
    },
    (input) => {
      input.after = {
        ...input.after,
        capabilities: [...input.after.capabilities].reverse(),
      };
    },
    (input) => {
      const materials = globalThis.structuredClone(input.after.materials);
      materials
        .find((material) => material.arguments.callId === 'price')
        .arguments.bindings.reverse();
      input.after = { ...input.after, materials };
    },
  ]) {
    const input = inputFor(prepared());
    modify(input);
    assert.throws(
      () => applyWorkflowConnectionRevision(input),
      /no planning progress/,
    );
  }
});

test('stale sources, changed requirements/OAS and widened registry cannot masquerade as technical replanning', () => {
  for (const modify of [
    (input) => {
      input.expected.revision++;
    },
    (input) => {
      input.after = { ...input.after, scenario: 'different user request' };
    },
    (input) => {
      const requirements = globalThis.structuredClone(input.after.requirements);
      requirements[0].text += ' changed';
      input.after = { ...input.after, requirements };
    },
    (input) => {
      const materials = globalThis.structuredClone(input.after.materials);
      materials[0].operation.operation.description = 'changed OAS';
      input.after = { ...input.after, materials };
    },
    (input) => {
      input.after = {
        ...input.after,
        capabilities: [
          ...input.after.capabilities,
          { ...input.after.capabilities[0], name: 'foreign-capability' },
        ],
      };
    },
  ]) {
    const input = inputFor(prepared());
    modify(input);
    assert.throws(() => applyWorkflowConnectionRevision(input));
  }
});

test('revision replay rejects tampered impact, proposal, previous history and candidate values', () => {
  const input = inputFor(prepared());
  input.proposal.goals = [
    ...input.proposal.goals,
    {
      kind: 'precedence',
      before: 'detail',
      after: 'summary',
      factIds: ['intent'],
      reason: 'Review detail before summary.',
    },
  ];
  const result = applyWorkflowConnectionRevision(input);
  for (const mutate of [
    (receipt) => {
      receipt.impact.affectedNodeIds = [];
    },
    (receipt) => {
      receipt.proposal.goals.pop();
    },
    (receipt) => {
      receipt.previousSession.history = [];
    },
    (receipt) => {
      receipt.session.rootNodeIds = ['summary'];
    },
    (receipt) => {
      receipt.session.id = '00000000-0000-4000-8000-000000000001';
    },
  ]) {
    const revision = globalThis.structuredClone(result);
    mutate(revision);
    assert.throws(() =>
      validateWorkflowConnectionRevision({ ...input, revision }),
    );
  }
});

test('a completed region with a newly unavailable producer is not silently disconnected or repaired', () => {
  const fixture = prepared();
  const input = inputFor(fixture);
  const materials = globalThis.structuredClone(fixture.source.materials);
  materials.find(
    (material) => material.arguments.callId === 'detail',
  ).arguments.bindings[0].sourceNodeId = 'price';
  input.after = { ...fixture.source, materials };
  assert.throws(() => applyWorkflowConnectionRevision(input));
  assert.deepEqual(fixture.session.edges, fixture.plan.edges);
});

test('native output-contract changes invalidate their original evidence even when settings and ports are unchanged', () => {
  const fixture = prepared();
  const capability = {
    name: 'revision-output-fixture',
    description: 'Explicit output-contract fixture',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    outputSchema: () => ({
      type: 'object',
      properties: { value: { type: 'string' } },
    }),
  };
  const source = {
    ...fixture.source,
    capabilities: [...fixture.source.capabilities, capability],
    nativeNodes: [
      ...fixture.source.nativeNodes,
      { id: 'independent-output', capability: capability.name, parameters: {} },
    ],
  };
  const goals = [
    ...fixture.goals,
    {
      kind: 'semantic',
      factIds: ['intent'],
      reason: 'Check the declared independent output.',
    },
  ];
  let session = createWorkflowConnectionSession({ ...source, goals });
  const graph = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: incrementalConnectionPatch({
      addEdges: fixture.plan.edges,
      addRootNodeIds: ['source', 'independent-output'],
      addTerminals: [
        { nodeId: 'summary', output: 'main' },
        { nodeId: 'independent-output', output: 'main' },
      ],
    }),
  });
  assert.equal(graph.status, 'accepted');
  session = graph.session;
  const goalId = session.goals.find(
    (goal) => goal.decision.kind === 'semantic',
  ).id;
  const assessed = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: {
      kind: 'request-completion',
      reason: 'Assess this exact output contract.',
      assessments: [
        {
          goalId,
          satisfied: true,
          nodeIds: ['independent-output'],
          reason: 'The declared output matches.',
        },
      ],
    },
  });
  assert.equal(assessed.status, 'accepted');
  session = assessed.session;
  const before = { ...source, session };
  const after = {
    ...source,
    capabilities: [
      ...fixture.source.capabilities,
      {
        ...capability,
        outputSchema: () => ({
          type: 'object',
          properties: { value: { type: 'number' } },
        }),
      },
    ],
  };
  const result = applyWorkflowConnectionRevision({
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
    proposal: { goals, graphChange: incrementalConnectionPatch({}) },
  });
  assert.deepEqual(result.impact.changedNodeIds, ['independent-output']);
  assert.deepEqual(result.impact.invalidatedAssessmentGoalIds, [goalId]);
  assert.deepEqual(result.session.assessments, []);
  assert.ok(result.impact.preservedNodeIds.includes('stock'));
});

test('an explicitly editable original edge can be replaced after native port changes, without rewriting the old epoch', () => {
  const producer = {
    name: 'revision-port-producer',
    description: 'Declared port selection',
    parametersSchema: z.strictObject({ port: z.enum(['old', 'new']) }),
    inputPorts: () => ['main'],
    outputPorts: (parameters) => [parameters.port],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  const sink = {
    name: 'revision-port-sink',
    description: 'Declared consumer',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['done'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  const edge = { from: 'producer', output: 'old', to: 'sink', input: 'main' };
  const scenario = 'Run the producer, then its consumer.';
  const source = {
    scenario,
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [{ kind: 'message', messageId: 'request', quote: scenario }],
      },
    ],
    materials: [],
    capabilities: [producer, sink],
    nativeNodes: [
      {
        id: 'producer',
        capability: producer.name,
        parameters: { port: 'old' },
      },
      { id: 'sink', capability: sink.name, parameters: {} },
    ],
    edges: [edge],
    editableEdgeIds: [workflowConnectionEdgeId(edge)],
  };
  const goals = [
    {
      kind: 'precedence',
      before: 'producer',
      after: 'sink',
      factIds: ['intent'],
      reason: 'Keep the confirmed producer/consumer order.',
    },
  ];
  const initial = createWorkflowConnectionSession({ ...source, goals });
  const applied = applyWorkflowConnectionStep({
    ...source,
    session: initial,
    expected: describeWorkflowConnectionStep({ ...source, session: initial })
      .expected,
    proposal: incrementalConnectionPatch({
      addRootNodeIds: ['producer'],
      addTerminals: [{ nodeId: 'sink', output: 'done' }],
    }),
  });
  assert.equal(applied.status, 'accepted');
  const before = { ...source, session: applied.session };
  const nativeNodes = globalThis.structuredClone(source.nativeNodes);
  nativeNodes[0].parameters.port = 'new';
  const after = { ...source, nativeNodes };
  const input = {
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
    proposal: {
      goals,
      graphChange: incrementalConnectionPatch({
        removeEdgeIds: [workflowConnectionEdgeId(edge)],
        addEdges: [{ ...edge, output: 'new' }],
      }),
    },
  };
  const result = applyWorkflowConnectionRevision(input);
  assert.equal(result.inspection.ready, true);
  assert.deepEqual(result.previousSession.edges, [edge]);
  assert.deepEqual(result.sourceUpdate.edges, []);
  assert.deepEqual(after.edges, [edge]);
  validateWorkflowConnectionRevision({ ...input, revision: result });
  assert.doesNotThrow(() =>
    finalizeWorkflowConnectionSession({
      ...after,
      ...result.sourceUpdate,
      session: result.session,
    }),
  );
  const removedEarlier = applyWorkflowConnectionStep({
    ...source,
    session: initial,
    expected: describeWorkflowConnectionStep({ ...source, session: initial })
      .expected,
    proposal: incrementalConnectionPatch({
      removeEdgeIds: [workflowConnectionEdgeId(edge)],
      addRootNodeIds: ['producer'],
      addTerminals: [{ nodeId: 'producer', output: 'old' }],
    }),
  });
  assert.equal(removedEarlier.status, 'accepted');
  const earlierBefore = { ...source, session: removedEarlier.session };
  const subsequentInput = {
    before: earlierBefore,
    after,
    expected: describeWorkflowConnectionStep(earlierBefore).expected,
    proposal: {
      goals,
      graphChange: incrementalConnectionPatch({
        addEdges: [{ ...edge, output: 'new' }],
        removeTerminals: [{ nodeId: 'producer', output: 'old' }],
        addTerminals: [{ nodeId: 'sink', output: 'done' }],
      }),
    },
  };
  const subsequent = applyWorkflowConnectionRevision(subsequentInput);
  assert.equal(subsequent.inspection.ready, true);
  assert.deepEqual(subsequent.sourceUpdate.edges, []);
  validateWorkflowConnectionRevision({
    ...subsequentInput,
    revision: subsequent,
  });
  const protectedSource = { ...source, editableEdgeIds: [] };
  const protectedInitial = createWorkflowConnectionSession({
    ...protectedSource,
    goals,
  });
  const protectedBefore = { ...protectedSource, session: protectedInitial };
  assert.throws(
    () =>
      applyWorkflowConnectionRevision({
        before: protectedBefore,
        after: { ...protectedSource, nativeNodes },
        expected: describeWorkflowConnectionStep(protectedBefore).expected,
        proposal: input.proposal,
      }),
    /not editable/,
  );
});
