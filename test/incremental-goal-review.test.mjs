import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';
import { connectionGoalReviewOutput } from './fixtures/connection-goal-review-fixture.mjs';
import {
  incrementalConnectionModelPatch,
  incrementalConnectionPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const policy = {
  maxModelInvocations: 12,
  maxRejectedProposals: 3,
  deadlineMs: 30000,
};
const edges = (fixture) => ({
  decision: incrementalConnectionModelPatch(
    fixture.source,
    incrementalConnectionPatch({
      addEdges: fixture.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  ),
});

test('a structurally valid but semantically rejected initial candidate is never adopted; originating material repair and a second review complete without human interrupts', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals.filter((goal) => goal.kind !== 'independent') },
    ({ payload }) => connectionGoalReviewOutput(payload, 'contradicted'),
    { decision: fixture.request },
    { goals: fixture.goals },
    ({ payload }) => connectionGoalReviewOutput(payload),
    edges(fixture),
  ]);
  let callbacks = 0;
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.broken,
    model,
    policy,
    initialGoalReview: { model },
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => {
        callbacks++;
        return fixture.replacement;
      },
    },
    checkpointer: new MemorySaver(),
  });
  const state = await graph.invoke(
    {},
    { configurable: { thread_id: 'independent-initial-review' } },
  );
  assert.equal(state.status, 'complete');
  assert.equal(state.goalReviews.length, 2);
  assert.equal(state.goalReviews[0].review.accepted, false);
  assert.equal(state.goalReviews[1].review.accepted, true);
  assert.equal(state.session.id, state.goalReviews[1].session.id);
  assert.notEqual(state.session.id, state.goalReviews[0].session.id);
  assert.equal(state.modelInvocations, 6);
  assert.equal(callbacks, 1);
  assert.equal(state.materialRepairs.length, 1);
  assert.deepEqual(state.plan.edges, fixture.plan.edges);
  assert.equal(state.pendingGoalSession, undefined);
  const resumed = await graph.invoke(state, {
    configurable: { thread_id: 'review-state-replay' },
  });
  assert.equal(resumed.status, 'complete');
  assert.equal(model.requests.length, 6);
  const tampered = globalThis.structuredClone(state);
  tampered.goalReviews[1].review.assessments[0].sourceQuotes = ['invented'];
  await assert.rejects(
    graph.invoke(tampered, {
      configurable: { thread_id: 'review-state-tamper' },
    }),
  );
  assert.equal(model.requests.length, 6);
});

test('independent review reserves a real invocation before dispatch and no review means no accepted initial session', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const model = recoveryQueueModel([{ goals: fixture.goals }]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy: { ...policy, maxModelInvocations: 1 },
    initialGoalReview: { model },
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'review-reservation' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error instanceof IncrementalConnectionLimitError,
  );
  const snapshot = await graph.getState(config);
  assert.equal(snapshot.values.session, undefined);
  assert.ok(snapshot.values.pendingGoalSession);
  assert.equal(model.requests.length, 1);
});

test('reviewer transport failures stay private original failures and checkpoint resumption cannot repeat review for free', async () => {
  const fixture = initialConnectionRecoveryFixture(),
    cause = new Error('review provider unavailable');
  const model = recoveryQueueModel([{ goals: fixture.goals }, cause]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    initialGoalReview: { model },
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'review-failure' } };
  await assert.rejects(graph.invoke({}, config));
  const snapshot = await graph.getState(config);
  assert.equal(snapshot.values.session, undefined);
  assert.deepEqual(snapshot.next, ['fail']);
  await assert.rejects(graph.invoke(null, config));
  assert.equal(model.requests.length, 2);
});

test('a saved accepted review survives observation failure without repeating generation or review', async () => {
  const fixture = initialConnectionRecoveryFixture();
  let failed = false;
  const cause = new Error('progress unavailable');
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    ({ payload }) => connectionGoalReviewOutput(payload),
    edges(fixture),
  ]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    initialGoalReview: { model },
    checkpointer: new MemorySaver(),
    observe: () => {
      if (!failed) {
        failed = true;
        throw cause;
      }
    },
  });
  const config = { configurable: { thread_id: 'review-observer' } };
  await assert.rejects(graph.invoke({}, config), (error) => error === cause);
  assert.equal(model.requests.length, 2);
  assert.equal(
    (await graph.getState(config)).values.goalReviews[0].review.accepted,
    true,
  );
  const state = await graph.invoke(null, config);
  assert.equal(state.status, 'complete');
  assert.equal(model.requests.length, 3);
});

test('negative coverage judgments consume the shared rejection budget rather than becoming business HITL', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    ({ payload }) => connectionGoalReviewOutput(payload, 'uncertain'),
  ]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy: { ...policy, maxRejectedProposals: 0 },
    initialGoalReview: { model },
  });
  await assert.rejects(
    graph.invoke({}),
    (error) =>
      error instanceof IncrementalConnectionLimitError &&
      error.failure.kind === 'rejected-proposals',
  );
  assert.equal(model.requests.length, 2);
  assert.throws(
    () =>
      createIncrementalWorkflowConnectionGraph({
        source: () => fixture.source,
        model,
        policy,
        initialGoalReview: {},
      }),
    /initialGoalReview.model/,
  );
});
