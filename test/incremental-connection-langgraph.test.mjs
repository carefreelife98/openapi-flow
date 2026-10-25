import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import {
  extendWorkflowConnectionSession,
  describeWorkflowConnectionStep,
} from '@openapi-flow/core';
import { NativeNodePlanningError } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture as fixture,
  incrementalConnectionPatch as patch,
  incrementalConnectionModelPatch as modelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const policy = {
  maxModelInvocations: 8,
  maxRejectedProposals: 3,
  deadlineMs: 30_000,
};

function queueModel(outputs, inspect = () => {}) {
  const requests = [];
  return {
    requests,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages, config) {
          const index = requests.length;
          const request = {
            schema,
            options,
            context: JSON.parse(messages[1].content),
            config,
          };
          requests.push(request);
          await inspect(request, index);
          if (index >= outputs.length)
            throw new Error('Unexpected additional model invocation');
          if (outputs[index] instanceof Error) throw outputs[index];
          const output =
            typeof outputs[index] === 'function'
              ? outputs[index](request)
              : outputs[index];
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}
function twoBundles(source, plan) {
  return [
    patch({
      addRootNodeIds: ['source'],
      addEdges: plan.edges.filter((edge) => edge.from === 'source'),
    }),
    patch({
      addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  ].map((value) => ({ decision: modelPatch(source, value) }));
}
function dependencies(source, model, extra = {}) {
  return { source: () => source, model, policy, ...extra };
}

function nativeAugmentationFixture() {
  const { source, goals, plan } = fixture();
  source.nativeNodes = [];
  const request = {
    kind: 'request-native-material',
    capability: 'merge-append',
    purpose: 'Wait for the three independent responses before summary',
    factIds: ['intent'],
    reason: 'The confirmed independent reads must be joined before summary.',
  };
  const first = patch({
    addRootNodeIds: ['source'],
    addEdges: plan.edges.filter((edge) => edge.from === 'source'),
  });
  const finish = ({ context }) => {
    const node = context.context.nativeNodes.find(
      (node) => node.capability === request.capability,
    );
    assert.ok(node);
    const native = {
      id: node.id,
      capability: node.capability,
      parameters: node.parameters,
    };
    const expanded = { ...source, nativeNodes: [native] };
    return {
      decision: modelPatch(
        expanded,
        patch({
          addEdges: plan.edges
            .filter((edge) => edge.from !== 'source')
            .map((edge) => ({
              ...edge,
              from: edge.from === 'join' ? node.id : edge.from,
              to: edge.to === 'join' ? node.id : edge.to,
            })),
          addTerminals: [{ nodeId: 'summary', output: 'main' }],
        }),
      ),
    };
  };
  return {
    source,
    goals: goals.filter((goal) => goal.kind !== 'join'),
    plan,
    request,
    first,
    finish,
  };
}

test('automatic native augmentation uses a code-owned role, one settings call and the existing connection session without HITL', async () => {
  const { source, goals, request, first, finish } = nativeAugmentationFixture();
  const before = globalThis.structuredClone(source.materials);
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, first) },
    { decision: request },
    { decision: { status: 'provided', parameters: { numberInputs: 3 } } },
    finish,
  ]);
  const progress = [];
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
      observe: (value) => progress.push(value),
    }),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 5);
  assert.equal(result.materialExtensions.length, 1);
  assert.equal(result.session.revision, 2);
  const added = result.additionalNativeNodes[0];
  assert.match(added.id, /^native-instance:[a-f0-9]{64}$/);
  assert.equal(added.capability, 'merge-append');
  assert.deepEqual(added.parameters, { numberInputs: 3 });
  assert.deepEqual(result.materialExtensions[0].request, request);
  assert.deepEqual(
    result.materialExtensions[0].selection.instances.map(
      (instance) => instance.id,
    ),
    [added.id],
  );
  assert.equal(
    model.requests[3].options.name,
    'generate_native_node_parameters',
  );
  assert.equal(
    model.requests.some(
      (entry) => entry.options.name === 'select_native_node_instances',
    ),
    false,
  );
  assert.equal(
    model.requests.some(
      (entry) => entry.options.name === 'plan_native_instance_dependencies',
    ),
    false,
  );
  assert.ok(
    model.requests.every(
      (entry) => entry.config.signal instanceof globalThis.AbortSignal,
    ),
  );
  assert.ok(progress.some((entry) => entry.nodeIds.length === 5));
  assert.ok(progress.some((entry) => entry.nodeIds.includes(added.id)));
  assert.equal(
    progress.some((entry) => entry.phase === 'needs-user-decision'),
    false,
  );
  assert.deepEqual(source.materials, before);
  assert.deepEqual(source.nativeNodes, []);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.materialExtensions)),
    result.materialExtensions,
  );
});

test('native settings share the same invocation budget and do not reset accepted connection state', async () => {
  const { source, goals, request, first } = nativeAugmentationFixture();
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, first) },
    { decision: request },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
      policy: { ...policy, maxModelInvocations: 3 },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = { configurable: { thread_id: 'native-budget' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) =>
      error instanceof IncrementalConnectionLimitError &&
      error.failure.kind === 'model-invocations',
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.modelInvocations, 3);
  assert.equal(saved.values.session.revision, 1);
  assert.equal(saved.values.session.edges.length, 3);
  assert.deepEqual(saved.values.additionalNativeNodes, []);
  assert.deepEqual(saved.values.materialExtensions, []);
  assert.equal(model.requests.length, 3);
});

test('native transport failure preserves the exact session and does not repeat the failed model call on checkpoint resume', async () => {
  const { source, goals, request, first } = nativeAugmentationFixture();
  const failure = new Error('Native settings transport failed');
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, first) },
    { decision: request },
    failure,
  ]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = { configurable: { thread_id: 'native-transport' } };
  await assert.rejects(
    graph.invoke({}, config),
    /Native settings transport failed/,
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.modelInvocations, 4);
  assert.equal(saved.values.session.revision, 1);
  assert.deepEqual(saved.values.additionalNativeNodes, []);
  await assert.rejects(
    graph.invoke(null, config),
    /Native settings transport failed/,
  );
  assert.equal(model.requests.length, 4);
});

test('an unresolved technical native setting is not fabricated or turned into a per-node human interrupt', async () => {
  const { source, goals, request, first } = nativeAugmentationFixture();
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, first) },
    { decision: request },
    {
      decision: {
        status: 'needs-clarification',
        message: 'The number of join inputs was not derived.',
      },
    },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = { configurable: { thread_id: 'native-unresolved' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.output.status === 'needs-clarification',
  );
  const saved = await graph.getState(config);
  assert.deepEqual(saved.values.additionalNativeNodes, []);
  assert.equal(saved.values.nativeConfiguration.status, 'needs-clarification');
  assert.equal(saved.values.plan, undefined);
  assert.equal(saved.interrupts?.length ?? 0, 0);
  assert.equal(model.requests.length, 4);
});

test('a repeated request for the exact added native role is no progress, not a second newly named copy', async () => {
  const { source, goals, request, first, finish } = nativeAugmentationFixture();
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, first) },
    { decision: request },
    { decision: { status: 'provided', parameters: { numberInputs: 3 } } },
    { decision: request },
    finish,
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
    }),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 6);
  assert.equal(result.additionalNativeNodes.length, 1);
  assert.equal(result.materialExtensions.length, 1);
  assert.equal(result.rejectedProposals.length, 1);
  assert.equal(result.rejectedProposals[0].violations[0].code, 'NO_PROGRESS');
  assert.deepEqual(
    model.requests[5].context.rejectedProposals,
    result.rejectedProposals,
  );
});

test('a zero-literal native implementation consumes no redundant selection, dependency or settings model call', async () => {
  const { source, goals, plan } = fixture();
  const noop = {
    name: 'fixture-no-settings',
    description: 'Pass through with no configurable fields',
    parametersSchema: z.strictObject({}),
    parameterReferenceSources: [],
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    parameterReferenceBindings: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  source.capabilities.push(noop);
  const request = {
    kind: 'request-native-material',
    capability: noop.name,
    purpose: 'Pass through the final summary',
    factIds: ['intent'],
    reason: 'Use the explicitly supplied no-settings implementation.',
  };
  const model = queueModel([
    { goals },
    { decision: request },
    ({ context }) => {
      const added = context.context.nativeNodes.find(
        (node) => node.capability === noop.name,
      );
      assert.ok(added);
      const expanded = {
        ...source,
        nativeNodes: [
          ...source.nativeNodes,
          {
            id: added.id,
            capability: added.capability,
            parameters: added.parameters,
          },
        ],
      };
      return {
        decision: modelPatch(
          expanded,
          patch({
            addRootNodeIds: ['source'],
            addEdges: [
              ...plan.edges,
              { from: 'summary', output: 'main', to: added.id, input: 'main' },
            ],
            addTerminals: [{ nodeId: added.id, output: 'main' }],
          }),
        ),
      };
    },
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      policy: { ...policy, maxModelInvocations: 3 },
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
    }),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 3);
  assert.deepEqual(result.additionalNativeNodes[0].parameters, {});
  assert.equal(model.requests.length, 3);
});

test('native response producer selection is separately budgeted and constrains the following settings call to that original API', async () => {
  const { source, goals, plan } = fixture();
  const request = {
    kind: 'request-native-material',
    capability: 'assert-responses',
    purpose: 'Check the unchanged price response after summary',
    factIds: ['intent'],
    reason:
      'Compare the price response to the explicitly supplied number 12.5.',
  };
  const model = queueModel([
    { goals },
    { decision: request },
    ({ context, options }) => {
      assert.equal(options.name, 'plan_native_instance_dependencies');
      const [instance] = context.instances;
      assert.ok(
        context.sourceCandidatesByNodeId[instance.id].includes('price'),
      );
      return {
        sourcesByNodeId: { [instance.id]: { sourceNodeIds: ['price'] } },
      };
    },
    ({ context, options }) => {
      assert.equal(options.name, 'generate_native_node_parameters');
      assert.deepEqual(
        context.apiMaterials.map((item) => item.callId),
        ['price'],
      );
      return {
        decision: {
          status: 'provided',
          parameters: {
            checks: [
              {
                left: {
                  source: 'response',
                  nodeId: 'price',
                  pointer: '/price',
                },
                operator: 'equals',
                right: { source: 'literal', value: 12.5 },
                message: 'The original price must equal the specified number.',
              },
            ],
          },
        },
      };
    },
    ({ context }) => {
      const node = context.context.nativeNodes.find(
        (node) => node.capability === 'assert-responses',
      );
      const expanded = {
        ...source,
        nativeNodes: [
          ...source.nativeNodes,
          {
            id: node.id,
            capability: node.capability,
            parameters: node.parameters,
          },
        ],
      };
      return {
        decision: modelPatch(
          expanded,
          patch({
            addRootNodeIds: ['source'],
            addEdges: [
              ...plan.edges,
              { from: 'summary', output: 'main', to: node.id, input: 'main' },
            ],
            addTerminals: [{ nodeId: node.id, output: 'main' }],
          }),
        ),
      };
    },
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
    }),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 5);
  assert.equal(result.additionalNativeNodes.length, 1);
  assert.equal(
    result.materialExtensions[0].dependencies.proposal.sourcesByNodeId[
      result.additionalNativeNodes[0].id
    ].sourceNodeIds[0],
    'price',
  );
  assert.ok(
    model.requests.every(
      (entry) => entry.config.signal instanceof globalThis.AbortSignal,
    ),
  );
});

test('cancelling a native settings call prevents the late configuration from entering the session', async () => {
  const { source, goals, request, first } = nativeAugmentationFixture();
  const controller = new globalThis.AbortController();
  const model = queueModel(
    [
      { goals },
      { decision: modelPatch(source, first) },
      { decision: request },
      { decision: { status: 'provided', parameters: { numberInputs: 3 } } },
    ],
    (_request, index) => {
      if (index === 3) controller.abort(new Error('Native run was superseded'));
    },
  );
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      nativeAugmentation: {
        parameterOwnership: { parameterSource: 'literal' },
      },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = {
    configurable: { thread_id: 'native-cancellation' },
    signal: controller.signal,
  };
  await assert.rejects(
    graph.invoke({}, config),
    /Native run was superseded|Abort/,
  );
  const saved = await graph.getState({ configurable: config.configurable });
  assert.equal(saved.values.session.revision, 1);
  assert.deepEqual(saved.values.additionalNativeNodes, []);
  assert.deepEqual(saved.values.materialExtensions, []);
  assert.equal(model.requests.length, 4);
});

test('the host graph applies two coherent bundles automatically and publishes only committed graph projections', async () => {
  const { source, goals, plan } = fixture();
  const before = globalThis.structuredClone(source.materials);
  const model = queueModel([{ goals }, ...twoBundles(source, plan)]);
  const progress = [];
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, { observe: (value) => progress.push(value) }),
  );
  const result = await graph.invoke({});
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.plan.edges, plan.edges);
  assert.equal(result.modelInvocations, 3);
  assert.deepEqual(
    progress.map((value) => value.revision),
    [0, 1, 2, 2],
  );
  assert.deepEqual(
    progress.map((value) => value.phase),
    ['planning', 'planning', 'planning', 'complete'],
  );
  assert.deepEqual(progress[0].rootNodeIds, []);
  assert.equal(progress[1].edges.length, 3);
  assert.equal(progress[2].ready, true);
  assert.equal(model.requests.length, 3);
  assert.equal(model.requests[2].context.context.edges.length, 3);
  assert.deepEqual(source.materials, before);
  for (const value of progress) {
    assert.equal(Object.hasOwn(value, 'context'), false);
    assert.equal(Object.hasOwn(value, 'requirements'), false);
    assert.equal(Object.hasOwn(value, 'materials'), false);
    assert.equal(Object.hasOwn(value, 'arguments'), false);
    assert.deepEqual(value.nodeIds, [
      'source',
      'detail',
      'price',
      'stock',
      'summary',
      'join',
    ]);
  }
  assert.equal(Object.hasOwn(result, 'source'), false);
  assert.equal(Object.hasOwn(result, 'model'), false);
  assert.equal(Object.hasOwn(result, 'observe'), false);
  const topology = await graph.getGraphAsync();
  assert.ok(
    topology.edges.some(
      (edge) =>
        edge.source === 'publishProgress' && edge.target === 'reserveModelCall',
    ),
  );
  assert.equal(
    Object.keys(topology.nodes).some((id) => /interrupt|review/.test(id)),
    false,
  );
});

test('a graph-invalid bundle is rejected atomically and its exact structured feedback drives the next automatic proposal', async () => {
  const { source, goals, plan } = fixture();
  const cycle = patch({
    addEdges: [
      { from: 'detail', output: 'main', to: 'price', input: 'main' },
      { from: 'price', output: 'main', to: 'detail', input: 'main' },
    ],
  });
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, cycle) },
    ...twoBundles(source, plan),
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.rejectedProposals.length, 1);
  assert.deepEqual(result.rejectedProposals[0].proposal, cycle);
  assert.equal(result.rejectedProposals[0].violations[0].code, 'CYCLE');
  assert.deepEqual(model.requests[2].context.context.edges, []);
  assert.deepEqual(
    model.requests[2].context.rejectedProposals,
    result.rejectedProposals,
  );
  assert.equal(result.modelInvocations, 4);
});

test('the invocation budget stops before another call and the checkpointer keeps the last accepted bundle', async () => {
  const { source, goals, plan } = fixture();
  const model = queueModel([{ goals }, ...twoBundles(source, plan)]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      policy: { ...policy, maxModelInvocations: 2 },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = { configurable: { thread_id: 'invocation-budget' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) =>
      error instanceof IncrementalConnectionLimitError &&
      error.failure.kind === 'model-invocations',
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.session.revision, 1);
  assert.equal(saved.values.modelInvocations, 2);
  assert.equal(saved.values.plan, undefined);
  assert.equal(model.requests.length, 2);
});

test('a zero rejection budget preserves the rejected proposal and does not ask a person to fix the graph', async () => {
  const { source, goals } = fixture();
  const model = queueModel([
    { goals },
    { decision: modelPatch(source, patch({})) },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      policy: { ...policy, maxRejectedProposals: 0 },
      checkpointer: new MemorySaver(),
    }),
  );
  const config = { configurable: { thread_id: 'rejection-budget' } };
  await assert.rejects(
    graph.invoke({}, config),
    (error) =>
      error instanceof IncrementalConnectionLimitError &&
      error.failure.kind === 'rejected-proposals',
  );
  const saved = await graph.getState(config);
  assert.equal(
    saved.values.rejectedProposals[0].violations[0].code,
    'NO_PROGRESS',
  );
  assert.equal(saved.values.session.revision, 0);
  assert.equal(saved.values.status, 'planning');
  assert.equal(model.requests.length, 2);
});

test('a model transport failure is not silently retried or converted into missing business information', async () => {
  const { source, goals } = fixture();
  const failure = new Error('Explicit model transport failure');
  const model = queueModel([{ goals }, failure]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, { checkpointer: new MemorySaver() }),
  );
  const config = { configurable: { thread_id: 'transport' } };
  await assert.rejects(
    graph.invoke({}, config),
    /Explicit model transport failure/,
  );
  const saved = await graph.getState(config);
  assert.equal(saved.values.modelInvocations, 2);
  assert.equal(saved.values.session.revision, 0);
  assert.deepEqual(saved.values.rejectedProposals, []);
  assert.equal(model.requests.length, 2);
  assert.ok(saved.values.failureId);
  await assert.rejects(
    graph.invoke(null, config),
    /Explicit model transport failure/,
  );
  assert.equal(model.requests.length, 2);
});

test('native material requests return to a parent without HITL; the parent can extend the exact session and continue without interpreting goals again', async () => {
  const { source, goals, plan } = fixture();
  const additionalNativeNodes = source.nativeNodes;
  source.nativeNodes = [];
  const reducedGoals = goals.filter((goal) => goal.kind !== 'join');
  const first = patch({
    addRootNodeIds: ['source'],
    addEdges: plan.edges.filter((edge) => edge.from === 'source'),
  });
  const material = {
    kind: 'request-native-material',
    capability: additionalNativeNodes[0].capability,
    purpose: 'Wait for every independent response',
    factIds: ['intent'],
    reason: 'The agreed scenario requires an all-input join.',
  };
  const model = queueModel([
    { goals: reducedGoals },
    { decision: modelPatch(source, patch({})) },
    { decision: modelPatch(source, first) },
    { decision: material },
    twoBundles({ ...source, nativeNodes: additionalNativeNodes }, plan)[1],
  ]);
  let currentSource = source;
  const graph = createIncrementalWorkflowConnectionGraph({
    ...dependencies(source, model),
    source: () => currentSource,
  });
  const pending = await graph.invoke({});
  assert.equal(pending.status, 'needs-native-material');
  assert.deepEqual(pending.pending.decision, material);
  assert.equal(pending.session.revision, 1);
  assert.equal(pending.plan, undefined);
  assert.equal(pending.__interrupt__, undefined);
  const extension = extendWorkflowConnectionSession({
    ...source,
    session: pending.session,
    expected: describeWorkflowConnectionStep({
      ...source,
      session: pending.session,
    }).expected,
    additionalNativeNodes,
  });
  currentSource = { ...source, nativeNodes: additionalNativeNodes };
  const result = await graph.invoke({ ...pending, session: extension.session });
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 5);
  assert.equal(model.requests.length, 5);
  assert.equal(result.rejectedProposals.length, 1);
  assert.deepEqual(model.requests[4].context.rejectedProposals, []);
  assert.deepEqual(result.plan.edges, plan.edges);
  assert.deepEqual(result.session.history[0], pending.session.history[0]);
});

test('a true business decision is distinct from technical failure and never claims a complete workflow', async () => {
  const { source, goals } = fixture();
  const decision = {
    kind: 'require-user-decision',
    question:
      'Should the workflow stop or notify an operator when the business code is nonzero?',
    factIds: ['intent'],
    reason: 'These business outcomes differ.',
  };
  const model = queueModel([{ goals }, { decision }]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model),
  ).invoke({});
  assert.equal(result.status, 'needs-user-decision');
  assert.deepEqual(result.pending.decision, decision);
  assert.equal(result.plan, undefined);
  assert.equal(model.requests.length, 2);
});

test('the host policy, not LangGraph default recursion depth, controls a long explicit replanning budget', async () => {
  const { source, goals, plan } = fixture();
  const full = patch({
    addRootNodeIds: ['source'],
    addEdges: plan.edges,
    addTerminals: [{ nodeId: 'summary', output: 'main' }],
  });
  const model = queueModel([
    { goals },
    ...Array.from({ length: 26 }, () => ({
      decision: modelPatch(source, patch({})),
    })),
    { decision: modelPatch(source, full) },
  ]);
  const result = await createIncrementalWorkflowConnectionGraph(
    dependencies(source, model, {
      policy: { ...policy, maxModelInvocations: 28, maxRejectedProposals: 26 },
    }),
  ).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(result.modelInvocations, 28);
  assert.equal(result.rejectedProposals.length, 26);
});

test('an expired checkpoint deadline fails before another model call', async () => {
  const { source, goals } = fixture();
  const model = queueModel([
    { goals },
    {
      decision: {
        kind: 'require-user-decision',
        question: 'Choose an outcome',
        factIds: ['intent'],
        reason: 'Different intended outcomes',
      },
    },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model),
  );
  const previous = await graph.invoke({});
  await assert.rejects(
    graph.invoke({
      ...previous,
      startedAt: Date.now() - policy.deadlineMs - 1,
    }),
    (error) =>
      error instanceof IncrementalConnectionLimitError &&
      error.failure.kind === 'deadline',
  );
  assert.equal(model.requests.length, 2);
});

test('an explicit abort is passed to the model and a late result cannot be applied', async () => {
  const { source, goals, plan } = fixture();
  const controller = new globalThis.AbortController();
  const model = queueModel(
    [{ goals }, ...twoBundles(source, plan)],
    (request, index) => {
      assert.ok(request.config.signal instanceof globalThis.AbortSignal);
      if (index === 1)
        controller.abort(new Error('User superseded this request'));
    },
  );
  const graph = createIncrementalWorkflowConnectionGraph(
    dependencies(source, model),
  );
  await assert.rejects(
    graph.invoke({}, { signal: controller.signal }),
    /User superseded|Abort/,
  );
  assert.equal(model.requests.length, 2);
});

test('required host policy values have no implicit defaults', () => {
  const { source } = fixture();
  const model = queueModel([]);
  for (const invalid of [
    undefined,
    {},
    { ...policy, maxModelInvocations: 0 },
    { ...policy, deadlineMs: undefined },
  ])
    assert.throws(() =>
      createIncrementalWorkflowConnectionGraph(
        dependencies(source, model, { policy: invalid }),
      ),
    );
  assert.equal(model.requests.length, 0);
});
