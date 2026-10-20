import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  stageWorkflowDraftEdit,
  validateWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
  applyDraftChangeSet,
  describeWorkflowDraftEditContext,
  describeWorkflowDraftConnectionEdit,
} from '@openapi-flow/core';
import {
  analyzeWorkflowDraftEdit,
  WorkflowDraftEditPlanningError,
} from '@openapi-flow/langchain';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import {
  connectionEditPlan,
  resolveConnectionEdit,
  addConnection,
} from './fixtures/workflow-draft-connection-edit-fixture.mjs';

const edge = (from, to, input = 'main') => ({
  from,
  output: 'main',
  to,
  input,
});
function fixture(join = false) {
  const context = {
    operations: [],
    capabilities: resolveN8nNativeFeatures({
      features: [N8nNativeFeature.PassThrough, N8nNativeFeature.MergeAppend],
    }).capabilities,
    messages: [
      {
        id: 'edit-1',
        text: 'b를 제거하고 독립적인 나머지 역할은 유지해줘. 불필요해진 병합은 제거하고 a를 c에 직접 연결해줘.',
      },
    ],
  };
  const content = {
    id: 'removal-contract',
    requirements: [],
    apiCalls: [],
    nativeNodes: ['a', 'b', 'c', 'd', 'x', 'y'].map((id) => ({
      id,
      capability: 'pass-through',
      parameters: {},
    })),
    edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('x', 'y')],
  };
  if (join) {
    content.nativeNodes.push({
      id: 'join',
      capability: 'merge-append',
      parameters: { numberInputs: 2 },
    });
    content.edges = [
      edge('a', 'join', 'input1'),
      edge('b', 'join', 'input2'),
      edge('join', 'c'),
      edge('x', 'y'),
    ];
  }
  const draft = createWorkflowDraft({ context, content });
  const input = {
    context,
    draft,
    requestMessageIds: ['edit-1'],
    resolutions: [],
  };
  return {
    ...input,
    plan: connectionEditPlan(input, [{ kind: 'remove-node', nodeId: 'b' }]),
  };
}

test('high-level removal records exact incident-edge cleanup without reconnecting survivors or mutating the original', () => {
  const input = fixture();
  const original = globalThis.structuredClone(input.draft);
  const stage = stageWorkflowDraftEdit(input);
  assert.deepEqual(stage.content.edges, [edge('c', 'd'), edge('x', 'y')]);
  assert.deepEqual(
    stage.nodeRemovalConnections.map((change) => change.edge),
    [edge('a', 'b'), edge('b', 'c')],
  );
  assert.ok(
    stage.nodeRemovalConnections.every(
      (change) =>
        change.stepIds.length === 1 &&
        change.stepIds[0] === input.plan.steps[0].id,
    ),
  );
  const candidate = assembleWorkflowDraftEdit(input);
  assert.deepEqual(candidate.draft.edges, stage.content.edges);
  assert.deepEqual(
    candidate.changeSet.changes
      .filter((change) => change.kind === 'remove-edge')
      .map((change) => change.edge),
    stage.nodeRemovalConnections.map((change) => change.edge),
  );
  assert.deepEqual(
    candidate.draft.nativeNodes,
    original.nativeNodes.filter((node) => node.id !== 'b'),
  );
  assert.deepEqual(input.draft, original);
  assert.throws(
    () =>
      applyDraftChangeSet({
        draft: input.draft,
        context: input.context,
        changeSet: {
          baseRevision: input.draft.revision,
          changes: [{ kind: 'remove-node', nodeId: 'b' }],
        },
      }),
    /missing node/,
  );
});

test('adjacent explicit removals delete each edge once and retain both authorizing step IDs', () => {
  const input = fixture();
  input.plan = connectionEditPlan(
    input,
    ['b', 'c'].map((nodeId) => ({ kind: 'remove-node', nodeId })),
  );
  const stage = stageWorkflowDraftEdit(input);
  assert.deepEqual(stage.content.edges, [edge('x', 'y')]);
  assert.equal(stage.nodeRemovalConnections.length, 3);
  assert.deepEqual(
    stage.nodeRemovalConnections.find((change) => change.edge.from === 'b')
      .stepIds,
    input.plan.steps.map((step) => step.id),
  );
  const result = assembleWorkflowDraftEdit(input);
  assert.equal(
    result.changeSet.changes.filter((change) => change.kind === 'remove-edge')
      .length,
    3,
  );
});

test('already removed edges and removed endpoints are absent from model choices, not ignored or reapplied', () => {
  const input = fixture();
  const description = describeWorkflowDraftConnectionEdit(input);
  assert.equal(description.status, 'ready');
  assert.ok(
    description.existingEdges.every(
      (entry) => entry.edge.from !== 'b' && entry.edge.to !== 'b',
    ),
  );
  assert.ok(description.contracts.every((contract) => contract.id !== 'b'));
  assert.throws(
    () =>
      resolveConnectionEdit(input, [
        { kind: 'remove', edgeId: 'stale-removed-edge' },
      ]),
    (error) => error.name === 'ZodError',
  );
  assert.throws(
    () => resolveConnectionEdit(input, [addConnection('b', 'c')]),
    (error) => error.name === 'ZodError',
  );
  assert.throws(
    () =>
      assembleWorkflowDraftEdit({
        ...input,
        connections: [
          {
            kind: 'remove-edge',
            stepIds: [input.plan.steps[0].id],
            edge: edge('a', 'b'),
          },
        ],
      }),
    /undeclared draft edge/,
  );
});

test('semantic selection receives actual existing join ports and explicitly chooses affected native removal', async () => {
  const input = fixture(true);
  const context = describeWorkflowDraftEditContext(input);
  const join = context.nodeContracts.find((contract) => contract.id === 'join');
  assert.deepEqual(join.inputs, ['input1', 'input2']);
  assert.equal(join.waitsForAllInputs, true);
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          assert.deepEqual(payload.draft.nodeContracts, context.nodeContracts);
          assert.deepEqual(
            payload.draft.nativeNodes.find((node) => node.id === 'join')
              .parameters,
            { numberInputs: 2 },
          );
          return {
            decisions: [
              { kind: 'remove-node', nodeId: 'b' },
              { kind: 'remove-node', nodeId: 'join' },
              { kind: 'revise-connections', nodeIds: ['a', 'c'] },
            ].map((decision) => ({
              ...decision,
              instruction: input.context.messages[0].text,
              sources: [{ kind: 'message', messageId: 'edit-1' }],
            })),
          };
        },
      };
    },
  };
  input.plan = await analyzeWorkflowDraftEdit({
    ...input,
    options: { includeExplanations: false },
    model,
  });
  assert.equal(calls, 1);
  const result = resolveConnectionEdit(input, [addConnection('a', 'c')]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.candidate.draft.edges, [
    edge('x', 'y'),
    edge('a', 'c'),
  ]);
  assert.ok(
    result.candidate.draft.nativeNodes.every(
      (node) => !['b', 'join'].includes(node.id),
    ),
  );
});

test('cleanup does not silently remove or resize a surviving join with a missing branch', () => {
  const input = fixture(true);
  const stage = stageWorkflowDraftEdit(input);
  assert.deepEqual(
    stage.content.nativeNodes.find((node) => node.id === 'join').parameters,
    { numberInputs: 2 },
  );
  assert.deepEqual(
    stage.nodeRemovalConnections.map((change) => change.edge),
    [edge('b', 'join', 'input2')],
  );
  assert.throws(
    () => assembleWorkflowDraftEdit(input),
    (error) => error.failure?.stage === 'final-validation',
  );
});

test('actual implementation ports changing during semantic generation reject the stale result without retry or mutation', async () => {
  const input = fixture();
  const original = globalThis.structuredClone(input.draft);
  const before = describeWorkflowDraftEditContext(input);
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          input.context.capabilities.find(
            (capability) => capability.name === 'pass-through',
          ).outputPorts = () => ['main', 'changed-port'];
          return {
            decisions: [
              {
                kind: 'no-change',
                instruction: 'Keep the current draft.',
                sources: [{ kind: 'message', messageId: 'edit-1' }],
              },
            ],
          };
        },
      };
    },
  };
  await assert.rejects(
    analyzeWorkflowDraftEdit({
      ...input,
      options: { includeExplanations: false },
      model,
    }),
    (error) =>
      error instanceof WorkflowDraftEditPlanningError &&
      error.failure.stage === 'proposal-validation' &&
      /changed during model invocation/.test(error.cause.message),
  );
  const after = describeWorkflowDraftEditContext(input);
  assert.equal(before.contextFingerprint, after.contextFingerprint);
  assert.equal(before.draftFingerprint, after.draftFingerprint);
  assert.notEqual(
    before.nodeContractsFingerprint,
    after.nodeContractsFingerprint,
  );
  assert.deepEqual(input.draft, original);
  assert.equal(calls, 1);
});

test('persisted plans bind actual implementation ports and reject stale contracts before removing any edges', () => {
  const input = fixture();
  const original = globalThis.structuredClone(input.draft);
  const persistedPlan = JSON.parse(JSON.stringify(input.plan));
  assert.doesNotThrow(() =>
    validateWorkflowDraftEditPlan({ ...input, plan: persistedPlan }),
  );
  input.context.capabilities.find(
    (capability) => capability.name === 'pass-through',
  ).outputPorts = () => ['main', 'changed-port'];
  assert.throws(
    () => stageWorkflowDraftEdit({ ...input, plan: persistedPlan }),
    /stale or has modified/,
  );
  assert.deepEqual(input.draft, original);
});
