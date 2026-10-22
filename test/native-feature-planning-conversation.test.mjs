import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from '@langchain/langgraph';
import {
  N8nNativeFeature,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  nativeFeaturePlanningFixture,
  nativeFeaturePlanningModel,
} from './fixtures/native-feature-planning-fixture.mjs';
import { conversationSemantic } from './fixtures/workflow-draft-conversation-fixture.mjs';

const turn = (draft) => ({
  input: {
    initialDraft: draft,
    request: {
      id: 'edit-1',
      expectedRevision: 0,
      text: 'Use rows [3,1] and marker "={{ literal text }}" as explicit input. Split unchanged rows and retain an independent pass-through root.',
    },
  },
});

test('opt-in omitted features exposes every registered family and keeps missing producer contracts visible', async () => {
  const f = await nativeFeaturePlanningFixture({
    respond: (call) => {
      assert.equal(call.payload.capabilities.length, 11);
      return { decisions: [conversationSemantic(call, { kind: 'no-change' })] };
    },
  });
  const result = await f.graph.invoke(turn(f.draft), f.config);
  assert.equal(result.phase, 'no-workflow');
  assert.equal(result.outcome.kind, 'no-workflow');
  assert.equal(result.outcome.changeStatus, 'no-change');
  assert.equal(result.artifact, undefined);
  assert.equal(result.nativeFeatures.length, 12);
  assert.equal(
    result.nativeFeatures.filter((entry) => entry.planningAvailable).length,
    11,
  );
  assert.deepEqual(
    result.nativeFeatures.find(
      (entry) => entry.feature === N8nNativeFeature.JsonOutput,
    ),
    {
      feature: N8nNativeFeature.JsonOutput,
      status: 'requires-context',
      planningAvailable: false,
      missingContext: [{ field: 'jsonOutput' }],
    },
  );
  assert.deepEqual(f.context.capabilities, []);
  assert.equal(f.calls.length, 1);
});

test('consumer-first selection waits for an actual producer while independent work progresses in the same plan', async () => {
  const f = await nativeFeaturePlanningFixture({
    features: [
      N8nNativeFeature.SplitNativeOutputArray,
      N8nNativeFeature.PassThrough,
      N8nNativeFeature.JsonOutput,
    ],
    producer: true,
    respond: nativeFeaturePlanningModel(),
  });
  const original = globalThis.structuredClone(f.draft);
  const result = await f.graph.invoke(turn(f.draft), f.config);
  assert.equal(result.phase, 'complete');
  assert.equal(result.questions.length, 0);
  assert.deepEqual(
    f.calls.map((call) => call.name),
    [
      'analyze_workflow_draft_edit',
      'generate_draft_native_node_addition',
      'generate_draft_native_node_addition',
      'plan_draft_connection_edit',
    ],
  );
  assert.deepEqual(
    f.calls
      .filter((call) => call.name === 'generate_draft_native_node_addition')
      .map((call) => call.payload.capability.name),
    ['original-context', 'split-native-output-array'],
  );
  const source = result.draft.nativeNodes.find(
    (node) => node.capability === 'original-context',
  );
  const split = result.draft.nativeNodes.find(
    (node) => node.capability === 'split-native-output-array',
  );
  assert.deepEqual(source.parameters, {
    rows: [3, 1],
    marker: '={{ literal text }}',
  });
  assert.equal(split.parameters.sourceNodeId, source.id);
  assert.deepEqual(result.draft.edges, [
    { from: source.id, output: 'main', to: split.id, input: 'main' },
  ]);
  assert.equal(result.draft.nativeNodes.length, 3);
  assert.equal(result.resolutions[0].stepId, result.plan.steps[1].id);
  assert.ok(
    result.artifact.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.splitOut',
    ),
  );
  assert.equal(result.artifact.triggerConnected, true);
  assert.deepEqual(f.draft, original);
});

test('an absent source produces a structured question after independent planning and cannot be approved or fabricated', async () => {
  const f = await nativeFeaturePlanningFixture({
    features: [
      N8nNativeFeature.SplitNativeOutputArray,
      N8nNativeFeature.PassThrough,
    ],
    respond: nativeFeaturePlanningModel({ includeProducer: false }),
  });
  let result = await f.graph.invoke(turn(f.draft), f.config);
  assert.equal(result.__interrupt__[0].value.kind, 'draft-questions');
  const question = result.questions.find(
    (entry) => entry.kind === 'native-materials',
  );
  assert.deepEqual(question.nativeMaterialReadiness.missingContext, [
    { field: 'nativeOutputs', minimumItems: 1, availableItems: 0 },
  ]);
  assert.equal(result.resolutions.length, 1);
  assert.equal(result.resolutions[0].stepId, result.plan.steps[1].id);
  assert.equal(result.artifact, undefined);
  assert.equal(f.calls.length, 1);
  const planId = result.plan.id;
  result = await f.graph.invoke(
    new Command({
      resume: { action: 'approve', token: result.__interrupt__[0].value.token },
    }),
    f.config,
  );
  assert.equal(result.plan.id, planId);
  assert.ok(result.issues.length);
  assert.equal(f.calls.length, 1);
  result = await f.graph.invoke(
    new Command({
      resume: { action: 'cancel', token: result.__interrupt__[0].value.token },
    }),
    f.config,
  );
  assert.equal(result.phase, 'cancelled');
  assert.equal(result.artifact, undefined);
});

test('host enum options reject unknown fields and collisions without widening explicit empty selection', async () => {
  const f = await nativeFeaturePlanningFixture({
    features: [],
    respond: (call) => {
      assert.deepEqual(call.payload.capabilities, []);
      return { decisions: [conversationSemantic(call, { kind: 'no-change' })] };
    },
  });
  const result = await f.graph.invoke(turn(f.draft), f.config);
  assert.deepEqual(result.nativeFeatures, []);
  assert.equal(result.phase, 'no-workflow');
  assert.equal(result.outcome.kind, 'no-workflow');
  assert.equal(result.artifact, undefined);
  for (const nativeFeatures of [
    { features: ['missing'] },
    { features: ['if', 'if'] },
    { features: [], apiMaterials: [] },
  ])
    assert.throws(() =>
      createWorkflowDraftConversationGraph({
        ...f.dependencies,
        nativeFeatures,
      }),
    );
});

test('an explicit extension name never impersonates the readiness of a missing registered family', async () => {
  const f = await nativeFeaturePlanningFixture({
    features: [N8nNativeFeature.JsonOutput],
    respond: (call) => ({
      decisions: [conversationSemantic(call, { kind: 'no-change' })],
    }),
  });
  const extension = createJsonOutputCapability({
    ...f.original.jsonOutput,
    name: N8nNativeFeature.JsonOutput,
  });
  const graph = createWorkflowDraftConversationGraph({
    ...f.dependencies,
    context: { ...f.context, capabilities: [extension] },
  });
  const result = await graph.invoke(turn(f.draft), f.config);
  assert.equal(result.phase, 'no-workflow');
  assert.equal(result.outcome.kind, 'no-workflow');
  assert.equal(result.outcome.changeStatus, 'no-change');
  assert.equal(result.artifact, undefined);
  assert.deepEqual(result.nativeFeatures, [
    {
      feature: N8nNativeFeature.JsonOutput,
      status: 'requires-context',
      planningAvailable: false,
      missingContext: [{ field: 'jsonOutput' }],
    },
  ]);
  assert.deepEqual(
    f.calls[0].payload.capabilities.map((entry) => entry.name),
    [extension.name],
  );
});
