import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowConnectionSession,
  createWorkflowConnectionOutline,
  applyWorkflowConnectionStep,
  applyWorkflowConnectionOutlineStep,
} from '@openapi-flow/core';
import { planWorkflowConnectionStep } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

function independentCalls() {
  const { source } = incrementalConnectionFixture();
  const original = source.materials[0];
  source.materials = ['first', 'second', 'third'].map((callId) => ({
    ...globalThis.structuredClone(original),
    arguments: { ...globalThis.structuredClone(original.arguments), callId },
  }));
  source.nativeNodes = [];
  const session = createWorkflowConnectionSession({
    ...source,
    goals: [
      {
        kind: 'independent',
        nodeIds: ['first', 'second', 'third'],
        factIds: ['intent'],
        reason: 'Explicit independent synthetic calls.',
      },
    ],
  });
  return { source, session };
}

test('a partial connection patch never places unrelated independent calls as roots or terminals', async () => {
  const { source, session } = independentCalls();
  const proposal = incrementalConnectionPatch({
    addRootNodeIds: ['first'],
    addTerminals: [{ nodeId: 'first', output: 'main' }],
  });
  const planned = await planWorkflowConnectionStep({
    ...source,
    session,
    model: connectionPlanningModel({
      decision: incrementalConnectionModelPatch(source, proposal),
    }),
  });
  assert.deepEqual(planned.decision.addRootNodeIds, ['first']);
  assert.deepEqual(planned.decision.addTerminals, proposal.addTerminals);
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: planned.expected,
    proposal: planned.decision,
  });
  assert.equal(applied.status, 'accepted', JSON.stringify(applied));
  assert.deepEqual(applied.inspection.pendingNodeIds, ['second', 'third']);
  assert.equal(applied.inspection.ready, false);
  assert.deepEqual(session.rootNodeIds, []);
});

test('a scoped independent bundle does not conflict with unrelated automatically created boundaries', async () => {
  const { source, session } = independentCalls();
  const outline = createWorkflowConnectionOutline({
    ...source,
    session,
    proposal: {
      purpose: 'Two independently planned work bundles',
      bundles: [
        {
          purpose: 'First call only',
          nodeIds: ['first'],
          goalIds: session.goals.map((goal) => goal.id),
          factIds: ['intent'],
          reason: 'Selected scope',
        },
        {
          purpose: 'Remaining calls',
          nodeIds: ['second', 'third'],
          goalIds: [],
          factIds: ['intent'],
          reason: 'Not selected in this step',
        },
      ],
    },
  });
  const bundleId = outline.bundles[0].id;
  const planned = await planWorkflowConnectionStep({
    ...source,
    session,
    outline,
    bundleId,
    model: connectionPlanningModel({
      decision: incrementalConnectionModelPatch(
        source,
        incrementalConnectionPatch({
          addRootNodeIds: ['first'],
          addTerminals: [{ nodeId: 'first', output: 'main' }],
        }),
      ),
    }),
  });
  const applied = applyWorkflowConnectionOutlineStep({
    ...source,
    session,
    outline,
    bundleId,
    expected: planned.expected,
    proposal: planned.decision,
  });
  assert.equal(applied.status, 'accepted', JSON.stringify(applied));
  assert.deepEqual(applied.session.rootNodeIds, ['first']);
  assert.deepEqual(applied.inspection.pendingNodeIds, ['second', 'third']);
});

test('an empty model patch cannot finish or place missing nodes by inferring boundaries', async () => {
  const { source, session } = independentCalls();
  const planned = await planWorkflowConnectionStep({
    ...source,
    session,
    model: connectionPlanningModel({
      decision: incrementalConnectionModelPatch(
        source,
        incrementalConnectionPatch({}),
      ),
    }),
  });
  assert.deepEqual(planned.decision.addRootNodeIds, []);
  assert.deepEqual(planned.decision.addTerminals, []);
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: planned.expected,
    proposal: planned.decision,
  });
  assert.equal(applied.status, 'rejected');
  assert.deepEqual(session.rootNodeIds, []);
});
