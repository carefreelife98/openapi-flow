import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileBatchedN8nWorkflow,
  compilePlannedN8nWorkflow,
  createExclusiveBranchMergeCapability,
} from '@openapi-flow/n8n';
import { createConditionalBatchInput } from './fixtures/conditional-batch-fixture.mjs';

test('explicit exclusive rejoin preserves the conditional DAG and official SDK nodes without fake items', () => {
  const input = createConditionalBatchInput(2);
  const before = JSON.stringify(input.plan);
  const { workflow } = compileBatchedN8nWorkflow(input);
  assert.equal(JSON.stringify(input.plan), before);
  assert.equal(workflow.settings.executionOrder, 'v1');
  assert.deepEqual(
    workflow.nodes.find((node) => node.id === 'returned-items').parameters,
    { mode: 'append', numberInputs: 2 },
  );
  assert.equal(
    workflow.connections['eligible'].main[1][0].node,
    'skip-business-call',
  );
  assert.equal(
    workflow.connections['returned-items'].main[0][0].node,
    'process-record-batches',
  );
  assert.equal(
    workflow.connections['process-record-batches'].main[0][0].node,
    'Read values collected-results',
  );
  assert.ok(workflow.nodes.every((node) => !node.alwaysOutputData));
  assert.equal(
    workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest')
      .length,
    5,
  );
});
test('exclusive rejoin is opt-in and requests only the existing exclusive producer identity', () => {
  const capability = createExclusiveBranchMergeCapability();
  assert.equal(
    capability.parametersSchema.safeParse({ sourceNodeId: 'eligible' }).success,
    true,
  );
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: 'eligible',
      numberInputs: 4,
    }).success,
    false,
  );
  assert.equal(capability.parametersSchema.safeParse({}).success, false);
});
test('ordinary Merge remains an independent-branch join, not a conditional bypass', () => {
  const input = createConditionalBatchInput(2);
  const merge = input.plan.nativeNodes.find(
    (node) => node.id === 'returned-items',
  );
  merge.capability = 'merge-append';
  merge.parameters = { numberInputs: 2 };
  assert.throws(() => compileBatchedN8nWorkflow(input), /mutually exclusive/);
});
test('rejoin rejects missing, unknown, repeated and unrelated alternatives before compilation', () => {
  for (const change of [
    (i) => {
      i.plan.nativeNodes.find(
        (n) => n.id === 'returned-items',
      ).parameters.sourceNodeId = 'absent';
    },
    (i) => {
      i.plan.nativeNodes.find(
        (n) => n.id === 'returned-items',
      ).parameters.sourceNodeId = 'details';
    },
    (i) => {
      i.plan.edges.find(
        (e) => e.from === 'eligible' && e.output === 'false',
      ).output = 'true';
    },
    (i) => {
      i.plan.edges = i.plan.edges.filter(
        (e) => e.to !== 'returned-items' || e.input !== 'input2',
      );
    },
  ]) {
    const input = createConditionalBatchInput(2);
    change(input);
    assert.throws(
      () => compileBatchedN8nWorkflow(input),
      /rejoin|exclusive|every root/,
    );
  }
});
test('only one-to-one branch paths can return a complete conditional batch', () => {
  const input = createConditionalBatchInput(2);
  delete input.apiNodes.find((node) => node.nodeId === 'confirm')
    .preservesInputItems;
  assert.throws(() => compileBatchedN8nWorkflow(input), /item-preserving/);
  const duplicate = createConditionalBatchInput(2);
  duplicate.plan.edges.push({
    from: 'eligible',
    output: 'false',
    to: 'confirm',
    input: 'main',
  });
  assert.throws(
    () => compileBatchedN8nWorkflow(duplicate),
    /every incoming route|distinct|unmatched|item-preserving/,
  );
});
test('branch-local API responses do not become available on the skipped path', () => {
  const input = createConditionalBatchInput(2);
  input.plan.nativeNodes.find(
    (node) => node.id === 'collected-results',
  ).parameters = { sourceNodeId: 'audit', pointer: '' };
  assert.throws(
    () => compileBatchedN8nWorkflow(input),
    /audit is not available on every incoming route/,
  );
});
test('native compilers cannot silently change a declared rejoin producer', () => {
  const input = createConditionalBatchInput(2);
  input.capabilities = input.capabilities.map((capability) =>
    capability.name === 'rejoin-exclusive-branches'
      ? {
          ...capability,
          compile: (args) => ({
            ...capability.compile(args),
            rejoinsExclusiveOutputs: 'details',
          }),
        }
      : capability,
  );
  assert.throws(
    () => compileBatchedN8nWorkflow(input),
    /violated declared rejoinsExclusiveOutputs/,
  );
});
test('exclusive rejoin is a normal DAG capability without implicit batch insertion', () => {
  const { workflow } = compilePlannedN8nWorkflow(
    createConditionalBatchInput(2),
  );
  assert.ok(
    !workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.splitInBatches',
    ),
  );
});
