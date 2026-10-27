import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkflowConnectionStep,
  createWorkflowConnectionSession,
  finalizeWorkflowConnectionSession,
  describeWorkflowConnectionStep,
} from '@openapi-flow/core';
import { planWorkflowConnectionStep } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionModelPatch,
  incrementalConnectionPatch,
} from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';
import { createWorkflowConnectionPatchSelectionSchema } from '../packages/langchain/dist/schemas/workflow-connection-step-schema.js';
import { resolveConnectionEndpointSelections } from '../packages/langchain/dist/workflow/connections/resolve-connection-selections.js';

test('model explicitly selects independent starts and finishes; code resolves unique output ports', async () => {
  const { source } = incrementalConnectionFixture();
  const original = source.materials[0];
  source.materials = ['first', 'second', 'third'].map((callId) => ({
    ...globalThis.structuredClone(original),
    arguments: { ...globalThis.structuredClone(original.arguments), callId },
  }));
  source.nativeNodes = [];
  const goals = [
    {
      kind: 'independent',
      nodeIds: ['first', 'second', 'third'],
      factIds: ['intent'],
      reason: 'The supplied API instances are independent.',
    },
  ];
  const session = createWorkflowConnectionSession({ ...source, goals });
  const raw = incrementalConnectionModelPatch(
    source,
    incrementalConnectionPatch({
      addRootNodeIds: ['first', 'second', 'third'],
      addTerminals: ['first', 'second', 'third'].map((nodeId) => ({
        nodeId,
        output: 'main',
      })),
    }),
  );
  const planned = await planWorkflowConnectionStep({
    ...source,
    session,
    model: connectionPlanningModel({ decision: raw }, ({ schema }) => {
      const patch = schema.properties.decision.anyOf.find(
        (entry) => entry.properties.kind.const === 'patch',
      );
      for (const field of [
        'addRootNodeIds',
        'removeRootNodeIds',
        'addTerminals',
        'removeTerminals',
      ])
        assert.equal(Object.hasOwn(patch.properties, field), true);
    }),
  });
  assert.deepEqual(planned.decision.addRootNodeIds, [
    'first',
    'second',
    'third',
  ]);
  assert.deepEqual(
    planned.decision.addTerminals,
    ['first', 'second', 'third'].map((nodeId) => ({ nodeId, output: 'main' })),
  );
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: planned.expected,
    proposal: planned.decision,
  });
  assert.equal(applied.status, 'accepted', JSON.stringify(applied));
  assert.equal(applied.inspection.ready, true);
  assert.deepEqual(
    finalizeWorkflowConnectionSession({ ...source, session: applied.session })
      .starts,
    ['first', 'second', 'third'],
  );
  assert.deepEqual(session.rootNodeIds, []);
});

test('connecting a previous terminal reopens it in the same code-created atomic patch', async () => {
  const { source, goals, plan } = incrementalConnectionFixture();
  let session = createWorkflowConnectionSession({ ...source, goals });
  const branchEnds = ['detail', 'price', 'stock'].map((nodeId) => ({
    nodeId,
    output: 'main',
  }));
  for (const proposed of [
    incrementalConnectionPatch({
      addEdges: plan.edges.filter((edge) => edge.from === 'source'),
      addRootNodeIds: ['source'],
      addTerminals: branchEnds,
    }),
    incrementalConnectionPatch({
      addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
      removeTerminals: branchEnds,
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  ]) {
    const edges = proposed.addEdges;
    const planned = await planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel({
        decision: incrementalConnectionModelPatch(source, proposed),
      }),
    });
    for (const terminal of planned.decision.addTerminals)
      assert.equal(
        edges.some(
          (edge) =>
            edge.from === terminal.nodeId && edge.output === terminal.output,
        ),
        false,
      );
    const applied = applyWorkflowConnectionStep({
      ...source,
      session,
      expected: planned.expected,
      proposal: planned.decision,
    });
    assert.equal(applied.status, 'accepted', JSON.stringify(applied));
    session = applied.session;
  }
  assert.deepEqual(session.terminals, [{ nodeId: 'summary', output: 'main' }]);
  assert.deepEqual(
    finalizeWorkflowConnectionSession({ ...source, session }).edges,
    plan.edges,
  );
});

test('a fabricated terminal port is rejected instead of replaced with the unique actual output', async () => {
  const { source, goals } = incrementalConnectionFixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const decision = {
    ...incrementalConnectionModelPatch(source, incrementalConnectionPatch({})),
    addTerminals: [{ nodeId: 'source', port: 'not-a-declared-output' }],
  };
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel({ decision }),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
  assert.deepEqual(session.rootNodeIds, []);
});

test('revision boundary removal uses the actual previous ports while new terminal intent uses revised ports', () => {
  const { source, goals } = incrementalConnectionFixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const before = describeWorkflowConnectionStep({ ...source, session });
  const revisedNodes = globalThis.structuredClone(before.context.nodes);
  const changed = revisedNodes.find((node) => node.id === 'summary');
  assert.ok(changed);
  changed.outputs = ['revised-output'];
  const description = {
    ...before,
    context: { ...before.context, nodes: revisedNodes },
    terminals: [{ nodeId: 'summary', output: 'main' }],
  };
  const schema = createWorkflowConnectionPatchSelectionSchema(
    description,
    before.context.nodes,
  );
  const selection = schema.parse({
    ...incrementalConnectionModelPatch(source, incrementalConnectionPatch({})),
    addTerminals: [{ nodeId: 'summary' }],
    removeTerminals: [{ nodeId: 'summary' }],
  });
  assert.deepEqual(
    resolveConnectionEndpointSelections(selection.addTerminals, revisedNodes),
    [{ nodeId: 'summary', output: 'revised-output' }],
  );
  assert.deepEqual(
    resolveConnectionEndpointSelections(
      selection.removeTerminals,
      before.context.nodes,
    ),
    [{ nodeId: 'summary', output: 'main' }],
  );
  assert.deepEqual(
    before.context.nodes.find((node) => node.id === 'summary').outputs,
    ['main'],
  );
});
