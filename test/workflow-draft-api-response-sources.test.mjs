import assert from 'node:assert/strict';
import test from 'node:test';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  stageWorkflowDraftEdit,
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
  createWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
} from '@openapi-flow/core';
import {
  generateWorkflowDraftApiCallArguments,
  generateWorkflowDraftNativeNodeAddition,
} from '@openapi-flow/langchain';
import {
  apiCallBindingPlan,
  apiCallArgumentsProposal,
  apiCallPlanningModel,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
import {
  apiResponseSourcesFixture,
  responseSourceBranches,
  responseSourceScenario,
  responseSourcesModel,
} from './fixtures/workflow-draft-api-response-sources-fixture.mjs';
import { nativeMaterialRevisionFixture } from './fixtures/native-material-revision-fixture.mjs';

test('all five selected original OAS responses exist before requests, regardless of planning order', async () => {
  const input = await apiResponseSourcesFixture({ withNative: false });
  const original = globalThis.structuredClone(input.draft);
  const stage = stageWorkflowDraftEdit(input);
  assert.equal(stage.apiResponseSources.length, 5);
  assert.deepEqual(stage.content.apiCalls, []);
  for (const source of stage.apiResponseSources) {
    assert.equal(source.preparation.status, 'request-pending');
    assert.equal(Object.hasOwn(source.preparation, 'request'), false);
    assert.equal(stage.blockedSourceNodeIds.includes(source.nodeId), true);
    assert.deepEqual(
      source.operation,
      input.context.operations.find(
        (item) => item.path === source.operation.path,
      ),
    );
  }
  const target = { ...input, stepId: input.plan.steps[0].id };
  const description = describeWorkflowDraftApiCallPlanning(target);
  const root = description.sources.values.find(
    (item) => item.operation.path === '/seed/{seedId}',
  );
  assert.equal(root.nodeId, input.plan.steps.at(-1).newNodeId);
  assert.equal(root.preparation.status, 'request-pending');
  assert.equal(description.sources.values.length, 4);
  assert.deepEqual(input.draft, original);
});

test('consumers plan before their producer without a literal model call; full assembly still requires real requests and explicit ancestors', async () => {
  const input = await apiResponseSourcesFixture({ withNative: false });
  const rootId = input.plan.steps.at(-1).newNodeId;
  const resolutions = [];
  for (const [index, branch] of responseSourceBranches.entries()) {
    const current = {
      ...input,
      resolutions,
      stepId: input.plan.steps[index].id,
    };
    const bindings = [
      {
        targetPointer: branch.targetPointer,
        sourceNodeId: rootId,
        sourcePointer: branch.sourcePointer,
      },
    ];
    const bindingPlan = apiCallBindingPlan(current, bindings);
    const model = apiCallPlanningModel([]);
    const result = await generateWorkflowDraftApiCallArguments({
      ...current,
      bindingPlan,
      model,
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.resolution.values, {});
    assert.deepEqual(result.resolution.bindings, [
      { kind: 'node-output', ...bindings[0] },
    ]);
    assert.equal(model.requests.length, 0);
    resolutions.push(result.resolution);
  }
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, resolutions }),
    /Missing draft edit resolution/,
  );
  const root = { ...input, stepId: input.plan.steps.at(-1).id, resolutions };
  const model = apiCallPlanningModel([
    apiCallArgumentsProposal(root, { path: { seedId: 'seed' } }),
  ]);
  const bindingPlan = apiCallBindingPlan(root, []);
  const result = await generateWorkflowDraftApiCallArguments({
    ...root,
    bindingPlan,
    model,
  });
  assert.equal(model.requests.length, 1);
  resolutions.push(result.resolution);
  const connections = input.plan.steps.slice(0, -1).map((step) => ({
    stepIds: [step.id],
    kind: 'add-edge',
    edge: { from: rootId, output: 'main', to: step.newNodeId, input: 'main' },
  }));
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, resolutions }),
    /not available on every incoming route/,
  );
  const assembled = assembleWorkflowDraftEdit({
    ...input,
    resolutions,
    connections,
  });
  assert.equal(assembled.draft.apiCalls.length, 5);
  assert.equal(assembled.draft.edges.length, 4);
  assert.deepEqual(
    assembled.draft.apiCalls.find((call) => call.id === rootId).values,
    { path: { seedId: 'seed' } },
  );
  assert.deepEqual(input.draft.apiCalls, []);
});

test('a native IF selected before any API uses real selected response types, not a dummy request or prior material', async () => {
  const input = await apiResponseSourcesFixture();
  const model = responseSourcesModel();
  const result = await generateWorkflowDraftNativeNodeAddition({
    ...input,
    stepId: input.plan.steps[0].id,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.equal(
    result.resolution.parameters.conditions[0].left.nodeId,
    input.plan.steps.at(-1).newNodeId,
  );
  assert.equal(model.calls.length, 1);
  for (const source of model.calls[0].payload.sourceCandidates.filter(
    (item) => item.kind === 'api',
  )) {
    assert.equal(source.preparation.status, 'request-pending');
    assert.equal(Object.hasOwn(source.preparation, 'request'), false);
  }
  const stage = stageWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(stage.content.apiCalls, []);
  assert.equal(stage.content.nativeNodes.length, 1);
});

test('declared source availability never permits self references, missing pointers or incompatible types', async () => {
  const input = await apiResponseSourcesFixture({ withNative: false });
  const current = { ...input, stepId: input.plan.steps[0].id };
  const description = describeWorkflowDraftApiCallPlanning(current);
  const rootId = input.plan.steps.at(-1).newNodeId;
  for (const mapping of [
    {
      targetPointer: '/path/personId',
      sourceNodeId: description.nodeId,
      sourcePointer: '/name',
    },
    {
      targetPointer: '/path/personId',
      sourceNodeId: rootId,
      sourcePointer: '/not-declared',
    },
    {
      targetPointer: '/path/personId',
      sourceNodeId: rootId,
      sourcePointer: '/enabled',
    },
  ])
    assert.throws(() => apiCallBindingPlan(current, [mapping]));
  assert.throws(() =>
    resolveWorkflowDraftApiCallBindings({
      ...current,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          mappings: [],
          sourceMessageIds: ['unknown'],
        },
      },
    }),
  );
});

test('unconfirmed workflow requirements still block selected sources; stale original OAS snapshots are not reused', async () => {
  const input = await apiResponseSourcesFixture({ withNative: false });
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        ...input.decisions,
        {
          kind: 'needs-clarification',
          owner: { kind: 'semantic', scope: { kind: 'workflow' } },
          instruction: 'Confirm which source is intended.',
          sources: input.decisions[0].sources,
        },
      ],
    },
  });
  assert.throws(
    () =>
      describeWorkflowDraftApiCallPlanning({
        ...input,
        plan,
        stepId: plan.steps[0].id,
      }),
    /unresolved requirement/,
  );
  const stale = {
    ...input,
    context: {
      ...input.context,
      operations: input.context.operations.filter(
        (operation) => operation.path !== '/seed/{seedId}',
      ),
    },
  };
  assert.throws(
    () => stageWorkflowDraftEdit(stale),
    /context|contract|snapshot|operation/i,
  );
  assert.equal(input.draft.revision, 0);
});

test('pending API replacement discovers dependent native repairs from the new response contract before request planning', async () => {
  const input = await nativeMaterialRevisionFixture();
  const pending = stageWorkflowDraftEdit({ ...input, resolutions: [] });
  const planned = stageWorkflowDraftEdit(input);
  const selected = pending.apiResponseSources.find(
    (source) => source.nodeId === 'source',
  );
  assert.deepEqual(selected.operation.key, input.replacement.key);
  assert.equal(selected.preparation.status, 'request-pending');
  assert.notDeepEqual(selected.operation.key, input.before.key);
  const task = pending.pendingRepairs.find(
    (item) => item.nodeId === 'api-items',
  );
  assert.ok(task);
  assert.deepEqual(task.sourceNodeIds, ['source']);
  assert.deepEqual(
    task,
    planned.pendingRepairs.find((item) => item.nodeId === 'api-items'),
  );
  assert.deepEqual(input.draft.apiCalls[0].operation, input.before.key);
});

test('knowing all selected response contracts does not authorize a cyclic execution graph', async () => {
  const input = await apiResponseSourcesFixture({ withNative: false });
  const rootId = input.plan.steps.at(-1).newNodeId;
  const resolutions = [];
  for (const [index, branch] of responseSourceBranches.entries()) {
    const current = {
      ...input,
      resolutions,
      stepId: input.plan.steps[index].id,
    };
    const bindingPlan = apiCallBindingPlan(current, [
      {
        targetPointer: branch.targetPointer,
        sourceNodeId: rootId,
        sourcePointer: branch.sourcePointer,
      },
    ]);
    const result = await generateWorkflowDraftApiCallArguments({
      ...current,
      bindingPlan,
      model: apiCallPlanningModel([]),
    });
    resolutions.push(result.resolution);
  }
  const root = { ...input, resolutions, stepId: input.plan.steps.at(-1).id };
  const bindingPlan = apiCallBindingPlan(root, [
    {
      targetPointer: '/path/seedId',
      sourceNodeId: input.plan.steps[0].newNodeId,
      sourcePointer: '/name',
    },
  ]);
  const result = await generateWorkflowDraftApiCallArguments({
    ...root,
    bindingPlan,
    model: apiCallPlanningModel([]),
  });
  resolutions.push(result.resolution);
  const connections = [
    ...input.plan.steps.slice(0, -1).map((step) => ({
      stepIds: [step.id],
      kind: 'add-edge',
      edge: {
        from: rootId,
        output: 'main',
        to: step.newNodeId,
        input: 'main',
      },
    })),
    {
      stepIds: [input.plan.steps.at(-1).id],
      kind: 'add-edge',
      edge: {
        from: input.plan.steps[0].newNodeId,
        output: 'main',
        to: rootId,
        input: 'main',
      },
    },
  ];
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, resolutions, connections }),
    /cycle|cyclic/i,
  );
  assert.deepEqual(input.draft.apiCalls, []);
});

test('the actual MemorySaver host plans five new APIs and native fan-out/join even when the producer is selected last', async () => {
  const input = await apiResponseSourcesFixture();
  const model = responseSourcesModel();
  const graph = createWorkflowDraftConversationGraph({
    context: { ...input.context, messages: [] },
    model,
    checkpointer: new MemorySaver(),
    name: 'All selected API contracts',
    reviewPolicy: 'review',
    includeExplanations: false,
    deployments: [
      ...new Set(
        input.context.operations.map((operation) => operation.key.documentId),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://contract.example.test',
    })),
  });
  const config = {
    configurable: { thread_id: 'all-selected-five-apis' },
    recursionLimit: 200,
  };
  const selection = await graph.invoke(
    {
      input: {
        initialDraft: input.draft,
        request: {
          id: 'request-1',
          text: responseSourceScenario,
          expectedRevision: 0,
        },
      },
    },
    config,
  );
  assert.equal(selection.__interrupt__[0].value.phase, 'selection');
  const candidate = await graph.invoke(
    new Command({
      resume: {
        action: 'approve',
        token: selection.__interrupt__[0].value.token,
      },
    }),
    config,
  );
  assert.equal(candidate.__interrupt__[0].value.phase, 'candidate');
  assert.deepEqual(candidate.draft.apiCalls, []);
  const result = await graph.invoke(
    new Command({
      resume: {
        action: 'approve',
        token: candidate.__interrupt__[0].value.token,
      },
    }),
    config,
  );
  assert.equal(result.phase, 'complete');
  assert.equal(result.draft.apiCalls.length, 5);
  assert.equal(result.draft.nativeNodes.length, 3);
  assert.equal(result.draft.edges.length, 10);
  assert.equal(result.artifact.triggerConnected, true);
  assert.equal(result.artifact.revision, result.draft.revision);
  assert.equal(model.calls.length, 10);
  assert.equal(
    model.calls.filter(
      (call) => call.options.name === 'generate_draft_api_call_arguments',
    ).length,
    1,
  );
  const consumerCalls = model.calls.filter(
    (call) =>
      call.options.name === 'plan_draft_api_call_bindings' &&
      call.payload.operation.path !== '/seed/{seedId}',
  );
  assert.equal(consumerCalls.length, 4);
  for (const call of consumerCalls)
    assert.equal(
      call.payload.sourceCandidates.find(
        (source) =>
          source.kind === 'api' && source.operation.path === '/seed/{seedId}',
      ).preparation.status,
      'request-pending',
    );
  assert.equal(
    result.draft.apiCalls.at(-1).operation.operationRef.includes('seed'),
    true,
  );
  assert.deepEqual(input.draft.apiCalls, []);
});
