import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  createNativeSelectionPlanningGraph,
  NativeSelectionPlanningLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  nativeSelectionReviewFixture,
  nativeOutsideScopeReviewFixture,
} from './fixtures/native-instance-selection-review-fixture.mjs';

const policy = {
  maxModelInvocations: 5,
  maxReselections: 2,
  deadlineMs: 30_000,
};
const clone = (value) => globalThis.structuredClone(value);

function queueModel(outputs) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages, config) {
          const call = {
            name: options.name,
            schema,
            payload: JSON.parse(messages[1].content),
            config,
          };
          const index = calls.push(call) - 1;
          assert.ok(index < outputs.length, 'Unexpected extra model call');
          const output = outputs[index];
          if (output instanceof Error) throw output;
          return typeof output === 'function' ? output(call) : clone(output);
        },
      };
    },
  };
}

async function fixture() {
  const f = await nativeSelectionReviewFixture();
  const { capabilities, ...source } = f.input;
  return {
    ...f,
    source,
    capabilities,
    ready: { instances: f.proposal.instances, gaps: [] },
  };
}

test('an outside-scope gap goes through a fresh budgeted selection without changing the original or interrupting a human', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const { capabilities, ...source } = f.input;
  const before = clone(f.selection);
  const model = queueModel([
    f.proposal,
    f.reviewProposal,
    { instances: [], gaps: [] },
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities,
    model,
    policy,
    now: Date.now,
    checkpointer: new MemorySaver(),
  });
  const config = {
    configurable: { thread_id: 'outside-scope-fresh-selection' },
  };
  const result = await graph.invoke({ source }, config);
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 3);
  assert.equal(result.reselections, 1);
  assert.equal(result.selections.length, 2);
  assert.deepEqual(result.selections[0], before);
  assert.equal(result.selections[1].gaps.length, 0);
  assert.deepEqual(
    model.calls.map((call) => call.name),
    [
      'select_native_node_instances',
      'review_native_instance_selection',
      'select_native_node_instances',
    ],
  );
  assert.deepEqual(
    model.calls[2].payload.selectionFeedback.assessments,
    f.reviewProposal.assessments,
  );
  const saved = await graph.getState(config);
  assert.deepEqual(saved.next, []);
  assert.equal(saved.tasks.flatMap((entry) => entry.interrupts).length, 0);
  assert.deepEqual(f.selection, before);
});

test('explicit full review examines a gap-free selection and reselects an unrequested role before readiness', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const { capabilities, ...source } = f.input;
  const original = { ...f.proposal, gaps: [] };
  const model = queueModel([
    original,
    ({ payload }) => ({
      assessments: {},
      coverageAssessment: {
        kind: 'needs-reselection',
        reason:
          'Remove the optional check while preserving the original API response.',
      },
      instanceAssessments: Object.fromEntries(
        payload.instances.map((role) => [
          role.id,
          Object.values(f.reviewProposal.assessments)[0],
        ]),
      ),
    }),
    { instances: [], gaps: [] },
    {
      assessments: {},
      instanceAssessments: {},
      coverageAssessment: {
        kind: 'covered',
        reason:
          'The original request needs only the existing single API response.',
      },
    },
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities,
    model,
    policy,
    reviewOptions: { reviewInstances: true },
    now: Date.now,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'full-native-scope-review' } };
  const result = await graph.invoke({ source }, config);
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 4);
  assert.equal(result.reselections, 1);
  assert.equal(result.selections[0].gaps.length, 0);
  assert.equal(result.selections[0].instances.length, 1);
  assert.equal(result.selections[1].instances.length, 0);
  assert.equal(result.reviews[0].reviewInstances, true);
  assert.equal(model.calls[1].payload.reviewInstances, true);
  assert.deepEqual(
    model.calls[2].payload.selectionFeedback.instanceAssessments,
    result.reviews[0].proposal.instanceAssessments,
  );
  assert.deepEqual((await graph.getState(config)).next, []);
});

test('full-review readiness requires its original matching role review and cannot be resumed under another review mode', async () => {
  const f = await fixture();
  const model = queueModel([
    f.ready,
    ({ payload }) => ({
      assessments: {},
      coverageAssessment: {
        kind: 'covered',
        reason:
          'The provided comparison covers the explicit native requirement.',
      },
      instanceAssessments: Object.fromEntries(
        payload.instances.map((role) => [
          role.id,
          {
            kind: 'required',
            reason: 'The original request requires this comparison.',
          },
        ]),
      ),
    }),
  ]);
  const options = {
    capabilities: f.capabilities,
    model,
    policy,
    reviewOptions: { reviewInstances: true },
    now: Date.now,
    checkpointer: new MemorySaver(),
  };
  const graph = createNativeSelectionPlanningGraph(options);
  const saved = await graph.invoke(
    { source: f.source },
    { configurable: { thread_id: 'required-role' } },
  );
  assert.equal(saved.status, 'ready');
  assert.equal(saved.modelInvocations, 2);
  assert.equal(saved.reviews[0].status, 'no-gaps');
  await assert.rejects(
    graph.invoke(
      { ...saved, reviews: [] },
      { configurable: { thread_id: 'missing-role-review' } },
    ),
    /matching full instance review/,
  );
  const legacy = createNativeSelectionPlanningGraph({
    ...options,
    reviewOptions: undefined,
  });
  await assert.rejects(
    legacy.invoke(saved, {
      configurable: { thread_id: 'changed-role-review-mode' },
    }),
    /source or policy changed/,
  );
  assert.equal(model.calls.length, 2);
});

test('full review examines missing processing in an empty proposal instead of treating it as ready', async () => {
  const f = await fixture();
  const model = queueModel([
    { instances: [], gaps: [] },
    {
      assessments: {},
      instanceAssessments: {},
      coverageAssessment: {
        kind: 'needs-reselection',
        reason:
          'The supplied IF supports the requested comparison, but the empty selection omitted it.',
      },
    },
    f.ready,
    ({ payload }) => ({
      assessments: {},
      instanceAssessments: Object.fromEntries(
        payload.instances.map((role) => [
          role.id,
          {
            kind: 'required',
            reason: 'The role implements the explicit comparison.',
          },
        ]),
      ),
      coverageAssessment: {
        kind: 'covered',
        reason: 'The requested comparison now has its implementation.',
      },
    }),
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    reviewOptions: { reviewInstances: true },
    now: Date.now,
  });
  const result = await graph.invoke({ source: f.source });
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 4);
  assert.equal(result.selections[0].instances.length, 0);
  assert.equal(result.reviews[0].status, 'needs-reselection');
  assert.equal(result.reviews[1].status, 'no-gaps');
  assert.deepEqual(
    model.calls[2].payload.selectionFeedback.coverageAssessment,
    result.reviews[0].proposal.coverageAssessment,
  );
});

test('empty selections cannot skip the full-review budget or claim readiness without the coverage receipt', async () => {
  const f = await fixture();
  const model = queueModel([{ instances: [], gaps: [] }]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy: { ...policy, maxModelInvocations: 1 },
    reviewOptions: { reviewInstances: true },
    now: Date.now,
    checkpointer: new MemorySaver(),
  });
  const config = {
    configurable: { thread_id: 'empty-selection-coverage-budget' },
  };
  await assert.rejects(
    graph.invoke({ source: f.source }, config),
    NativeSelectionPlanningLimitError,
  );
  const saved = (await graph.getState(config)).values;
  assert.equal(saved.status, 'planning');
  assert.equal(saved.selections[0].instances.length, 0);
  assert.equal(saved.reviews.length, 0);
  await assert.rejects(
    graph.invoke(
      { ...saved, status: 'ready' },
      { configurable: { thread_id: 'forged-empty-selection-ready' } },
    ),
    /matching full instance review/,
  );
  assert.equal(model.calls.length, 1);
});

test('an outside-scope review cannot become ready without reserving its fresh selection call', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const { capabilities, ...source } = f.input;
  const model = queueModel([f.proposal, f.reviewProposal]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities,
    model,
    policy: { ...policy, maxModelInvocations: 2 },
    now: Date.now,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'outside-scope-budget' } };
  await assert.rejects(
    graph.invoke({ source }, config),
    (error) =>
      error instanceof NativeSelectionPlanningLimitError &&
      error.failure.kind === 'model-invocations',
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.status, 'planning');
  assert.equal(saved.values.selections[0].gaps.length, 1);
  assert.equal(saved.values.modelInvocations, 2);
  assert.equal(model.calls.length, 2);
  await assert.rejects(
    graph.invoke(null, config),
    NativeSelectionPlanningLimitError,
  );
  assert.equal(model.calls.length, 2);
});

test('native selection host checkpoints reservations, review and fresh selection without overwriting the rejected original', async () => {
  const f = await fixture();
  const before = clone(f.source);
  const progress = [];
  const config = {
    configurable: { thread_id: 'native-selection-ledger' },
    durability: 'sync',
  };
  let graph;
  const inspect = (output, count, next) => async () => {
    const saved = await graph.getState(config);
    assert.equal(saved.values.modelInvocations, count);
    assert.deepEqual(saved.next, [next]);
    assert.equal(saved.values.selections.length, count === 1 ? 0 : 1);
    return clone(output);
  };
  const model = queueModel([
    inspect(f.proposal, 1, 'selectInstances'),
    inspect(f.reviewProposal, 2, 'reviewSelection'),
    inspect(f.ready, 3, 'selectInstances'),
  ]);
  graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
    checkpointer: new MemorySaver(),
    observe: (event) => progress.push(event),
  });
  const result = await graph.invoke({ source: f.source }, config);
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 3);
  assert.equal(result.reselections, 1);
  assert.equal(result.selections.length, 2);
  assert.equal(result.reviews.length, 1);
  assert.deepEqual(result.selections[0], f.selection);
  assert.deepEqual(result.selections[1].proposal, f.ready);
  assert.deepEqual(f.source, before);
  assert.deepEqual(
    progress.map((event) => event.phase),
    ['selected', 'reviewed', 'ready'],
  );
  for (const event of progress) {
    assert.ok(!Object.hasOwn(event, 'scenario'));
    assert.ok(!Object.hasOwn(event, 'selection'));
    assert.ok(!Object.hasOwn(event, 'error'));
  }
  assert.deepEqual(
    model.calls[2].payload.selectionFeedback.previousSelections,
    [{ id: f.selection.id, proposal: f.proposal }],
  );
  assert.equal(model.calls[2].payload.scenario, f.source.scenario);
  const { failureId, ...serializable } = result;
  assert.equal(failureId, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), serializable);
  assert.equal((await graph.getState(config)).next.length, 0);
});

test('an unchanged rejected selection reuses its review and sends all attempts to the next explicit selection call', async () => {
  const f = await fixture();
  const model = queueModel([f.proposal, f.reviewProposal, f.proposal, f.ready]);
  const progress = [];
  const result = await createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
    observe: (event) => progress.push(event),
  }).invoke({ source: f.source });
  assert.equal(result.modelInvocations, 4);
  assert.equal(result.reselections, 2);
  assert.equal(result.selections.length, 3);
  assert.equal(result.reviews.length, 1);
  assert.deepEqual(result.selections[0], result.selections[1]);
  assert.deepEqual(
    progress.map((event) => event.phase),
    ['selected', 'reviewed', 'repeated-selection', 'ready'],
  );
  assert.equal(
    model.calls[3].payload.selectionFeedback.previousSelections.length,
    2,
  );
});

test('invalid selection and review outputs use source-bound feedback and the shared model budget without human approval', async () => {
  const f = await fixture();
  const badSelection = clone(f.proposal);
  badSelection.instances[0].capability = 'not-supplied';
  const badReview = clone(f.reviewProposal);
  badReview.assessments[f.selection.gaps[0].id].sourceQuote =
    'Generated explanation is not source text';
  const progress = [];
  const model = queueModel([
    badSelection,
    f.proposal,
    badReview,
    f.reviewProposal,
    f.ready,
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
    checkpointer: new MemorySaver(),
    observe: (event) => progress.push(event),
  });
  const config = {
    configurable: { thread_id: 'contract-correction-ledger' },
    durability: 'sync',
  };
  const result = await graph.invoke({ source: f.source }, config);
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 5);
  assert.equal(result.reselections, 1);
  assert.equal(result.selections.length, 2);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.rejectedProposals.length, 2);
  assert.deepEqual(
    result.rejectedProposals.map((entry) => entry.output),
    [badSelection, badReview],
  );
  assert.deepEqual(model.calls[1].payload.rejectedProposals, [
    result.rejectedProposals[0],
  ]);
  assert.deepEqual(model.calls[3].payload.rejectedProposals, [
    result.rejectedProposals[1],
  ]);
  assert.equal(
    Object.hasOwn(model.calls[4].payload, 'rejectedProposals'),
    false,
    'A new reviewed selection request cannot reuse stale contract feedback',
  );
  assert.deepEqual(
    progress.map((event) => event.phase),
    ['selection-rejected', 'selected', 'review-rejected', 'reviewed', 'ready'],
  );
  for (const event of progress) {
    assert.equal(Object.hasOwn(event, 'output'), false);
    assert.equal(Object.hasOwn(event, 'reason'), false);
  }
  const { failureId, ...serializable } = result;
  assert.equal(failureId, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), serializable);
  assert.deepEqual((await graph.getState(config)).next, []);
});

test('repeated invalid outputs stop before dispatch at the existing shared invocation limit and stay stopped on resume', async () => {
  const f = await fixture();
  const bad = clone(f.proposal);
  bad.instances[0].capability = 'not-supplied';
  const model = queueModel([bad, bad]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy: { ...policy, maxModelInvocations: 2 },
    now: Date.now,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'contract-rejection-limit' } };
  const limit = (error) =>
    error instanceof NativeSelectionPlanningLimitError &&
    error.failure.kind === 'model-invocations';
  await assert.rejects(graph.invoke({ source: f.source }, config), limit);
  const saved = await graph.getState(config);
  assert.equal(saved.values.modelInvocations, 2);
  assert.equal(saved.values.rejectedProposals.length, 2);
  await assert.rejects(graph.invoke(null, config), limit);
  assert.equal(model.calls.length, 2);
});

test('an observer failure after a contract rejection retains its output checkpoint without repeating model calls', async () => {
  const f = await fixture();
  const bad = clone(f.proposal);
  bad.instances[0].capability = 'not-supplied';
  const cause = new Error('Original rejection observer failure');
  const model = queueModel([bad]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
    checkpointer: new MemorySaver(),
    observe: () => {
      throw cause;
    },
  });
  const config = { configurable: { thread_id: 'rejected-observer-failure' } };
  await assert.rejects(
    graph.invoke({ source: f.source }, config),
    (error) => error === cause,
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.rejectedProposals.length, 1);
  assert.deepEqual(saved.values.rejectedProposals[0].output, bad);
  assert.deepEqual(saved.next, ['fail']);
  await assert.rejects(graph.invoke(null, config), (error) => error === cause);
  assert.equal(model.calls.length, 1);
});

for (const [field, value, kind, outputs, expectedCalls] of [
  ['maxModelInvocations', 2, 'model-invocations', 'reviewed', 2],
  ['maxReselections', 0, 'reselections', 'reviewed', 2],
  ['maxReselections', 1, 'reselections', 'repeated', 3],
]) {
  test(`explicit ${field}=${value} stops before dispatch and remains stopped on checkpoint resume`, async () => {
    const f = await fixture();
    const model = queueModel([
      f.proposal,
      f.reviewProposal,
      ...(outputs === 'repeated' ? [f.proposal] : []),
    ]);
    const graph = createNativeSelectionPlanningGraph({
      capabilities: f.capabilities,
      model,
      policy: { ...policy, [field]: value },
      now: Date.now,
      checkpointer: new MemorySaver(),
    });
    const config = { configurable: { thread_id: field + value } };
    const check = (error) =>
      error instanceof NativeSelectionPlanningLimitError &&
      error.failure.kind === kind;
    await assert.rejects(graph.invoke({ source: f.source }, config), check);
    const saved = await graph.getState(config);
    assert.equal(saved.values.modelInvocations, expectedCalls);
    assert.deepEqual(saved.next, ['reserveModelCall']);
    await assert.rejects(graph.invoke(null, config), check);
    assert.equal(model.calls.length, expectedCalls);
    assert.deepEqual(
      (await graph.getState(config)).values.selections,
      saved.values.selections,
    );
  });
}

for (const stage of ['selection', 'review', 'reselection', 'observer']) {
  test(`${stage} failure is saved without a raw Error in checkpoint and does not repeat model work on resume`, async () => {
    const f = await fixture();
    const cause = new Error('Original private failure');
    const outputs =
      stage === 'selection'
        ? [cause]
        : stage === 'review'
          ? [f.proposal, cause]
          : stage === 'reselection'
            ? [f.proposal, f.reviewProposal, cause]
            : [f.proposal];
    const model = queueModel(outputs);
    const graph = createNativeSelectionPlanningGraph({
      capabilities: f.capabilities,
      model,
      policy,
      now: Date.now,
      checkpointer: new MemorySaver(),
      ...(stage === 'observer'
        ? {
            observe: () => {
              throw cause;
            },
          }
        : {}),
    });
    const config = { configurable: { thread_id: 'failed-' + stage } };
    let original;
    await assert.rejects(
      graph.invoke({ source: f.source }, config),
      (error) => {
        original = error;
        return error === cause || error.cause === cause;
      },
    );
    const saved = await graph.getState(config);
    assert.deepEqual(saved.next, ['fail']);
    assert.equal(typeof saved.values.failureId, 'string');
    assert.equal(JSON.stringify(saved.values).includes(cause.message), false);
    const calls = model.calls.length;
    await assert.rejects(
      graph.invoke(null, config),
      (error) => error === original,
    );
    assert.equal(model.calls.length, calls);
    assert.equal((await graph.getState(config)).values.modelInvocations, calls);
  });
}

for (const [kind, status] of [
  ['unsupported-native-behavior', 'unavailable-native-behavior'],
  ['business-decision', 'needs-business-decision'],
]) {
  test(`${kind} preserves the original gap and does not enter automatic reselection`, async () => {
    const f = await fixture();
    const review = clone(f.reviewProposal);
    review.assessments[f.selection.gaps[0].id] = {
      kind,
      reason: 'The original behavior still needs this decision.',
      ...(kind === 'business-decision' ? { question: 'Which threshold?' } : {}),
    };
    const model = queueModel([f.proposal, review]);
    const result = await createNativeSelectionPlanningGraph({
      capabilities: f.capabilities,
      model,
      policy,
      now: Date.now,
    }).invoke({ source: f.source });
    assert.equal(result.status, status);
    assert.equal(result.reselections, 0);
    assert.equal(model.calls.length, 2);
    assert.deepEqual(result.selections, [f.selection]);
    assert.equal(result.reviews[0].status, status);
  });
}

test('an explicitly empty capability list needs no model and works with zero model-call budget', async () => {
  const result = await createNativeSelectionPlanningGraph({
    capabilities: [],
    policy: { ...policy, maxModelInvocations: 0, maxReselections: 0 },
    now: Date.now,
  }).invoke({ source: { planId: 'empty', scenario: 'No native tasks' } });
  assert.equal(result.status, 'ready');
  assert.equal(result.modelInvocations, 0);
  assert.deepEqual(result.selections[0].proposal, { instances: [], gaps: [] });
});

test('a deadline reached during a model call preserves its reservation and does not run review or repeat the call', async () => {
  const f = await fixture();
  let now = 100;
  const model = queueModel([
    () => {
      now = 30_100;
      return clone(f.proposal);
    },
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: () => now,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'deadline' } };
  const check = (error) =>
    error instanceof NativeSelectionPlanningLimitError &&
    error.failure.kind === 'deadline';
  await assert.rejects(graph.invoke({ source: f.source }, config), check);
  await assert.rejects(graph.invoke(null, config), check);
  assert.equal(model.calls.length, 1);
  assert.equal((await graph.getState(config)).values.modelInvocations, 1);
});

test('a changed source, runtime definition, or explicit policy cannot reuse an old selection ledger', async () => {
  for (const changed of ['source', 'capability', 'policy']) {
    const f = await fixture();
    const model = queueModel([f.ready]);
    const checkpointer = new MemorySaver();
    const dependencies = {
      capabilities: f.capabilities,
      model,
      policy,
      now: Date.now,
      checkpointer,
    };
    let graph = createNativeSelectionPlanningGraph(dependencies);
    const config = { configurable: { thread_id: 'changed-' + changed } };
    await graph.invoke({ source: f.source }, config);
    if (changed === 'source') {
      await graph.updateState(config, {
        source: { ...f.source, scenario: f.source.scenario + ' changed' },
      });
    } else {
      graph = createNativeSelectionPlanningGraph({
        ...dependencies,
        ...(changed === 'policy'
          ? { policy: { ...policy, maxModelInvocations: 6 } }
          : {
              capabilities: f.capabilities.map((capability) => ({
                ...capability,
                description: 'Changed contract',
              })),
            }),
      });
    }
    await assert.rejects(graph.invoke({}, config), /source or policy changed/);
    assert.equal(model.calls.length, 1);
  }
});

test('caller cancellation during selection cannot produce a review or become a correction retry', async () => {
  const f = await fixture();
  const controller = new globalThis.AbortController();
  const cause = new Error('Explicit caller cancellation');
  const model = queueModel([
    ({ config }) => {
      assert(config.signal instanceof globalThis.AbortSignal);
      controller.abort(cause);
      config.signal.throwIfAborted();
    },
  ]);
  const graph = createNativeSelectionPlanningGraph({
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
  });
  await assert.rejects(
    graph.invoke({ source: f.source }, { signal: controller.signal }),
    (error) => error === cause || error.cause === cause,
  );
  assert.equal(model.calls.length, 1);
});

test('terminal state and consumed-call accounting cannot be fabricated from a gap-bearing checkpoint', async () => {
  for (const update of [
    { status: 'ready' },
    { modelInvocations: 0 },
    { status: 'needs-business-decision' },
  ]) {
    const f = await fixture();
    const model = queueModel([f.proposal]);
    const graph = createNativeSelectionPlanningGraph({
      capabilities: f.capabilities,
      model,
      policy,
      now: Date.now,
      checkpointer: new MemorySaver(),
      observe() {
        throw new Error('Stop after first saved selection');
      },
    });
    const config = { configurable: { thread_id: JSON.stringify(update) } };
    await assert.rejects(graph.invoke({ source: f.source }, config));
    await graph.updateState(config, update);
    await assert.rejects(
      graph.invoke({}, config),
      /gap-free|consumed reservations|matching original review/,
    );
    assert.equal(model.calls.length, 1);
  }
});

test('concurrent threads retain distinct original failures and a new graph runtime fails closed rather than repeating a call', async () => {
  const f = await fixture();
  const causes = [
    new Error('first provider failure'),
    new Error('second provider failure'),
  ];
  const model = queueModel(causes);
  const dependencies = {
    capabilities: f.capabilities,
    model,
    policy,
    now: Date.now,
    checkpointer: new MemorySaver(),
  };
  const graph = createNativeSelectionPlanningGraph(dependencies);
  const configs = causes.map((_, index) => ({
    configurable: { thread_id: 'parallel-' + index },
  }));
  const results = await Promise.allSettled(
    configs.map((config) => graph.invoke({ source: f.source }, config)),
  );
  const errors = results.map((entry) => {
    assert.equal(entry.status, 'rejected');
    assert(
      causes.includes(entry.reason) || causes.includes(entry.reason.cause),
      entry.reason.stack,
    );
    return entry.reason;
  });
  assert.notEqual(errors[0], errors[1]);
  for (const [index, config] of configs.entries())
    await assert.rejects(
      graph.invoke(null, config),
      (error) => error === errors[index],
    );
  const replacement = createNativeSelectionPlanningGraph(dependencies);
  await assert.rejects(
    replacement.invoke(null, configs[0]),
    /Original native selection failure is unavailable/,
  );
  assert.equal(model.calls.length, 2);
});
