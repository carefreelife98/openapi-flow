import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkflowConnectionMaterialRepair,
  createWorkflowConnectionSession,
  describeWorkflowConnectionGoals,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoalRecovery,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import {
  initialConnectionRecoveryFixture,
  initialGoalRejection,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';

test('recovery can identify wrong input material before any accepted session, rather than force goals to agree with a bad binding', async () => {
  const { broken, goals, request, replacement } =
    initialConnectionRecoveryFixture();
  const rejection = await initialGoalRejection(broken, goals);
  const model = recoveryQueueModel([{ decision: request }]);
  const result = await planWorkflowConnectionGoalRecovery({
    ...broken,
    rejectedProposals: [rejection],
    model,
  });
  assert.equal(result.kind, 'replan-materials');
  assert.equal(
    result.sourceFingerprint,
    describeWorkflowConnectionGoals(broken).sourceFingerprint,
  );
  assert.deepEqual(result.request, request);
  const context = model.requests[0].payload;
  assert.deepEqual(context.rejectedProposals[0].output, rejection.output);
  assert.ok(
    context.conflictMaterials.apiCalls.some(
      (item) =>
        item.callId === 'price' &&
        item.arguments.bindings[0].sourceNodeId === 'detail',
    ),
  );
  const repaired = applyWorkflowConnectionMaterialRepair({
    source: broken,
    request: result,
    replacement,
  });
  assert.ok(createWorkflowConnectionSession({ ...repaired.source, goals }));
  assert.equal(model.requests.length, 1);
});

test('recovery can instead correct a wrong goal while retaining the original valid binding choices', async () => {
  const { source, goals } = initialConnectionRecoveryFixture();
  const invalid = [
    {
      kind: 'precedence',
      before: 'summary',
      after: 'source',
      factIds: ['intent'],
      reason: 'A wrong planning hypothesis.',
    },
  ];
  const rejection = await initialGoalRejection(source, invalid);
  const model = recoveryQueueModel([{ decision: { kind: 'goals', goals } }]);
  const result = await planWorkflowConnectionGoalRecovery({
    ...source,
    model,
    rejectedProposals: [rejection],
  });
  assert.equal(result.kind, 'goals');
  assert.equal(
    result.session.sourceFingerprint,
    describeWorkflowConnectionGoals(source).sourceFingerprint,
  );
  assert.deepEqual(
    result.session.goals.map((goal) => goal.decision),
    goals,
  );
  assert.equal(model.requests.length, 1);
});

test('unknown stage owners, missing facts and duplicate targets remain rejected original proposals for bounded host feedback', async () => {
  const { broken, goals, request } = initialConnectionRecoveryFixture();
  const rejection = await initialGoalRejection(broken, goals);
  for (const patch of [
    { targets: [{ stage: 'native-parameters', nodeId: 'price' }] },
    { targets: [{ stage: 'api-bindings', nodeId: 'missing' }] },
    { targets: [...request.targets, ...request.targets] },
    { factIds: ['unknown'] },
  ]) {
    const output = { decision: { ...request, ...patch } };
    const model = recoveryQueueModel([output]);
    let error;
    try {
      await planWorkflowConnectionGoalRecovery({
        ...broken,
        model,
        rejectedProposals: [rejection],
      });
    } catch (failure) {
      error = failure;
    }
    assert.ok(error);
    const feedback = createWorkflowConnectionGoalRejection({
      ...broken,
      error,
    });
    assert.deepEqual(feedback.output, output);
    assert.equal(model.requests.length, 1);
  }
});

test('missing conflict context, stale source, transport and cancellation do not become successful recovery decisions', async () => {
  const { broken, goals, request } = initialConnectionRecoveryFixture();
  const rejection = await initialGoalRejection(broken, goals);
  for (const input of [
    { ...broken, rejectedProposals: [] },
    {
      ...broken,
      rejectedProposals: [{ ...rejection, constraints: undefined }],
    },
    {
      ...broken,
      scenario: 'A different source',
      rejectedProposals: [rejection],
    },
  ]) {
    const model = recoveryQueueModel([{ decision: request }]);
    await assert.rejects(
      planWorkflowConnectionGoalRecovery({ ...input, model }),
    );
    assert.equal(model.requests.length, 0);
  }
  const cause = new Error('Original provider failure');
  const model = recoveryQueueModel([cause]);
  await assert.rejects(
    planWorkflowConnectionGoalRecovery({
      ...broken,
      model,
      rejectedProposals: [rejection],
    }),
    (error) => error.cause === cause,
  );
  const cancelled = recoveryQueueModel([{ decision: request }]);
  await assert.rejects(
    planWorkflowConnectionGoalRecovery({
      ...broken,
      model: cancelled,
      rejectedProposals: [rejection],
      signal: globalThis.AbortSignal.abort(cause),
    }),
  );
  assert.equal(cancelled.requests.length, 0);
});
