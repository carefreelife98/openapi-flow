import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  replayWorkflowConnectionMaterialRepair,
  inspectWorkflowConnectionMaterialRepairInputs,
  describeWorkflowConnectionMaterialRepairWork,
  selectWorkflowConnectionArgumentValues,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const policy = {
  maxModelInvocations: 8,
  maxRejectedProposals: 3,
  deadlineMs: 30000,
};
function successfulOutputs(fixture) {
  return [
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
  ];
}
function createGraph(fixture, outputs, recovery, extra = {}) {
  const model = recoveryQueueModel(outputs);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.broken,
    model,
    policy,
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => fixture.replacement,
      ...recovery,
    },
    ...extra,
  });
  return { model, graph };
}

test('a wrong initial binding is automatically reconsidered, replaced and checkpointed before the original goals and DAG can complete', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const before = globalThis.structuredClone({
    ...fixture.broken,
    capabilities: undefined,
  });
  const progress = [];
  let callbacks = 0;
  const { graph, model } = createGraph(fixture, successfulOutputs(fixture), {
    replan: async ({ source, request, signal }) => {
      callbacks++;
      assert.equal(signal.aborted, false);
      assert.deepEqual(request.request, fixture.request);
      assert.equal(
        source.materials.find((item) => item.arguments.callId === 'price')
          .arguments.bindings[0].sourceNodeId,
        'detail',
      );
      return fixture.replacement;
    },
    observe: (event) => progress.push(event),
  });
  const state = await graph.invoke({});
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 4);
  assert.equal(
    state.modelInvocations,
    4,
    'The explicit zero-call material callback does not reserve a model invocation',
  );
  assert.equal(state.rejectedGoalProposals.length, 1);
  assert.equal(state.materialRepairs.length, 1);
  assert.deepEqual(state.plan.edges, fixture.plan.edges);
  const source = replayWorkflowConnectionMaterialRepair({
    source: fixture.broken,
    receipt: state.materialRepairs[0],
  });
  assert.deepEqual(source.materials, fixture.source.materials);
  assert.deepEqual(
    progress.map((item) => item.phase),
    ['requested', 'replanned', 'applied'],
  );
  assert.ok(
    progress.every(
      (item) =>
        !Object.hasOwn(item, 'values') && !Object.hasOwn(item, 'source'),
    ),
  );
  assert.deepEqual({ ...fixture.broken, capabilities: undefined }, before);
});

test('a wrong goal can be repaired without invoking any material callback or replacing correct source values', async () => {
  const fixture = initialConnectionRecoveryFixture();
  fixture.broken = fixture.source;
  const invalid = [
    {
      kind: 'precedence',
      before: 'summary',
      after: 'source',
      factIds: ['intent'],
      reason: 'A wrong ordering hypothesis.',
    },
  ];
  let callbacks = 0;
  const { graph } = createGraph(
    fixture,
    [
      { goals: invalid },
      { decision: { kind: 'goals', goals: fixture.goals } },
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
    ],
    {
      replan: async () => {
        callbacks++;
        throw new Error('Must not run');
      },
    },
  );
  const state = await graph.invoke({});
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 0);
  assert.deepEqual(state.materialRepairs, []);
  assert.equal(state.modelInvocations, 3);
});

test('the host can explicitly defer a newly independent request input without a fake literal or a per-API human interrupt', async () => {
  const fixture = initialConnectionRecoveryFixture();
  fixture.replacement.apiArguments[0].bindings =
    fixture.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  // This test host explicitly permits all currently missing inputs to be supplied at execution time.
  let callbacks = 0;
  const { graph, model } = createGraph(
    fixture,
    successfulOutputs(fixture),
    {
      replan: async ({ source, request }) => {
        callbacks++;
        const inspection = inspectWorkflowConnectionMaterialRepairInputs({
          source,
          request,
          replacement: fixture.replacement,
        });
        assert.deepEqual(
          inspection.slots.map((slot) => [slot.callId, slot.targetPointer]),
          [['price', '/query/id']],
        );
        return {
          ...fixture.replacement,
          deferredApiInputIds: inspection.slots.map((slot) => slot.id),
        };
      },
    },
    { checkpointer: new MemorySaver() },
  );
  const config = { configurable: { thread_id: 'repair-runtime-input-policy' } };
  const state = await graph.invoke({}, config);
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 4);
  const [receipt] = state.materialRepairs;
  const restored = replayWorkflowConnectionMaterialRepair({
    source: fixture.broken,
    receipt,
  });
  assert.equal(restored.deferredApiInputIds.length, 1);
  assert.deepEqual(
    restored.materials.find((material) => material.arguments.callId === 'price')
      .arguments.values,
    {},
  );
  assert.deepEqual(state.plan.edges, fixture.plan.edges);
  assert.equal(Object.hasOwn(state, '__interrupt__'), false);
  assert.equal((await graph.invoke(null, config)).status, 'complete');
  assert.equal(model.requests.length, 4);
  assert.equal(callbacks, 1);
  const tampered = globalThis.structuredClone(state);
  tampered.materialRepairs[0].replacement.deferredApiInputIds = [];
  await assert.rejects(
    graph.invoke(tampered, config),
    /explicitly defer current slot/,
  );
});

test('missing input policy is not inferred from a binding change or from the fact that the graph can be drawn', async () => {
  const fixture = initialConnectionRecoveryFixture();
  fixture.replacement.apiArguments[0].bindings =
    fixture.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const { graph, model } = createGraph(fixture, successfulOutputs(fixture), {});
  await assert.rejects(graph.invoke({}), /explicitly defer current slot/);
  assert.equal(
    model.requests.length,
    2,
    'No connection proposal is paid for before readiness is established',
  );
  assert.equal(fixture.broken.deferredApiInputIds, undefined);
});

test('dependent argument work uses the same reserved lease and survives checkpointed progress failure without repeating any planner', async () => {
  const fixture = initialConnectionRecoveryFixture();
  fixture.replacement.apiArguments[0].bindings =
    fixture.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const outputs = successfulOutputs(fixture);
  outputs.splice(2, 0, {
    literalInputs: { state: 'not-provided' },
    requestedInputs: [],
  });
  let callbacks = 0;
  let observed = false;
  const observerFailure = new Error(
    'Dependent result progress failed after checkpoint',
  );
  const { graph, model } = createGraph(
    fixture,
    outputs,
    {
      modelInvocations: 1,
      replan: async ({ source, request, model: leasedModel, signal }) => {
        callbacks++;
        const pendingReplacement = fixture.replacement;
        const work = describeWorkflowConnectionMaterialRepairWork({
          source,
          request,
          replacement: pendingReplacement,
        });
        const apiArguments = [...pendingReplacement.apiArguments];
        for (const task of work.apiArgumentTasks) {
          const generated = await generateApiArguments({
            ...task.input,
            model: leasedModel,
            signal,
            trackRequestedInputs: true,
          });
          const index = apiArguments.findIndex(
            (args) => args.callId === generated.callId,
          );
          assert.notEqual(index, -1);
          apiArguments[index] = {
            callId: generated.callId,
            ...selectWorkflowConnectionArgumentValues(generated),
          };
        }
        const replacement = { ...pendingReplacement, apiArguments };
        const inspection = inspectWorkflowConnectionMaterialRepairInputs({
          source,
          request: work.request,
          replacement,
        });
        // Explicit test-host input policy; not a value or approval invented by Core/the model.
        return {
          kind: 'dependent-api-arguments',
          work,
          pendingReplacement,
          replacement: {
            ...replacement,
            deferredApiInputIds: inspection.slots.map((slot) => slot.id),
          },
        };
      },
      observe: ({ phase }) => {
        if (phase === 'replanned' && !observed) {
          observed = true;
          throw observerFailure;
        }
      },
    },
    { checkpointer: new MemorySaver() },
  );
  const config = { configurable: { thread_id: 'dependent-argument-work' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === observerFailure,
  );
  const saved = await graph.getState(config);
  assert.deepEqual(saved.next, ['publishMaterialRecovery']);
  assert.ok(saved.values.pendingMaterialWork);
  assert.equal(saved.values.pendingMaterialReplacement, undefined);
  assert.equal(saved.values.materialRepairs.length, 0);
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 3);
  const state = await graph.invoke(null, config);
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 5);
  assert.equal(state.modelInvocations, 5);
  assert.deepEqual(
    state.materialRepairs[0].workSource.request.request.targets,
    [{ stage: 'api-bindings', nodeId: 'price' }],
  );
  assert.deepEqual(state.materialRepairs[0].request.request.targets, [
    { stage: 'api-bindings', nodeId: 'price' },
    { stage: 'api-arguments', nodeId: 'price' },
  ]);
  assert.equal(Object.hasOwn(state, '__interrupt__'), false);
  const restored = replayWorkflowConnectionMaterialRepair({
    source: fixture.broken,
    receipt: state.materialRepairs[0],
  });
  assert.deepEqual(
    restored.materials.find((material) => material.arguments.callId === 'price')
      .arguments.values,
    {},
  );
  assert.equal(restored.deferredApiInputIds.length, 1);
  const changed = globalThis.structuredClone(state);
  changed.materialRepairs[0].workSource.replacement.apiArguments[0].bindings[0].sourceNodeId =
    'unknown';
  await assert.rejects(graph.invoke(changed, config));
  assert.equal(model.requests.length, 5);
});

test('material result and application survive a failed progress observer without repeating model or originating-stage work', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const observerFailure = new Error('Recovery observer unavailable');
  let failed = false,
    callbacks = 0;
  const { graph, model } = createGraph(
    fixture,
    successfulOutputs(fixture),
    {
      replan: async () => {
        callbacks++;
        return fixture.replacement;
      },
      observe: ({ phase }) => {
        if (phase === 'replanned' && !failed) {
          failed = true;
          throw observerFailure;
        }
      },
    },
    { checkpointer: new MemorySaver() },
  );
  const config = {
    configurable: { thread_id: 'material-observer-checkpoint' },
  };
  await assert.rejects(
    graph.invoke({}, config),
    (error) => error === observerFailure,
  );
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ['publishMaterialRecovery']);
  assert.ok(snapshot.values.pendingMaterialReplacement);
  assert.equal(snapshot.values.materialRepairs.length, 0);
  assert.equal(callbacks, 1);
  const state = await graph.invoke(null, config);
  assert.equal(state.status, 'complete');
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 4);
});

test('global call reservations and originating-stage leases reject extra work before another underlying model invocation', async () => {
  const fixture = initialConnectionRecoveryFixture();
  let callbacks = 0;
  const bounded = createGraph(
    fixture,
    successfulOutputs(fixture),
    {
      modelInvocations: 2,
      replan: async () => {
        callbacks++;
        return fixture.replacement;
      },
    },
    { policy: { ...policy, maxModelInvocations: 3 } },
  );
  await assert.rejects(
    bounded.graph.invoke({}),
    (error) => error instanceof IncrementalConnectionLimitError,
  );
  assert.equal(callbacks, 0);
  assert.equal(bounded.model.requests.length, 2);
  const leased = createGraph(
    fixture,
    [{ goals: fixture.goals }, { decision: fixture.request }, {}],
    {
      modelInvocations: 1,
      replan: async ({ model }) => {
        const runnable = model.withStructuredOutput(z.strictObject({}));
        await runnable.invoke([{}, { content: '{}' }]);
        await runnable.invoke([{}, { content: '{}' }]);
        return fixture.replacement;
      },
    },
  );
  await assert.rejects(
    leased.graph.invoke({}),
    (error) => error instanceof IncrementalConnectionLimitError,
  );
  assert.equal(leased.model.requests.length, 3);
});

test('technical originating-stage failure does not turn into HITL or an unreserved callback retry when the same checkpoint resumes', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const cause = new Error('Original origin-stage failure');
  let callbacks = 0;
  const { graph, model } = createGraph(
    fixture,
    [{ goals: fixture.goals }, { decision: fixture.request }],
    {
      replan: async () => {
        callbacks++;
        throw cause;
      },
    },
    { checkpointer: new MemorySaver() },
  );
  const config = { configurable: { thread_id: 'origin-failure-checkpoint' } };
  await assert.rejects(graph.invoke({}, config), (error) => error === cause);
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ['fail']);
  assert.equal(snapshot.values.materialRepairs.length, 0);
  await assert.rejects(graph.invoke(null, config), (error) => error === cause);
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 2);
});

test('mutating caller-owned recovery options cannot enlarge the reserved lease or replace its dispatcher', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    { decision: fixture.request },
    {},
  ]);
  let callbacks = 0;
  const recovery = {
    modelInvocations: 1,
    replan: async ({ model: leasedModel }) => {
      callbacks++;
      const runnable = leasedModel.withStructuredOutput(z.strictObject({}));
      await runnable.invoke([{}, { content: '{}' }]);
      await runnable.invoke([{}, { content: '{}' }]);
      return fixture.replacement;
    },
    observe: ({ phase }) => {
      if (phase !== 'requested') return;
      recovery.modelInvocations = 2;
      recovery.replan = async () => {
        throw new Error('Caller replaced the dispatcher');
      };
    },
  };
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.broken,
    model,
    policy,
    materialRecovery: recovery,
  });
  await assert.rejects(
    graph.invoke({}),
    (error) => error instanceof IncrementalConnectionLimitError,
  );
  assert.equal(callbacks, 1);
  assert.equal(model.requests.length, 3);
});

test('a changed base source, tampered repair history and malformed or no-progress callback results cannot be adopted', async () => {
  for (const replacement of [{ apiArguments: [], nativeNodes: [] }, null]) {
    const fixture = initialConnectionRecoveryFixture();
    const { graph } = createGraph(
      fixture,
      [{ goals: fixture.goals }, { decision: fixture.request }],
      { replan: async () => replacement },
    );
    await assert.rejects(graph.invoke({}));
    assert.equal(
      fixture.broken.materials.find((item) => item.arguments.callId === 'price')
        .arguments.bindings[0].sourceNodeId,
      'detail',
    );
  }
  const fixture = initialConnectionRecoveryFixture();
  const { graph } = createGraph(fixture, successfulOutputs(fixture), {});
  const state = await graph.invoke({});
  const tampered = globalThis.structuredClone(state);
  tampered.materialRepairs[0].afterSourceFingerprint = 'a'.repeat(64);
  await assert.rejects(graph.invoke(tampered), /differs/);
  fixture.broken.scenario = 'Changed outside the graph';
  await assert.rejects(
    graph.invoke(state),
    /Original material recovery source changed/,
  );
});

test('closed model leases and aborted callbacks cannot issue late requests or adopt a result after cancellation', async () => {
  const fixture = initialConnectionRecoveryFixture();
  let leaseModel;
  const completed = createGraph(fixture, successfulOutputs(fixture), {
    modelInvocations: 1,
    replan: async ({ model }) => {
      leaseModel = model;
      return fixture.replacement;
    },
  });
  assert.equal((await completed.graph.invoke({})).status, 'complete');
  assert.throws(
    () => leaseModel.invoke('unstructured'),
    /requires withStructuredOutput/,
  );
  assert.throws(
    () =>
      leaseModel
        .withStructuredOutput(z.strictObject({}))
        .invoke([{}, { content: '{}' }]),
    /lease is closed/,
  );
  const abort = new globalThis.AbortController();
  const cancelled = createGraph(
    fixture,
    [{ goals: fixture.goals }, { decision: fixture.request }],
    {
      replan: async ({ signal }) => {
        assert.equal(signal.aborted, false);
        abort.abort(new Error('cancel-origin'));
        return fixture.replacement;
      },
    },
  );
  await assert.rejects(
    cancelled.graph.invoke({}, { signal: abort.signal }),
    /cancel-origin/,
  );
  assert.equal(
    fixture.broken.materials.find((item) => item.arguments.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'detail',
  );
});
