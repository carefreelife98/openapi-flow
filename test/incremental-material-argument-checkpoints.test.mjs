import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver } from '@langchain/langgraph';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
  resolveIncrementalConnectionSource,
} from '@openapi-flow/example-langgraph-workflow';
import {
  inspectWorkflowConnectionMaterialRepairInputs,
  selectWorkflowConnectionArgumentValues,
  replayWorkflowConnectionMaterialRepair,
} from '@openapi-flow/core';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';
import { acceptedConnectionRecoveryFixture } from './fixtures/accepted-connection-recovery-fixture.mjs';

function argumentFixture() {
  const fixture = initialConnectionRecoveryFixture();
  for (const callId of ['price', 'stock']) {
    const original = fixture.source.materials.find(
      (item) => item.arguments.callId === callId,
    ).arguments;
    const args = {
      callId,
      ...selectWorkflowConnectionArgumentValues(original),
    };
    args.bindings = args.bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
    const index = fixture.replacement.apiArguments.findIndex(
      (item) => item.callId === callId,
    );
    if (index === -1) fixture.replacement.apiArguments.push(args);
    else fixture.replacement.apiArguments[index] = args;
  }
  fixture.request.targets.push({ stage: 'api-bindings', nodeId: 'stock' });
  return fixture;
}

function createGraph(fixture, options = {}) {
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
  const argumentModel =
    options.model ??
    recoveryQueueModel([
      { literalInputs: { state: 'not-provided' }, requestedInputs: [] },
      { literalInputs: { state: 'not-provided' }, requestedInputs: [] },
    ]);
  let callbacks = 0;
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.broken,
    model,
    checkpointer: new MemorySaver(),
    policy: {
      maxModelInvocations: 6,
      maxRejectedProposals: 3,
      deadlineMs: 30000,
      ...options.policy,
    },
    materialRecovery: {
      modelInvocations: 0,
      replan: async ({ source, request }) => {
        callbacks++;
        const inspection = inspectWorkflowConnectionMaterialRepairInputs({
          source,
          request,
          replacement: fixture.replacement,
        });
        return {
          ...fixture.replacement,
          deferredApiInputIds: inspection.slots.map((slot) => slot.id),
        };
      },
      argumentPlanning: {
        model: argumentModel,
        observe: options.observe,
        selectDeferredApiInputIds: options.selectDeferredApiInputIds,
      },
    },
  });
  return { graph, model, argumentModel, callbacks: () => callbacks };
}

test('OAS-derived API tasks are separately checkpointed and an observer failure resumes without repeating the originating planner or completed API', async () => {
  const fixture = argumentFixture();
  const failure = new Error('Pause after the first saved API result');
  const progress = [];
  let failOnce = true;
  const run = createGraph(fixture, {
    observe: (event) => {
      progress.push(event);
      if (failOnce) {
        failOnce = false;
        throw failure;
      }
    },
  });
  const config = { configurable: { thread_id: 'per-api-material-observe' } };
  await assert.rejects(
    run.graph.invoke({}, config),
    (error) => error === failure,
  );
  const checkpoint = await run.graph.getState(config);
  assert.equal(
    checkpoint.values.pendingMaterialArgumentWork.completedArguments.length,
    1,
  );
  assert.equal(
    checkpoint.values.materialRepairs.length,
    0,
    'Candidates are not adopted while later API values are missing',
  );
  assert.equal(run.argumentModel.requests.length, 1);
  assert.equal(run.callbacks(), 1);
  assert.deepEqual(checkpoint.next, ['publishMaterialArguments']);
  const result = await run.graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 6);
  assert.equal(run.argumentModel.requests.length, 2);
  assert.equal(run.callbacks(), 1);
  assert.equal(result.pendingMaterialArgumentWork, undefined);
  assert.deepEqual(
    progress.map((item) => item.callId),
    ['price', 'price', 'stock'],
  );
  assert.deepEqual(
    Object.keys(progress[0]).sort(),
    ['callId', 'completed', 'total', 'modelInvocations'].sort(),
  );
  const restored = replayWorkflowConnectionMaterialRepair({
    source: fixture.broken,
    receipt: result.materialRepairs[0],
  });
  for (const callId of ['price', 'stock']) {
    const args = restored.materials.find(
      (item) => item.arguments.callId === callId,
    ).arguments;
    assert.deepEqual(args.values, {});
    assert.ok(
      !args.bindings.some((binding) => binding.targetPointer === '/query/id'),
    );
  }
});

test('a later API transport failure preserves earlier API output and does not replay it or the callback automatically', async () => {
  const failure = new Error('Second API transport failed');
  const argumentModel = recoveryQueueModel([
    { literalInputs: { state: 'not-provided' }, requestedInputs: [] },
    failure,
  ]);
  const run = createGraph(argumentFixture(), { model: argumentModel });
  const config = { configurable: { thread_id: 'per-api-material-transport' } };
  await assert.rejects(
    run.graph.invoke({}, config),
    (error) => error.cause === failure || error === failure,
  );
  const checkpoint = await run.graph.getState(config);
  assert.equal(
    checkpoint.values.pendingMaterialArgumentWork.completedArguments.length,
    1,
  );
  assert.equal(
    checkpoint.values.pendingMaterialArgumentWork.completedArguments[0].callId,
    'price',
  );
  assert.equal(checkpoint.values.modelInvocations, 4);
  await assert.rejects(run.graph.invoke(null, config));
  assert.equal(argumentModel.requests.length, 2);
  assert.equal(run.callbacks(), 1);
});

test('each API task reserves the shared run budget before invoking the model', async () => {
  const run = createGraph(argumentFixture(), {
    policy: { maxModelInvocations: 3 },
  });
  const config = { configurable: { thread_id: 'per-api-material-budget' } };
  await assert.rejects(
    run.graph.invoke({}, config),
    IncrementalConnectionLimitError,
  );
  const checkpoint = await run.graph.getState(config);
  assert.equal(
    checkpoint.values.pendingMaterialArgumentWork.completedArguments.length,
    1,
  );
  assert.equal(checkpoint.values.modelInvocations, 3);
  assert.equal(run.argumentModel.requests.length, 1);
  assert.equal(run.callbacks(), 1);
});

test('changed source, task order or completed-task bindings are rejected before another model call', async () => {
  for (const mutation of ['source', 'order', 'binding']) {
    const fixture = argumentFixture();
    let once = true;
    const run = createGraph(fixture, {
      observe: () => {
        if (once) {
          once = false;
          throw new Error('Checkpoint boundary');
        }
      },
    });
    const config = {
      configurable: { thread_id: `per-api-material-${mutation}` },
    };
    await assert.rejects(run.graph.invoke({}, config));
    const checkpoint = await run.graph.getState(config);
    if (mutation === 'source') fixture.broken.scenario += ' changed';
    else {
      const pending = globalThis.structuredClone(
        checkpoint.values.pendingMaterialArgumentWork,
      );
      if (mutation === 'order') pending.work.apiArgumentTasks.reverse();
      else pending.completedArguments[0].bindings = [];
      await run.graph.updateState(config, {
        pendingMaterialArgumentWork: pending,
      });
    }
    await assert.rejects(run.graph.invoke(null, config));
    assert.equal(run.argumentModel.requests.length, 1);
    assert.equal(run.callbacks(), 1);
  }
});

test('fully bound replacements create no dependent-value model task', async () => {
  const fixture = initialConnectionRecoveryFixture();
  const run = createGraph(fixture);
  const result = await run.graph.invoke(
    {},
    { configurable: { thread_id: 'fully-bound-material-no-work' } },
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 4);
  assert.equal(run.argumentModel.requests.length, 0);
  assert.equal(run.callbacks(), 1);
});

test('provided typed literals keep their exact user source and the host evaluates deferred inputs against actual generated results', async () => {
  const fixture = argumentFixture();
  fixture.broken.scenario +=
    ' price identifier "0007"; stock identifier "0008".';
  const model = recoveryQueueModel(
    ['0007', '0008'].map((value) => ({
      literalInputs: {
        state: 'provided',
        values: { query: { id: value } },
        literalSources: [
          {
            targetPointer: '/query/id',
            sourceFormat: 'json',
            sourceText: JSON.stringify(value),
          },
        ],
      },
      requestedInputs: ['/query/id'],
    })),
  );
  let policies = 0;
  const run = createGraph(fixture, {
    model,
    selectDeferredApiInputIds: (inspection, proposed) => {
      policies++;
      assert.deepEqual(inspection.slots, []);
      assert.equal(
        proposed.length,
        2,
        'Earlier approvals are presented explicitly, not silently removed',
      );
      return [];
    },
  });
  const result = await run.graph.invoke(
    {},
    { configurable: { thread_id: 'provided-material-arguments' } },
  );
  const source = replayWorkflowConnectionMaterialRepair({
    source: fixture.broken,
    receipt: result.materialRepairs[0],
  });
  assert.equal(policies, 1);
  assert.equal(
    source.materials.find((item) => item.arguments.callId === 'price').arguments
      .values.query.id,
    '0007',
  );
  assert.equal(
    source.materials.find((item) => item.arguments.callId === 'stock').arguments
      .values.query.id,
    '0008',
  );
  assert.deepEqual(source.deferredApiInputIds, []);
});

test('accepted-plan repair keeps the old graph while its API value is saved and adopts the repaired candidate only after remaining checks', async () => {
  const fixture = acceptedConnectionRecoveryFixture();
  fixture.replacement.apiArguments[0].bindings =
    fixture.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const model = recoveryQueueModel([
    { goals: fixture.acceptedGoals },
    fixture.firstPatch,
    fixture.completion,
    { decision: fixture.request },
    fixture.correctedRevision,
  ]);
  const argumentModel = recoveryQueueModel([
    { literalInputs: { state: 'not-provided' }, requestedInputs: [] },
  ]);
  let once = true;
  const input = {
    source: () => fixture.broken,
    model,
    checkpointer: new MemorySaver(),
    policy: {
      maxModelInvocations: 7,
      maxRejectedProposals: 3,
      deadlineMs: 30000,
    },
    revisionPlanning: { model },
    materialRecovery: {
      modelInvocations: 0,
      replan: async () => fixture.replacement,
      argumentPlanning: {
        model: argumentModel,
        selectDeferredApiInputIds: (inspection) =>
          inspection.slots.map((slot) => slot.id),
        observe: () => {
          if (once) {
            once = false;
            throw new Error('Candidate API saved');
          }
        },
      },
    },
  };
  const graph = createIncrementalWorkflowConnectionGraph(input);
  const config = {
    configurable: { thread_id: 'accepted-material-argument-checkpoint' },
  };
  await assert.rejects(graph.invoke({}, config), /Candidate API saved/);
  const checkpoint = await graph.getState(config);
  assert.deepEqual(checkpoint.values.session.edges, fixture.firstEdges);
  assert.deepEqual(checkpoint.values.sourceEvents, []);
  assert.equal(
    resolveIncrementalConnectionSource(input, checkpoint.values).materials.find(
      (item) => item.arguments.callId === 'price',
    ).arguments.bindings[0].sourceNodeId,
    'detail',
  );
  const result = await graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(result.sourceEvents.length, 1);
  assert.equal(result.sourceEvents[0].kind, 'accepted-revision');
  assert.ok(result.sourceEvents[0].repairs[0].workSource);
  assert.equal(argumentModel.requests.length, 1);
});

test('a failing explicit final input policy resumes from saved API results without replaying model calls', async () => {
  let once = true;
  const run = createGraph(argumentFixture(), {
    selectDeferredApiInputIds: (inspection) => {
      if (once) {
        once = false;
        throw new Error('Final input policy unavailable');
      }
      return inspection.slots.map((slot) => slot.id);
    },
  });
  const config = {
    configurable: { thread_id: 'material-final-policy-resume' },
  };
  await assert.rejects(
    run.graph.invoke({}, config),
    /Final input policy unavailable/,
  );
  const checkpoint = await run.graph.getState(config);
  assert.deepEqual(checkpoint.next, ['finishMaterialArguments']);
  assert.equal(
    checkpoint.values.pendingMaterialArgumentWork.completedArguments.length,
    2,
  );
  assert.equal(checkpoint.values.materialRepairs.length, 0);
  const result = await run.graph.invoke(null, config);
  assert.equal(result.status, 'complete');
  assert.equal(run.argumentModel.requests.length, 2);
  assert.equal(run.callbacks(), 1);
});
