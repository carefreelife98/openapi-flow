import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileBatchedN8nWorkflow,
  createPassThroughCapability,
} from '@openapi-flow/n8n';
import { createBatchItemJoinInput } from './fixtures/batch-item-join-fixture.mjs';

const input = () =>
  createBatchItemJoinInput('https://fixture.test', 'reordered', 3, 2);
test('batch fan-out and ancestry join preserve the original DAG and explicit reader endpoints', async () => {
  const data = await input();
  const before = JSON.stringify(data.plan);
  const { workflow } = compileBatchedN8nWorkflow(data);
  assert.equal(JSON.stringify(data.plan), before);
  assert.equal(
    workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest')
      .length,
    5,
  );
  assert.equal(
    workflow.nodes.find((node) => node.id === 'batch-entry').type,
    'n8n-nodes-base.noOp',
  );
  assert.equal(workflow.connections['batch-entry'].main[0].length, 3);
  assert.equal(
    workflow.connections['order-beta'].main[0][0].node,
    'Read branch 2 joined',
  );
  assert.equal(
    workflow.connections['Request consume'].main[0][0].node,
    'process-branch-batches',
  );
  assert.equal(
    workflow.connections['process-branch-batches'].main[0][0].node,
    'Read values batch-results',
  );
});
test('pass-through is opt-in, has no value configuration and creates no fake items', () => {
  const capability = createPassThroughCapability();
  const planned = { id: 'entry', capability: capability.name, parameters: {} };
  const compiled = capability.compile({
    planned,
    position: [10, 20],
    apiNodeNames: {},
  });
  assert.equal(compiled.preservesInputItems, true);
  assert.equal(compiled.nodes[0].type, 'n8n-nodes-base.noOp');
  assert.deepEqual(compiled.nodes[0].config.parameters, {});
  assert.throws(() =>
    capability.compile({
      planned: { ...planned, parameters: { invented: true } },
      position: [10, 20],
      apiNodeNames: {},
    }),
  );
});
test('filters, duplicates, ambiguous links and joins without ancestry contracts cannot form a complete batch return path', async () => {
  for (const mode of [
    'both-filtered',
    'missing',
    'empty-branch',
    'duplicate',
    'ambiguous',
  ]) {
    const data = await createBatchItemJoinInput(
      'https://fixture.test',
      mode,
      2,
      2,
    );
    assert.throws(
      () => compileBatchedN8nWorkflow(data),
      /item-preserving main path contract/,
    );
  }
  const data = await input();
  const original = data.capabilities.find(
    (capability) => capability.name === 'join-api-items',
  );
  data.capabilities = data.capabilities.map((capability) =>
    capability === original
      ? {
          ...capability,
          compile: (args) => {
            const compiled = original.compile(args);
            delete compiled.joinsInputItemsByAncestry;
            return compiled;
          },
        }
      : capability,
  );
  assert.throws(
    () => compileBatchedN8nWorkflow(data),
    /item-preserving main path contract/,
  );
});
test('only complete branches sharing a one-to-one entry ancestor may be reduced', async () => {
  for (const change of [
    (data) =>
      data.plan.edges.push({
        from: 'order-alpha',
        output: 'main',
        to: 'consume',
        input: 'main',
      }),
    (data) => {
      const join = data.capabilities.find(
        (capability) => capability.name === 'join-api-items',
      );
      const compile = join.compile;
      join.compile = (args) => {
        const fragment = compile(args);
        fragment.joinsInputItemsByAncestry.scopeNodeId = 'order-alpha';
        return fragment;
      };
    },
    (data) => data.batchScopes[0].nodeIds.push('each-record'),
  ]) {
    const data = await input();
    change(data);
    assert.throws(
      () => compileBatchedN8nWorkflow(data),
      /not available on every incoming route|must identify each entry item|boundary/,
    );
  }
});

test('one-to-one upstream relays retain the actual shared native ancestor', async () => {
  const data = await input();
  data.plan.nativeNodes.push({
    id: 'upstream-relay',
    capability: 'pass-through',
    parameters: {},
  });
  const edge = data.plan.edges.find(
    (edge) => edge.from === 'each-record' && edge.to === 'batch-entry',
  );
  edge.to = 'upstream-relay';
  data.plan.edges.push({
    from: 'upstream-relay',
    output: 'main',
    to: 'batch-entry',
    input: 'main',
  });
  assert.doesNotThrow(() => compileBatchedN8nWorkflow(data));
});

test('a bypassed return, an ordinary multi-source stream or mutually exclusive ports is never repaired', async () => {
  const data = await input();
  data.plan.edges = data.plan.edges.filter(
    (edge) => edge.from !== 'order-gamma',
  );
  assert.throws(
    () => compileBatchedN8nWorkflow(data),
    /each join input requires exactly one source/,
  );
  const ambiguous = await input();
  const capability = ambiguous.capabilities.find(
    (capability) => capability.name === 'join-api-items',
  );
  const compile = capability.compile;
  capability.compile = (args) => ({
    ...compile(args),
    preservesInputItems: true,
  });
  assert.throws(
    () => compileBatchedN8nWorkflow(ambiguous),
    /item-preserving main path contract/,
  );
  const invalidPort = await input();
  invalidPort.plan.edges.find((edge) => edge.from === 'batch-entry').output =
    'true';
  assert.throws(() => compileBatchedN8nWorkflow(invalidPort), /port/);
});
