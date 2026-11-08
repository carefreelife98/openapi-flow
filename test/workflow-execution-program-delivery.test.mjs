import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectWorkflowProgramDelivery,
  resolveWorkflowExecutionProgram,
} from '@openapi-flow/core';
import {
  executionProgramBranchFixture,
  executionProgramNode as node,
  executionProgramBranch as branch,
} from './fixtures/execution-program-branch-fixture.mjs';
function fixture() {
  const source = executionProgramBranchFixture();
  const program = {
    kind: 'execution-program',
    body: {
      kind: 'sequence',
      steps: [
        node('seed'),
        {
          kind: 'parallel',
          branches: [branch(), node('other')],
          join: { kind: 'barrier' },
        },
        node('done'),
      ],
    },
  };
  return {
    ...source,
    result: resolveWorkflowExecutionProgram({ ...source, program }),
  };
}
test('partial delivery never bypasses the condition when one alternative is blocked', () => {
  const input = fixture();
  const delivery = inspectWorkflowProgramDelivery({
    ...input,
    blockedNodeIds: ['yes'],
  });
  assert.equal(delivery.status, 'partial');
  assert.deepEqual(delivery.plan.starts, ['seed']);
  assert.deepEqual(
    delivery.plan.nativeNodes.map((n) => n.id),
    ['seed', 'other'],
  );
  assert.deepEqual(delivery.plan.edges, [
    { from: 'seed', output: 'main', to: 'other', input: 'main' },
  ]);
});
test('a failure at the only original start cannot invent a new partial start', () => {
  const input = fixture();
  const delivery = inspectWorkflowProgramDelivery({
    ...input,
    blockedNodeIds: ['seed'],
  });
  assert.equal(delivery.status, 'unavailable');
  assert.deepEqual(delivery.plan.starts, []);
  assert.deepEqual(delivery.plan.nativeNodes, []);
});
test('partial delivery requires explicit valid affected nodes and an unchanged receipt', () => {
  const input = fixture();
  for (const blockedNodeIds of [[], ['invented'], ['yes', 'yes']])
    assert.throws(() =>
      inspectWorkflowProgramDelivery({ ...input, blockedNodeIds }),
    );
  input.result.plan.edges = [];
  assert.throws(
    () => inspectWorkflowProgramDelivery({ ...input, blockedNodeIds: ['yes'] }),
    /receipt/,
  );
});

test('delivery preserves repeated API instances while supplying each original operation contract once', async () => {
  const { incrementalConnectionFixture } =
    await import('./fixtures/incremental-connection-fixture.mjs');
  const { createN8nWorkflowProgramControls } =
    await import('@openapi-flow/n8n');
  const { createWorkflowProgramDeliveryDraft } =
    await import('@openapi-flow/core');
  const source = {
    ...incrementalConnectionFixture().source,
    edges: [],
    gaps: [],
    controls: createN8nWorkflowProgramControls(),
    limits: { maxDepth: 20, maxBlocks: 100 },
  };
  source.literalSourceMessages = [{ id: 'request', text: source.scenario }];
  const copied = globalThis.structuredClone(source.materials[0]);
  copied.arguments.callId = 'source-copy';
  source.materials.push(copied);
  const body = {
    kind: 'parallel',
    branches: [
      {
        kind: 'sequence',
        steps: [
          node('source'),
          {
            kind: 'parallel',
            branches: ['detail', 'price', 'stock'].map(node),
            join: node('join'),
          },
          node('summary'),
        ],
      },
      node('source-copy'),
    ],
    join: { kind: 'barrier' },
  };
  const result = resolveWorkflowExecutionProgram({
    ...source,
    program: { kind: 'execution-program', body },
  });
  const delivery = createWorkflowProgramDeliveryDraft({
    ...source,
    result,
    id: 'repeated-api-delivery',
  });
  assert.equal(delivery.status, 'ready');
  assert.equal(delivery.draft.apiCalls.length, 6);
  assert.equal(delivery.context.operations.length, 5);
  assert.equal(
    delivery.draft.apiCalls.filter(
      (call) =>
        call.operation.operationRef === copied.operation.key.operationRef,
    ).length,
    2,
  );
});
