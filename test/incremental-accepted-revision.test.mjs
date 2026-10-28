import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  planWorkflowConnectionRevision,
  reviewWorkflowConnectionGoals,
  createWorkflowConnectionRevisionRejection,
} from '@openapi-flow/langchain';
import {
  createIncrementalWorkflowConnectionGraph,
  resolveIncrementalConnectionSource,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  describeWorkflowConnectionStep,
  describeWorkflowConnectionOutline,
  workflowConnectionEdgeId,
  extendWorkflowConnectionSession,
  applyWorkflowConnectionRevision,
} from '@openapi-flow/core';
import { recoveryQueueModel } from './fixtures/initial-connection-recovery-fixture.mjs';
import { acceptedConnectionRecoveryFixture } from './fixtures/accepted-connection-recovery-fixture.mjs';
import { connectionGoalReviewOutput } from './fixtures/connection-goal-review-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const policy = {
  maxModelInvocations: 15,
  maxRejectedProposals: 4,
  deadlineMs: 30000,
};
function configured(fixture, model, options = {}) {
  return {
    source: () => fixture.broken,
    model,
    policy,
    revisionPlanning: { model },
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => fixture.replacement,
    },
    ...options,
  };
}
function outputs(fixture) {
  return [
    { goals: fixture.acceptedGoals },
    fixture.firstPatch,
    fixture.completion,
    { decision: fixture.request },
    fixture.correctedRevision,
  ];
}

test('an accepted partial plan returns to the actual binding stage and adopts corrected material/goals/connections without losing its accepted region', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  let callbacks = 0;
  const model = recoveryQueueModel(outputs(fixture), ({ payload }, index) => {
    if (index === 3) {
      assert.equal(payload.before.expected.revision, 1);
      assert.deepEqual(payload.before.context.edges, fixture.firstEdges);
      assert.equal(payload.rejectedConnections.length, 1);
      assert.equal(
        payload.rejectedConnections[0].proposal.kind,
        'request-completion',
      );
    }
    if (index === 4) {
      assert.equal(payload.materialChanges.apiCalls[0].callId, 'price');
      assert.equal(
        payload.materialChanges.apiCalls[0].before.bindings[0].sourceNodeId,
        'detail',
      );
      assert.equal(
        payload.materialChanges.apiCalls[0].after.bindings[0].sourceNodeId,
        'source',
      );
    }
  });
  const options = configured(fixture, model, {
    materialRecovery: {
      modelInvocations: 0,
      replan: async ({ source, request }) => {
        callbacks++;
        assert.equal(
          source.materials.find((item) => item.arguments.callId === 'price')
            .arguments.bindings[0].sourceNodeId,
          'detail',
        );
        assert.deepEqual(request.request.targets, fixture.request.targets);
        return fixture.replacement;
      },
    },
  });
  const state = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 5);
  assert.equal(state.sourceEvents.length, 1);
  const event = state.sourceEvents[0];
  assert.equal(event.kind, 'accepted-revision');
  assert.deepEqual(event.beforeSession.edges, fixture.firstEdges);
  assert.deepEqual(
    event.revision.previousSession.history[0].proposal.addEdges,
    fixture.firstEdges,
  );
  assert.equal(event.repairs.length, 1);
  assert.deepEqual(event.revision.impact.changedNodeIds, ['price']);
  assert.ok(event.revision.impact.affectedNodeIds.includes('join'));
  assert.deepEqual(
    new Set(state.plan.edges.map(workflowConnectionEdgeId)),
    new Set(fixture.plan.edges.map(workflowConnectionEdgeId)),
  );
  const source = resolveIncrementalConnectionSource(options, state);
  assert.equal(
    source.materials.find((item) => item.arguments.callId === 'price').arguments
      .bindings[0].sourceNodeId,
    'source',
  );
  assert.equal(
    fixture.broken.materials.find((item) => item.arguments.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'detail',
  );
  assert.equal(Object.hasOwn(state, '__interrupt__'), false);
});

test('material candidates are checkpointed privately; notification resume cannot repeat source planning or publish an unadopted graph', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel(outputs(fixture));
  const notification = new Error('Candidate notification unavailable');
  let notified = 0,
    callbacks = 0;
  const options = configured(fixture, model, {
    checkpointer: new MemorySaver(),
    revisionPlanning: {
      model,
      observe: ({ phase }) => {
        if (phase === 'candidate' && ++notified === 1) throw notification;
      },
    },
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => {
        callbacks++;
        return fixture.replacement;
      },
    },
  });
  const graph = createIncrementalWorkflowConnectionGraph(options);
  const config = { configurable: { thread_id: 'accepted-material-candidate' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === notification,
  );
  const checkpoint = await graph.getState(config);
  assert.deepEqual(checkpoint.next, ['publishRevision']);
  assert.deepEqual(checkpoint.values.session.edges, fixture.firstEdges);
  assert.deepEqual(checkpoint.values.sourceEvents, []);
  assert.equal(checkpoint.values.pendingRevisionRepairs.length, 1);
  assert.equal(
    describeWorkflowConnectionStep({
      ...resolveIncrementalConnectionSource(options, checkpoint.values),
      session: checkpoint.values.session,
    }).expected.sourceFingerprint,
    checkpoint.values.session.sourceFingerprint,
  );
  assert.equal(model.requests.length, 5);
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(model.requests.length, 5);
  assert.equal(callbacks, 1);
});

test('revised goals use the configured independent review before adoption and pass original negative evidence to the next revision', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const incomplete = globalThis.structuredClone(fixture.correctedRevision);
  incomplete.decision.goals = fixture.acceptedGoals;
  const model = recoveryQueueModel(
    [
      { goals: fixture.acceptedGoals },
      ({ payload }) => connectionGoalReviewOutput(payload),
      fixture.firstPatch,
      fixture.completion,
      { decision: fixture.request },
      incomplete,
      ({ payload }) => connectionGoalReviewOutput(payload, 'missing'),
      fixture.correctedRevision,
      ({ payload }) => connectionGoalReviewOutput(payload),
    ],
    ({ payload }, index) => {
      if (index === 7) {
        assert.equal(payload.rejectedGoalReviews.length, 1);
        assert.equal(payload.rejectedGoalReviews[0].review.accepted, false);
        assert.deepEqual(
          payload.after.requirements,
          fixture.source.requirements,
        );
      }
    },
  );
  const options = configured(fixture, model, { initialGoalReview: { model } });
  const result = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.rejectedRevisionReviews.length, 1);
  assert.equal(result.sourceEvents.length, 1);
  assert.equal(result.sourceEvents[0].review.accepted, true);
  assert.equal(model.requests.length, 9);
  assert.equal(result.modelInvocations, 9);
});

test('revision model transport and originating callback failures keep the accepted state and original cause without hidden retry', async () => {
  for (const stage of ['revision', 'material']) {
    const fixture = acceptedConnectionRecoveryFixture();
    const failure = new Error(`Unavailable ${stage}`);
    const queue = outputs(fixture).slice(0, stage === 'revision' ? 3 : 4);
    if (stage === 'revision') queue.push(failure);
    const model = recoveryQueueModel(queue);
    const options = configured(fixture, model, {
      checkpointer: new MemorySaver(),
      ...(stage === 'material'
        ? {
            materialRecovery: {
              modelInvocations: 0,
              replan: async () => {
                throw failure;
              },
            },
          }
        : {}),
    });
    const graph = createIncrementalWorkflowConnectionGraph(options);
    const config = { configurable: { thread_id: `accepted-${stage}-failure` } };
    await assert.rejects(
      graph.invoke({}, config),
      (error) => error === failure || error.cause === failure,
    );
    const state = await graph.getState(config);
    assert.deepEqual(state.next, ['fail']);
    assert.deepEqual(state.values.session.edges, fixture.firstEdges);
    assert.deepEqual(state.values.sourceEvents, []);
    const calls = model.requests.length;
    await assert.rejects(
      graph.invoke(null, config),
      (error) => error === failure || error.cause === failure,
    );
    assert.equal(model.requests.length, calls);
  }
});

test('accepted revision dispatch spends the same global call/rejection budget and never substitutes a missing material executor', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  for (const limits of [
    { maxModelInvocations: 3 },
    { maxRejectedProposals: 0 },
  ]) {
    const model = recoveryQueueModel(outputs(fixture));
    await assert.rejects(
      createIncrementalWorkflowConnectionGraph(
        configured(fixture, model, { policy: { ...policy, ...limits } }),
      ).invoke({}),
      (error) => error instanceof IncrementalConnectionLimitError,
    );
    assert.equal(model.requests.length, 3);
  }
  const model = recoveryQueueModel(outputs(fixture).slice(0, 4));
  const options = configured(fixture, model);
  delete options.materialRecovery;
  await assert.rejects(
    createIncrementalWorkflowConnectionGraph(options).invoke({}),
    /materialRecovery.replan is not configured/,
  );
  assert.equal(model.requests.length, 4);
});

test('goal/connection-only revision needs no material callback and preserves the accepted history as its previous epoch', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.acceptedGoals },
    fixture.firstPatch,
    fixture.completion,
    fixture.correctedRevision,
  ]);
  const options = {
    source: () => fixture.source,
    model,
    policy,
    revisionPlanning: { model },
  };
  const state = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.sourceEvents[0].repairs, []);
  assert.deepEqual(
    state.sourceEvents[0].revision.previousSession.edges,
    fixture.firstEdges,
  );
  assert.equal(model.requests.length, 4);
  assert.equal(
    state.sourceEvents[0].revision.session.goals.some(
      (goal) => goal.decision.kind === 'independent',
    ),
    true,
  );
});

test('a malformed revision remains private rejection feedback and cannot replace the accepted graph or repeat the material callback', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const notification = new Error('Rejection observer unavailable');
  let callbacks = 0,
    notifications = 0;
  const model = recoveryQueueModel(
    [
      ...outputs(fixture).slice(0, 4),
      { unknown: 'invalid revision' },
      fixture.correctedRevision,
    ],
    ({ payload }, index) => {
      if (index === 5)
        assert.deepEqual(payload.rejectedProposals[0].output, {
          unknown: 'invalid revision',
        });
    },
  );
  const options = configured(fixture, model, {
    checkpointer: new MemorySaver(),
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => {
        callbacks++;
        return fixture.replacement;
      },
    },
    revisionPlanning: {
      model,
      observe: ({ phase }) => {
        if (phase === 'rejected' && ++notifications === 1) throw notification;
      },
    },
  });
  const graph = createIncrementalWorkflowConnectionGraph(options);
  const config = { configurable: { thread_id: 'accepted-revision-rejection' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === notification,
  );
  const saved = await graph.getState(config);
  assert.deepEqual(saved.next, ['publishRevision']);
  assert.deepEqual(saved.values.sourceEvents, []);
  assert.deepEqual(saved.values.session.edges, fixture.firstEdges);
  assert.equal(saved.values.pendingRevisionRepairs.length, 1);
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 6);
  assert.equal(result.rejectedRevisions.length, 1);
});

test('outline planning starts a new source/goal epoch only after a checked revision is adopted', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const outline = ({ payload }) => ({
    purpose: 'Keep the complete global workflow.',
    bundles: [
      {
        purpose: 'All confirmed roles',
        nodeIds: payload.context.nodes.map((node) => node.id),
      },
    ],
  });
  const model = recoveryQueueModel([
    { goals: fixture.acceptedGoals },
    outline,
    fixture.firstPatch,
    fixture.completion,
    { decision: fixture.request },
    fixture.correctedRevision,
    outline,
  ]);
  const options = configured(fixture, model, {
    outlinePlanning: {
      model,
      selectBundle: ({ outline }) => outline.bundles[0].id,
    },
  });
  const result = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.outlineHistory.length, 2);
  assert.notEqual(
    result.outlineHistory[0].sessionId,
    result.outlineHistory[1].sessionId,
  );
  assert.notEqual(
    result.outlineHistory[0].sourceFingerprint,
    result.outlineHistory[1].sourceFingerprint,
  );
  assert.deepEqual(
    result.sourceEvents[0].beforeSession.edges,
    fixture.firstEdges,
  );
  assert.equal(model.requests.length, 7);
  assert.equal(result.modelInvocations, 7);
  assert.deepEqual(result.rejectedOutlineProposals, []);
  assert.deepEqual(
    model.requests.map((request) => request.options.name),
    [
      'plan_workflow_connection_goals',
      'plan_workflow_connection_outline',
      'plan_workflow_connection_step',
      'plan_workflow_connection_step',
      'plan_workflow_connection_revision',
      'plan_workflow_connection_revision',
      'plan_workflow_connection_outline',
    ],
  );
  for (const index of [1, 6]) {
    const request = model.requests[index];
    assert.deepEqual(
      Object.keys(request.schema.properties.bundles.items.properties).sort(),
      ['nodeIds', 'purpose'],
    );
    assert.equal(Object.hasOwn(request.payload, 'previousOutline'), false);
  }
  assert.equal(
    model.requests[1].payload.expected.sessionId,
    result.sourceEvents[0].beforeSession.id,
  );
  assert.equal(model.requests[6].payload.expected.sessionId, result.session.id);
  assert.deepEqual(model.requests[6].payload.goals, result.session.goals);
  const current = {
    ...resolveIncrementalConnectionSource(options, result),
    session: result.session,
  };
  assert.throws(
    () =>
      describeWorkflowConnectionOutline({
        ...current,
        outline: result.outlineHistory[0],
      }),
    /differs/,
  );
  assert.equal(
    describeWorkflowConnectionOutline({
      ...current,
      outline: result.outlineHistory[1],
    }).step.inspection.ready,
    true,
  );
});

test('ordered source replay supports a native extension between accepted revisions and rejects reordered or altered receipts', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel(outputs(fixture));
  const options = configured(fixture, model);
  const state = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  const source = resolveIncrementalConnectionSource(options, state);
  const additionalNativeNodes = [
    {
      id: 'second-join',
      capability: 'merge-append',
      parameters: { numberInputs: 2 },
    },
  ];
  const extension = extendWorkflowConnectionSession({
    ...source,
    session: state.session,
    expected: describeWorkflowConnectionStep({
      ...source,
      session: state.session,
    }).expected,
    additionalNativeNodes,
  });
  const nativeState = {
    ...state,
    session: extension.session,
    sourceEvents: [
      ...state.sourceEvents,
      {
        kind: 'native-extension',
        beforeSession: state.session,
        additionalNativeNodes,
        extension,
      },
    ],
  };
  const nativeSource = resolveIncrementalConnectionSource(options, nativeState);
  assert.equal(
    nativeSource.nativeNodes.some((node) => node.id === 'second-join'),
    true,
  );
  const before = { ...nativeSource, session: nativeState.session };
  const revision = applyWorkflowConnectionRevision({
    before,
    after: nativeSource,
    expected: describeWorkflowConnectionStep(before).expected,
    proposal: {
      goals: fixture.goals,
      graphChange: {
        kind: 'patch',
        addEdges: [
          {
            from: 'summary',
            output: 'main',
            to: 'second-join',
            input: 'input1',
          },
          { from: 'stock', output: 'main', to: 'second-join', input: 'input2' },
        ],
        removeEdgeIds: [],
        addRootNodeIds: [],
        removeRootNodeIds: [],
        addTerminals: [{ nodeId: 'second-join', output: 'main' }],
        removeTerminals: [{ nodeId: 'summary', output: 'main' }],
        factIds: ['intent'],
        reason: 'Explicitly join the summary and stock paths.',
      },
    },
  });
  const next = {
    ...nativeState,
    session: revision.session,
    sourceEvents: [
      ...nativeState.sourceEvents,
      {
        kind: 'accepted-revision',
        beforeSession: nativeState.session,
        repairs: [],
        revision,
      },
    ],
  };
  const current = resolveIncrementalConnectionSource(options, next);
  assert.equal(
    describeWorkflowConnectionStep({ ...current, session: next.session })
      .inspection.ready,
    true,
  );
  assert.equal(
    current.materials.find((material) => material.arguments.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'source',
  );
  const reordered = {
    ...next,
    sourceEvents: [
      next.sourceEvents[1],
      next.sourceEvents[0],
      next.sourceEvents[2],
    ],
  };
  assert.throws(() => resolveIncrementalConnectionSource(options, reordered));
  const altered = {
    ...next,
    sourceEvents: globalThis.structuredClone(next.sourceEvents),
  };
  altered.sourceEvents[1].extension.addedNativeNodeIds = ['invented'];
  assert.throws(
    () => resolveIncrementalConnectionSource(options, altered),
    /differs/,
  );
});

test('initial material recovery and later accepted revision share one chronological source authority', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    { decision: fixture.request },
    { goals: fixture.goals },
    {
      decision: incrementalConnectionModelPatch(
        fixture.source,
        incrementalConnectionPatch({
          addEdges: fixture.plan.edges,
          addRootNodeIds: ['source'],
          addTerminals: [{ nodeId: 'summary', output: 'main' }],
        }),
      ),
    },
  ]);
  const options = configured(fixture, model);
  const result = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.sourceEvents.length, 1);
  assert.equal(result.sourceEvents[0].kind, 'material-repair');
  assert.equal(result.materialRepairs.length, 1);
  const source = resolveIncrementalConnectionSource(options, result);
  assert.equal(
    source.materials.find((material) => material.arguments.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'source',
  );
  assert.equal(model.requests.length, 4);
});

test('a completed reviewed revision restores only through its validated source ledger, without re-running any model', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.acceptedGoals },
    ({ payload }) => connectionGoalReviewOutput(payload),
    fixture.firstPatch,
    fixture.completion,
    { decision: fixture.request },
    fixture.correctedRevision,
    ({ payload }) => connectionGoalReviewOutput(payload),
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    configured(fixture, model, { initialGoalReview: { model } }),
  ).invoke({});
  const restored = JSON.parse(JSON.stringify(result));
  const unused = recoveryQueueModel([]);
  const options = configured(fixture, unused, {
    initialGoalReview: { model: unused },
  });
  const resumed =
    await createIncrementalWorkflowConnectionGraph(options).invoke(restored);
  assert.equal(resumed.status, 'complete');
  assert.deepEqual(resumed.session, result.session);
  assert.equal(unused.requests.length, 0);
  const altered = JSON.parse(JSON.stringify(restored));
  altered.sourceEvents[0].review.accepted = false;
  await assert.rejects(
    createIncrementalWorkflowConnectionGraph(options).invoke(altered),
  );
  assert.equal(unused.requests.length, 0);
});

test('revision feedback rejects stale connection evidence, concurrent edits and the exact same negatively reviewed candidate', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  const model = recoveryQueueModel(outputs(fixture));
  const options = configured(fixture, model);
  const state = await createIncrementalWorkflowConnectionGraph(options).invoke(
    {},
  );
  const event = state.sourceEvents[0];
  const after = resolveIncrementalConnectionSource(options, state);
  const input = {
    before: { ...fixture.broken, session: event.beforeSession },
    after,
    expected: event.revision.previous,
  };
  const negative = await reviewWorkflowConnectionGoals({
    ...after,
    session: event.revision.session,
    model: recoveryQueueModel([
      ({ payload }) => connectionGoalReviewOutput(payload, 'missing'),
    ]),
  });
  const repeated = recoveryQueueModel([fixture.correctedRevision]);
  await assert.rejects(
    planWorkflowConnectionRevision({
      ...input,
      model: repeated,
      rejectedGoalReviews: [{ revision: event.revision, review: negative }],
    }),
    (error) => {
      assert.equal(error.diagnostic.stage, 'contract-validation');
      assert.match(error.message, /repeats a candidate/);
      assert.deepEqual(
        createWorkflowConnectionRevisionRejection({ ...input, error }).output,
        fixture.correctedRevision,
      );
      return true;
    },
  );
  assert.equal(repeated.requests.length, 1);
  const stale = globalThis.structuredClone(state.rejectedProposals);
  stale[0].expected.revision++;
  const unused = recoveryQueueModel([]);
  await assert.rejects(
    planWorkflowConnectionRevision({
      ...input,
      model: unused,
      rejectedConnections: stale,
    }),
    (error) => error.diagnostic.stage === 'input-validation',
  );
  assert.equal(unused.requests.length, 0);
  const evidence = globalThis.structuredClone(state.rejectedProposals);
  const malformed = recoveryQueueModel(
    [{ decision: { kind: 'unknown' } }],
    () => {
      evidence[0].violations[0].message += ' concurrent edit';
    },
  );
  await assert.rejects(
    planWorkflowConnectionRevision({
      ...input,
      model: malformed,
      rejectedConnections: evidence,
    }),
    (error) => {
      assert.equal(error.diagnostic.stage, 'input-validation');
      assert.ok(error.cause instanceof AggregateError);
      assert.equal(error.cause.errors[0].diagnostic.stage, 'model-output');
      assert.equal(
        createWorkflowConnectionRevisionRejection({ ...input, error }),
        undefined,
      );
      return true;
    },
  );
  assert.equal(malformed.requests.length, 1);
});
