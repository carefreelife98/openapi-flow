import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  describeWorkflowConnectionRevision,
  describeWorkflowConnectionStep,
  WorkflowConnectionRevisionError,
  validateWorkflowConnectionRevision,
  validateWorkflowConnectionMaterialRepairReceipt,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionRevision,
  createWorkflowConnectionRevisionRejection,
  WorkflowConnectionPlanningError,
} from '@openapi-flow/langchain';
import {
  connectionRevisionRejectionFixture,
  revisionFeedbackModel,
  captureRevisionFailure,
} from './fixtures/connection-revision-rejection-fixture.mjs';

test('revision context inspects the original graph with replacement contracts without adopting or disconnecting it', () => {
  const { input } = connectionRevisionRejectionFixture();
  const before = globalThis.structuredClone(input.before.session);
  const description = describeWorkflowConnectionRevision(input);
  assert.equal(description.before.inspection.ready, true);
  assert.ok(
    description.currentGraphInspection.violations.some(
      (item) => item.code === 'CLOSED_REGION_INVALID',
    ),
  );
  assert.equal(
    Object.hasOwn(description.currentGraphInspection, 'routeStates'),
    false,
  );
  assert.deepEqual(input.before.session, before);
  assert.notEqual(
    description.sourceFingerprint,
    description.after.sourceFingerprint,
  );
});

test('a real rejected bypass preserves raw model output and code-owned witnesses privately for the exact source epochs', async () => {
  const { input, rejectedOutput } = connectionRevisionRejectionFixture();
  const before = globalThis.structuredClone(input.before.session);
  const model = revisionFeedbackModel(rejectedOutput);
  const error = await captureRevisionFailure(input, model);
  assert.ok(error instanceof WorkflowConnectionPlanningError);
  assert.ok(error.cause instanceof WorkflowConnectionRevisionError);
  const feedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error,
  });
  assert.deepEqual(feedback.output, rejectedOutput);
  assert.deepEqual(feedback.expected, input.expected);
  assert.deepEqual(feedback.violations, error.cause.violations);
  assert.ok(
    feedback.violations.some((item) => item.code === 'CLOSED_REGION_INVALID'),
  );
  assert.equal(
    feedback.sourceFingerprint,
    describeWorkflowConnectionRevision(input).sourceFingerprint,
  );
  assert.equal(model.calls.length, 1);
  assert.deepEqual(input.before.session, before);
  const serialized = JSON.stringify(error);
  assert.equal(serialized.includes('graphChange'), false);
  assert.equal(serialized.includes('violations'), false);
  assert.equal(serialized.includes('sourceFingerprint'), false);
  feedback.output.decision.graphChange.addEdges.length = 0;
  assert.deepEqual(
    error.output,
    rejectedOutput,
    'feedback is a detached checkpoint-safe copy',
  );
});

test('an explicit second invocation uses unmodified rejection evidence and adopts only the model-selected correction', async () => {
  const { input, rejectedOutput, correctedOutput } =
    connectionRevisionRejectionFixture();
  const first = revisionFeedbackModel(rejectedOutput);
  const error = await captureRevisionFailure(input, first);
  const feedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error,
  });
  const before = globalThis.structuredClone(input.before.session);
  const second = revisionFeedbackModel(correctedOutput, ({ payload }) => {
    assert.deepEqual(payload.rejectedProposals, [feedback]);
    assert.equal(
      payload.currentGraphInspection.violations[0].code,
      'CLOSED_REGION_INVALID',
    );
  });
  const result = await planWorkflowConnectionRevision({
    ...input,
    rejectedProposals: [feedback],
    model: second,
  });
  assert.equal(result.kind, 'revised-connections');
  assert.equal(result.revision.inspection.ready, true);
  assert.equal(
    result.revision.session.edges.some(
      (edge) => edge.from === 'source' && edge.to === 'price',
    ),
    false,
  );
  assert.ok(
    result.revision.session.edges.some(
      (edge) => edge.from === 'detail' && edge.to === 'price',
    ),
  );
  validateWorkflowConnectionRevision({
    ...input,
    proposal: result.revision.proposal,
    revision: result.revision,
  });
  assert.deepEqual(input.before.session, before);
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
});

test('stale feedback is rejected before invoking the model, including history changes at the same public expectation', async () => {
  const { input, rejectedOutput, correctedOutput } =
    connectionRevisionRejectionFixture();
  const error = await captureRevisionFailure(
    input,
    revisionFeedbackModel(rejectedOutput),
  );
  const feedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error,
  });
  const changedMaterial = globalThis.structuredClone(input.after.materials);
  changedMaterial.find(
    (item) => item.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'source';
  const anotherSession = {
    ...input.before,
    session: { ...input.before.session, id: randomUUID() },
  };
  const history = globalThis.structuredClone(input.before.session);
  history.history[0].proposal.reason = 'A different accepted explanation.';
  const sameExpectation = { ...input.before, session: history };
  assert.deepEqual(
    describeWorkflowConnectionStep(sameExpectation).expected,
    input.expected,
  );
  for (const changed of [
    { ...input, after: { ...input.after, materials: changedMaterial } },
    {
      ...input,
      before: anotherSession,
      expected: describeWorkflowConnectionStep(anotherSession).expected,
    },
    { ...input, before: sameExpectation },
  ]) {
    assert.equal(
      createWorkflowConnectionRevisionRejection({ ...changed, error }),
      undefined,
    );
    const model = revisionFeedbackModel(correctedOutput);
    await assert.rejects(
      planWorkflowConnectionRevision({
        ...changed,
        model,
        rejectedProposals: [feedback],
      }),
      /unchanged source epochs/,
    );
    assert.equal(model.calls.length, 0);
  }
});

test('schema rejections preserve lossless JSON only and cannot smuggle undefined or non-JSON values into feedback', async () => {
  const { input } = connectionRevisionRejectionFixture();
  for (const output of [
    { decision: { kind: 'not-a-real-decision' } },
    { decision: { kind: 'not-a-real-decision' }, ignored: undefined },
    { decision: new Date(0) },
  ]) {
    const error = await captureRevisionFailure(
      input,
      revisionFeedbackModel(output),
    );
    const feedback = createWorkflowConnectionRevisionRejection({
      ...input,
      error,
    });
    if (Object.hasOwn(output, 'ignored') || output.decision instanceof Date) {
      assert.equal(feedback, undefined);
    } else {
      assert.equal(feedback.stage, 'model-output');
      assert.equal(feedback.code, 'MODEL_OUTPUT_INVALID');
      assert.deepEqual(feedback.output, output);
      assert.equal(Object.hasOwn(feedback, 'violations'), false);
    }
  }
});

test('transport, cancellation and unrelated operations never become revision proposal feedback', async () => {
  const { input } = connectionRevisionRejectionFixture();
  const cause = new Error('private transport failure');
  const error = await captureRevisionFailure(
    input,
    revisionFeedbackModel(cause),
  );
  assert.equal(error.cause, cause);
  assert.equal(
    createWorkflowConnectionRevisionRejection({ ...input, error }),
    undefined,
  );
  const cancelled = revisionFeedbackModel({});
  let abort;
  try {
    await planWorkflowConnectionRevision({
      ...input,
      model: cancelled,
      signal: globalThis.AbortSignal.abort(cause),
    });
  } catch (error) {
    abort = error;
  }
  assert.equal(
    createWorkflowConnectionRevisionRejection({ ...input, error: abort }),
    undefined,
  );
  assert.equal(cancelled.calls.length, 0);
  const unrelated = new WorkflowConnectionPlanningError(
    {
      operation: 'planWorkflowConnectionGoals',
      stage: 'model-output',
      code: 'MODEL_OUTPUT_INVALID',
      output: {},
      sourceFingerprint:
        describeWorkflowConnectionRevision(input).sourceFingerprint,
    },
    cause,
  );
  assert.equal(
    createWorkflowConnectionRevisionRejection({ ...input, error: unrelated }),
    undefined,
  );
});

test('feedback validates required fields without normalization and rejects concurrent evidence mutation', async () => {
  const { input, rejectedOutput, correctedOutput } =
    connectionRevisionRejectionFixture();
  const error = await captureRevisionFailure(
    input,
    revisionFeedbackModel(rejectedOutput),
  );
  const feedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error,
  });
  for (const rejectedProposals of [
    null,
    {},
    [{ ...feedback, unknown: true }],
    [
      {
        ...feedback,
        expected: {
          ...feedback.expected,
          revision: feedback.expected.revision + 1,
        },
      },
    ],
    [{ ...feedback, violations: [] }],
  ]) {
    const model = revisionFeedbackModel(correctedOutput);
    await assert.rejects(
      planWorkflowConnectionRevision({ ...input, model, rejectedProposals }),
    );
    assert.equal(model.calls.length, 0);
  }
  const rejectedProposals = [globalThis.structuredClone(feedback)];
  const model = revisionFeedbackModel(correctedOutput, () => {
    rejectedProposals[0].reason = 'Changed after invocation.';
  });
  const changed = await captureRevisionFailure(
    { ...input, rejectedProposals },
    model,
  );
  assert.equal(changed.diagnostic.stage, 'input-validation');
  assert.equal(
    createWorkflowConnectionRevisionRejection({ ...input, error: changed }),
    undefined,
  );
  assert.equal(model.calls.length, 1);
});

test('goal contradictions retain code-owned constraint evidence rather than treating bindings or goals as fixed truth', async () => {
  const { input, correctedOutput } = connectionRevisionRejectionFixture();
  correctedOutput.decision.goals.push({
    kind: 'independent',
    nodeIds: ['detail', 'price'],
    factIds: ['intent'],
    reason: 'An incompatible planning hypothesis.',
  });
  const error = await captureRevisionFailure(
    input,
    revisionFeedbackModel(correctedOutput),
  );
  const feedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error,
  });
  assert.ok(feedback.constraints.conflicts.length);
  assert.deepEqual(feedback.output, correctedOutput);
  assert.equal(Object.hasOwn(feedback, 'violations'), false);
});

test('originating-stage receipts also bind the accepted history, not just a public session ID and revision number', async () => {
  const { input } = connectionRevisionRejectionFixture();
  const receipt = await planWorkflowConnectionRevision({
    ...input,
    model: revisionFeedbackModel({
      decision: {
        kind: 'replan-materials',
        targets: [{ stage: 'api-bindings', nodeId: 'price' }],
        factIds: ['intent'],
        reason:
          'Reconsider the selected producer against the confirmed intent.',
      },
    }),
  });
  assert.equal(
    receipt.expected.revisionSourceFingerprint,
    describeWorkflowConnectionRevision(input).sourceFingerprint,
  );
  const session = globalThis.structuredClone(input.before.session);
  session.history[0].proposal.reason = 'A distinct accepted history.';
  const changed = { ...input, before: { ...input.before, session } };
  assert.deepEqual(
    describeWorkflowConnectionStep(changed.before).expected,
    input.expected,
  );
  assert.throws(
    () =>
      validateWorkflowConnectionMaterialRepairReceipt({ ...changed, receipt }),
    /different session/,
  );
});

test('the existing automatic graph continues an incomplete revised candidate and checkpoints completion without repeating model work after an observer failure', async () => {
  const { input, correctedOutput } = connectionRevisionRejectionFixture();
  correctedOutput.decision.goals.push({
    kind: 'semantic',
    factIds: ['intent'],
    reason:
      'Preserve the original selected values and unchanged collection semantics.',
  });
  const revisionModel = revisionFeedbackModel(correctedOutput);
  const result = await planWorkflowConnectionRevision({
    ...input,
    model: revisionModel,
  });
  assert.equal(result.revision.inspection.ready, false);
  assert.deepEqual(result.revision.inspection.violations, []);
  const semantic = result.revision.session.goals.find(
    (goal) => goal.decision.kind === 'semantic',
  );
  assert.deepEqual(result.revision.inspection.unmetGoalIds, [semantic.id]);
  const source = { ...input.after, ...result.revision.sourceUpdate };
  const model = revisionFeedbackModel(
    {
      decision: {
        kind: 'request-completion',
        assessments: [
          {
            goalId: semantic.id,
            satisfied: true,
            nodeIds: ['source', 'detail', 'price', 'stock', 'join', 'summary'],
            reason:
              'The unchanged original mappings and native collector preserve the supplied intent.',
          },
        ],
        reason:
          'Inspect the fully connected candidate with this semantic assessment.',
      },
    },
    ({ payload }) => {
      assert.deepEqual(payload.inspection.unmetGoalIds, [semantic.id]);
      assert.deepEqual(payload.context.edges, result.revision.session.edges);
    },
  );
  let completedPublications = 0;
  const observerFailure = new Error('Completion observer unavailable');
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => source,
    model,
    checkpointer: new MemorySaver(),
    policy: {
      maxModelInvocations: 2,
      maxRejectedProposals: 1,
      deadlineMs: 30000,
    },
    observe: (progress) => {
      if (progress.phase === 'complete' && ++completedPublications === 1)
        throw observerFailure;
    },
  });
  const config = {
    configurable: { thread_id: 'revised-semantic-continuation' },
  };
  await assert.rejects(
    graph.invoke(
      {
        session: result.revision.session,
        startedAt: Date.now(),
        modelInvocations: 1,
        rejectedProposals: [],
        rejectedGoalProposals: [],
        status: 'planning',
      },
      config,
    ),
    (error) => error === observerFailure,
  );
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ['publishCompletion']);
  assert.equal(snapshot.values.status, 'complete');
  const completed = await graph.invoke(null, config);
  assert.equal(completed.status, 'complete');
  assert.equal(completed.modelInvocations, 2);
  assert.deepEqual(completed.session.edges, result.revision.session.edges);
  assert.deepEqual(completed.plan.edges, result.revision.session.edges);
  assert.equal(revisionModel.calls.length, 1);
  assert.equal(model.calls.length, 1);
  assert.equal(input.before.session.id, input.expected.sessionId);
});

test('a malformed model output cannot skip the concurrent-evidence guard and become proposal feedback', async () => {
  const { input, rejectedOutput } = connectionRevisionRejectionFixture();
  const firstError = await captureRevisionFailure(
    input,
    revisionFeedbackModel(rejectedOutput),
  );
  const originalFeedback = createWorkflowConnectionRevisionRejection({
    ...input,
    error: firstError,
  });
  const rejectedProposals = [globalThis.structuredClone(originalFeedback)];
  const malformed = { decision: { kind: 'invalid-decision' } };
  const model = revisionFeedbackModel(malformed, () => {
    rejectedProposals[0].reason = 'Changed while the request was in flight.';
  });
  const error = await captureRevisionFailure(
    { ...input, rejectedProposals },
    model,
  );
  assert.equal(error.diagnostic.stage, 'input-validation');
  assert.equal(error.diagnostic.code, 'PLANNING_INPUT_INVALID');
  assert.deepEqual(error.output, malformed);
  assert.equal(error.cause.errors[0].diagnostic.stage, 'model-output');
  assert.equal(
    createWorkflowConnectionRevisionRejection({ ...input, error }),
    undefined,
  );
  assert.equal(model.calls.length, 1);
});
