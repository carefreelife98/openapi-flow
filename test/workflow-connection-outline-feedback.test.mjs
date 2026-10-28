import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionOutline,
  createWorkflowConnectionOutlineRejection,
  describeWorkflowConnectionOutlineRequest,
  WorkflowConnectionPlanningError,
} from '@openapi-flow/langchain';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  connectionOutlineFixture,
  connectionOutlineProposal,
} from './fixtures/connection-outline-fixture.mjs';
import { recoveryQueueModel } from './fixtures/initial-connection-recovery-fixture.mjs';

function prepare() {
  const fixture = connectionOutlineFixture();
  const session = createWorkflowConnectionSession({
    ...fixture.source,
    goals: fixture.goals,
  });
  const input = { ...fixture.source, session };
  const proposal = connectionOutlineProposal(
    describeWorkflowConnectionStep(input),
  );
  const invalid = globalThis.structuredClone(proposal);
  invalid.bundles.pop();
  return { ...fixture, input, proposal, invalid };
}
async function capture(input, output, inspect) {
  const model = recoveryQueueModel([output], inspect);
  let failure;
  try {
    await planWorkflowConnectionOutline({ ...input, model });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof WorkflowConnectionPlanningError);
  assert.equal(model.requests.length, 1);
  return failure;
}
const policy = {
  maxModelInvocations: 8,
  maxRejectedProposals: 2,
  deadlineMs: 30000,
};

test('outline feedback preserves the original rejected JSON and code-owned request context without exposing it in public errors', async () => {
  const { input, invalid, proposal } = prepare();
  const before = JSON.stringify(input);
  const error = await capture(input, invalid);
  const feedback = createWorkflowConnectionOutlineRejection({
    ...input,
    error,
  });
  assert.ok(feedback);
  assert.equal(feedback.stage, 'contract-validation');
  assert.deepEqual(feedback.output, invalid);
  assert.equal(
    feedback.requestFingerprint,
    describeWorkflowConnectionOutlineRequest(input).requestFingerprint,
  );
  assert.deepEqual(
    feedback.expected,
    describeWorkflowConnectionStep(input).expected,
  );
  assert.equal(JSON.stringify(error.toJSON()).includes('bundles'), false);
  const model = recoveryQueueModel([proposal], ({ payload, schema }) => {
    assert.deepEqual(payload.rejectedProposals, [feedback]);
    assert.deepEqual(payload.requirements, input.requirements);
    assert.deepEqual(Object.keys(schema.properties).sort(), [
      'bundles',
      'purpose',
    ]);
  });
  const outline = await planWorkflowConnectionOutline({
    ...input,
    model,
    rejectedProposals: [feedback],
  });
  assert.equal(outline.bundles.length, 4);
  assert.equal(model.requests.length, 1);
  assert.equal(JSON.stringify(input), before);
  feedback.output.bundles[0].purpose = 'changed copy';
  assert.deepEqual(error.output, invalid);
});

test('malformed outline JSON is replannable, but foreign operations, transport and non-JSON results are not', async () => {
  const { input } = prepare();
  const error = await capture(input, { unknown: 'proposal' });
  assert.equal(
    createWorkflowConnectionOutlineRejection({ ...input, error }).stage,
    'model-output',
  );
  for (const failure of [
    new Error('HTTP 400 invalid outline proposal'),
    new WorkflowConnectionPlanningError(
      {
        operation: 'planWorkflowConnectionGoals',
        stage: 'model-output',
        code: 'MODEL_OUTPUT_INVALID',
        output: {},
        sourceFingerprint: error.sourceFingerprint,
        requestFingerprint: error.requestFingerprint,
      },
      new Error('foreign operation'),
    ),
    new WorkflowConnectionPlanningError(
      {
        operation: 'planWorkflowConnectionOutline',
        stage: 'model-output',
        code: 'MODEL_OUTPUT_INVALID',
        output: { missing: undefined },
        sourceFingerprint: error.sourceFingerprint,
        requestFingerprint: error.requestFingerprint,
      },
      new Error('non-JSON'),
    ),
  ])
    assert.equal(
      createWorkflowConnectionOutlineRejection({ ...input, error: failure }),
      undefined,
    );
});

test('outline feedback cannot cross revisions, sessions, grouping hypotheses or changed requirements', async () => {
  const { input, invalid, proposal, patches } = prepare();
  const error = await capture(input, invalid);
  const feedback = createWorkflowConnectionOutlineRejection({
    ...input,
    error,
  });
  const first = applyWorkflowConnectionStep({
    ...input,
    expected: describeWorkflowConnectionStep(input).expected,
    proposal: patches[0],
  });
  assert.equal(first.status, 'accepted');
  const otherSession = createWorkflowConnectionSession({
    ...input,
    goals: input.session.goals.map((goal) => goal.decision),
  });
  const accepted = await planWorkflowConnectionOutline({
    ...input,
    model: recoveryQueueModel([proposal]),
  });
  for (const current of [
    { ...input, session: first.session },
    { ...input, session: otherSession },
    { ...input, previousOutline: accepted },
  ]) {
    assert.equal(
      createWorkflowConnectionOutlineRejection({ ...current, error }),
      undefined,
    );
    const model = recoveryQueueModel([proposal]);
    await assert.rejects(
      planWorkflowConnectionOutline({
        ...current,
        model,
        rejectedProposals: [feedback],
      }),
      (failure) => failure.diagnostic.stage === 'input-validation',
    );
    assert.equal(model.requests.length, 0);
  }
  const changed = {
    ...input,
    requirements: globalThis.structuredClone(input.requirements),
  };
  changed.requirements[0].text += ' changed';
  assert.throws(() =>
    createWorkflowConnectionOutlineRejection({ ...changed, error }),
  );
});

test('concurrent feedback mutation remains an input failure even when the next outline output is malformed', async () => {
  const { input, invalid } = prepare();
  const feedback = createWorkflowConnectionOutlineRejection({
    ...input,
    error: await capture(input, invalid),
  });
  const rejectedProposals = [feedback];
  const model = recoveryQueueModel([{ bad: true }], () => {
    feedback.reason += ' changed';
  });
  await assert.rejects(
    planWorkflowConnectionOutline({ ...input, model, rejectedProposals }),
    (error) => {
      assert.equal(error.diagnostic.stage, 'input-validation');
      assert.ok(error.cause instanceof AggregateError);
      assert.equal(error.cause.errors[0].diagnostic.stage, 'model-output');
      assert.equal(
        createWorkflowConnectionOutlineRejection({ ...input, error }),
        undefined,
      );
      return true;
    },
  );
  assert.equal(model.requests.length, 1);
});

test('host checkpoints rejected outlines, re-plans under one shared budget and resumes notification without repeating any model', async () => {
  const fixture = prepare();
  const model = recoveryQueueModel(
    [
      { goals: fixture.goals },
      fixture.invalid,
      fixture.proposal,
      ...fixture.modelPatches,
    ],
    ({ payload }, index) => {
      if (index === 2) {
        assert.deepEqual(payload.rejectedProposals[0].output, fixture.invalid);
        assert.deepEqual(payload.requirements, fixture.source.requirements);
      }
    },
  );
  let selected = 0,
    notifications = 0;
  const observerFailure = new Error('Local notification failed');
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    checkpointer: new MemorySaver(),
    outlinePlanning: {
      model,
      selectBundle: ({ outline }) => outline.bundles[selected++].id,
      observe: () => {
        if (++notifications === 1) throw observerFailure;
      },
    },
  });
  const config = { configurable: { thread_id: 'outline-feedback-checkpoint' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === observerFailure,
  );
  const checkpoint = await graph.getState(config);
  assert.deepEqual(checkpoint.next, ['publishOutline']);
  assert.deepEqual(
    checkpoint.values.rejectedOutlineProposals[0].output,
    fixture.invalid,
  );
  assert.equal(checkpoint.values.outlineHistory.length, 1);
  assert.equal(model.requests.length, 3);
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 6);
  assert.equal(model.requests.length, 6);
  assert.equal(result.session.revision, 3);
  assert.deepEqual(result.plan.edges, fixture.plan.edges);
  assert.equal(Object.hasOwn(result, '__interrupt__'), false);
});

test('rejected outlines consume the global rejection and model limits before another underlying call', async () => {
  for (const limit of [
    { maxRejectedProposals: 0 },
    { maxModelInvocations: 2 },
  ]) {
    const fixture = prepare();
    const model = recoveryQueueModel([
      { goals: fixture.goals },
      fixture.invalid,
    ]);
    const graph = createIncrementalWorkflowConnectionGraph({
      source: () => fixture.source,
      model,
      policy: { ...policy, ...limit },
      outlinePlanning: {
        model,
        selectBundle: () => {
          throw new Error('No rejected outline may be scheduled');
        },
      },
    });
    await assert.rejects(
      graph.invoke({}),
      (error) => error instanceof IncrementalConnectionLimitError,
    );
    assert.equal(model.requests.length, 2);
  }
});

test('outline transport failures stay original failures and checkpoint resumption cannot spend another model call', async () => {
  const fixture = prepare();
  const failure = new Error('HTTP transport unavailable');
  const model = recoveryQueueModel([{ goals: fixture.goals }, failure]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    checkpointer: new MemorySaver(),
    outlinePlanning: { model, selectBundle: () => 'never' },
  });
  const config = { configurable: { thread_id: 'outline-transport' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error.cause === failure,
  );
  const checkpoint = await graph.getState(config);
  assert.deepEqual(checkpoint.next, ['fail']);
  assert.deepEqual(checkpoint.values.rejectedOutlineProposals, []);
  await assert.rejects(
    graph.invoke(null, config),
    (error) => error.cause === failure,
  );
  assert.equal(model.requests.length, 2);
});
