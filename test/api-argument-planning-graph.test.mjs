import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  createApiArgumentPlanningGraph,
  ApiArgumentPlanningLimitError,
  createReviewableWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import { literalGenerationFixture } from './fixtures/literal-generation-fixture.mjs';
import {
  repeatedCallLiteralFixture,
  repeatedCallLiteralModel,
} from './fixtures/repeated-call-literal-fixture.mjs';

const policy = { maxAttempts: 3, maxRejectedProposals: 2, deadlineMs: 30_000 };
const valid = { values: { body: { quantity: 2 } } };
const invalid = { values: { body: { quantity: 'wrong-type' } } };

function modelQueue(outputs) {
  const requests = [];
  return {
    requests,
    withStructuredOutput() {
      return {
        async invoke(messages, config) {
          const request = { payload: JSON.parse(messages[1].content), config };
          const index = requests.push(request) - 1;
          assert.ok(
            index < outputs.length,
            'unexpected extra model invocation',
          );
          const output = outputs[index];
          if (output instanceof Error) throw output;
          return typeof output === 'function'
            ? output(request)
            : globalThis.structuredClone(output);
        },
      };
    },
  };
}

test('example host replans only a rejected literal proposal with unchanged source and safe progress', async () => {
  const source = await literalGenerationFixture();
  const original = globalThis.structuredClone(source);
  const model = modelQueue([invalid, valid]);
  const progress = [];
  const graph = createApiArgumentPlanningGraph({
    model,
    source: () => source,
    policy,
    observe: (event) => progress.push(event),
  });
  const result = await graph.invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.attempts, 2);
  assert.equal(result.rejectedProposals.length, 1);
  assert.deepEqual(result.rejectedProposals[0].output, invalid);
  assert.deepEqual(result.arguments.values.body, {
    id: 'confirmed-original',
    quantity: 2,
  });
  assert.deepEqual(source, original);
  assert.equal(model.requests[1].payload.scenario, source.scenario);
  assert.deepEqual(
    model.requests[1].payload.rejectedProposals,
    result.rejectedProposals,
  );
  assert.deepEqual(
    progress.map((event) => event.phase),
    ['started', 'rejected', 'started', 'completed'],
  );
  for (const event of progress)
    assert.deepEqual(Object.keys(event).sort(), [
      'attempts',
      'callId',
      'phase',
      'rejectedProposals',
    ]);
  const { failureId, ...jsonState } = result;
  assert.equal(failureId, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), jsonState);
});

test('missing user values are a valid proposal and do not enter a technical retry loop', async () => {
  const source = {
    ...(await literalGenerationFixture()),
    trackRequestedInputs: true,
  };
  const model = modelQueue([
    {
      literalInputs: { state: 'not-provided' },
      requestedInputs: ['/body/quantity'],
    },
  ]);
  const result = await createApiArgumentPlanningGraph({
    source: () => source,
    model,
    policy,
  }).invoke({});
  assert.equal(result.attempts, 1);
  assert.ok(result.arguments.unresolvedInputs.length > 0);
  assert.equal(Object.hasOwn(result.arguments.values.body, 'quantity'), false);
});

test('transport errors exit once with their original cause and no correction feedback', async () => {
  const source = await literalGenerationFixture();
  const cause = new Error('provider unavailable');
  const model = modelQueue([cause]);
  const graph = createApiArgumentPlanningGraph({
    source: () => source,
    model,
    policy,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'transport-failure' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) =>
      error.diagnostic.code === 'MODEL_INVOCATION_FAILED' &&
      error.cause === cause,
  );
  assert.deepEqual((await graph.getState(config)).next, ['fail']);
  await assert.rejects(
    graph.invoke(null, config),
    (error) => error.cause === cause,
  );
  assert.equal(model.requests.length, 1);
});

test('attempt and rejection budgets stop without changing values or resetting checkpoint counters', async () => {
  for (const [limits, kind] of [
    [{ ...policy, maxAttempts: 1 }, 'attempts'],
    [{ ...policy, maxRejectedProposals: 0 }, 'rejected-proposals'],
  ]) {
    const source = await literalGenerationFixture();
    const model = modelQueue([invalid]);
    const checkpointer = new MemorySaver();
    const config = { configurable: { thread_id: kind } };
    const graph = createApiArgumentPlanningGraph({
      source: () => source,
      model,
      policy: limits,
      checkpointer,
    });
    const expected = (error) =>
      error instanceof ApiArgumentPlanningLimitError &&
      error.failure.kind === kind;
    await assert.rejects(graph.invoke({}, config), expected);
    const snapshot = await graph.getState(config);
    assert.equal(snapshot.values.attempts, 1);
    assert.equal(snapshot.values.rejectedProposals.length, 1);
    await assert.rejects(graph.invoke(null, config), expected);
    assert.equal(model.requests.length, 1);
  }
});

test('completed values survive observer failure and resume without another model call', async () => {
  const source = await literalGenerationFixture();
  const model = modelQueue([valid]);
  const cause = new Error('event sink unavailable');
  let blocked = true;
  const graph = createApiArgumentPlanningGraph({
    source: () => source,
    model,
    policy,
    checkpointer: new MemorySaver(),
    observe: (event) => {
      if (event.phase === 'completed' && blocked) throw cause;
    },
  });
  const config = { configurable: { thread_id: 'observer' } };
  await assert.rejects(graph.invoke({}, config), (error) => error === cause);
  const snapshot = await graph.getState(config);
  assert.equal(snapshot.values.status, 'complete');
  assert.deepEqual(snapshot.next, ['publishOutcome']);
  blocked = false;
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(model.requests.length, 1);
});

test('changed source is rejected before a completed checkpoint can be reused', async () => {
  let source = await literalGenerationFixture();
  const model = modelQueue([valid]);
  const graph = createApiArgumentPlanningGraph({
    source: () => source,
    model,
    policy,
    checkpointer: new MemorySaver(),
  });
  const config = { configurable: { thread_id: 'source-change' } };
  await graph.invoke({}, config);
  source = { ...source, scenario: source.scenario + ' changed' };
  await assert.rejects(graph.invoke({}, config), /source or policy changed/);
  assert.equal(model.requests.length, 1);
});

test('host cancellation reaches the active proposal and no next attempt starts', async () => {
  const source = await literalGenerationFixture();
  const controller = new globalThis.AbortController();
  const cause = new Error('host cancelled');
  const model = modelQueue([
    ({ config }) => {
      assert.ok(config.signal instanceof globalThis.AbortSignal);
      controller.abort(cause);
      return valid;
    },
  ]);
  await assert.rejects(
    createApiArgumentPlanningGraph({
      source: () => source,
      model,
      policy,
    }).invoke({}, { signal: controller.signal }),
  );
  assert.equal(model.requests.length, 1);
});

test('a model response cannot be accepted after its source changed while it was pending', async () => {
  let source = await literalGenerationFixture();
  const model = modelQueue([
    () => {
      source = { ...source, purpose: 'changed role' };
      return valid;
    },
  ]);
  await assert.rejects(
    createApiArgumentPlanningGraph({
      source: () => source,
      model,
      policy,
    }).invoke({}),
    /source or policy changed/,
  );
  assert.equal(model.requests.length, 1);
});

test('the declared deadline aborts active generation and does not start a correction attempt', async () => {
  const source = await literalGenerationFixture();
  let aborted = false;
  const model = modelQueue([
    ({ config }) =>
      new Promise((_resolve, reject) => {
        config.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(config.signal.reason);
          },
          { once: true },
        );
      }),
  ]);
  const keepAlive = globalThis.setTimeout(() => {}, 10_000);
  try {
    await assert.rejects(
      createApiArgumentPlanningGraph({
        source: () => source,
        model,
        policy: { ...policy, deadlineMs: 2_000 },
      }).invoke({}),
      (error) =>
        error instanceof ApiArgumentPlanningLimitError &&
        error.failure.kind === 'deadline',
    );
    assert.equal(aborted, true);
    assert.equal(model.requests.length, 1);
  } finally {
    globalThis.clearTimeout(keepAlive);
  }
});

test('deadline applies to blocked progress observers, not only to model generation', async () => {
  const source = await literalGenerationFixture();
  const model = modelQueue([valid]);
  let released;
  const observation = new Promise((resolve) => {
    released = resolve;
  });
  const keepAlive = globalThis.setTimeout(() => {}, 10_000);
  try {
    const graph = createApiArgumentPlanningGraph({
      source: () => source,
      model,
      policy: { ...policy, deadlineMs: 2_000 },
      observe: () => observation,
    });
    await assert.rejects(
      graph.invoke({}),
      (error) =>
        error instanceof ApiArgumentPlanningLimitError &&
        error.failure.kind === 'deadline',
    );
    assert.equal(model.requests.length, 0);
  } finally {
    released();
    globalThis.clearTimeout(keepAlive);
  }
});

test('the actual preparation entrypoint enables correction explicitly and isolates repeated API roles', async () => {
  const fixture = await repeatedCallLiteralFixture();
  for (const enabled of [false, true]) {
    const delegate = repeatedCallLiteralModel();
    let rejectFirst = true;
    let invocations = 0;
    const model = {
      withStructuredOutput(schema, options) {
        const runnable = delegate.withStructuredOutput(schema, options);
        return {
          async invoke(messages, config) {
            if (options.name === 'generate_api_arguments') {
              invocations++;
              if (rejectFirst) {
                rejectFirst = false;
                return { values: { path: { id: 42 } } };
              }
            }
            return runnable.invoke(messages, config);
          },
        };
      },
    };
    const graph = createReviewableWorkflowGenerationGraph({
      model,
      capabilities: [],
      argumentOptions: { includeExplanations: true },
      ...(enabled
        ? { argumentPlanning: { policy, checkpointer: new MemorySaver() } }
        : {}),
    });
    const run = graph.invoke(
      {
        workflowId: 'host-correction',
        workflowName: 'Host correction',
        scenario: fixture.scenario,
        sources: fixture.sources,
        trace: [],
      },
      { configurable: { thread_id: 'two-roles' } },
    );
    if (!enabled) {
      await assert.rejects(
        run,
        (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
      );
      assert.equal(invocations, 1);
      continue;
    }
    const result = await run;
    assert.equal(result.status, 'complete');
    assert.equal(invocations, 3);
    assert.deepEqual(
      result.reviewMaterials.map((item) => item.arguments.values.path.id),
      ['fixture-first', 'fixture-second'],
    );
    assert.equal(
      result.workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.httpRequest',
      ).length,
      2,
    );
  }
});
