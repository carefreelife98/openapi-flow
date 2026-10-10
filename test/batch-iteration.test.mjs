import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileBatchedN8nWorkflow,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  createBatchIterationInput,
  compileBatchIteration,
} from './fixtures/batch-iteration-fixture.mjs';

test('explicit batch scopes lower a validated DAG into an official finite loop with a completion boundary', () => {
  const input = createBatchIterationInput(2);
  const before = JSON.stringify(input.plan);
  const { workflow } = compileBatchedN8nWorkflow(input);
  const loop = workflow.nodes.find(
    (node) => node.id === 'process-record-batches',
  );
  assert.equal(loop.type, 'n8n-nodes-base.splitInBatches');
  assert.equal(loop.typeVersion, 3);
  assert.deepEqual(loop.parameters, {
    batchSize: 2,
    options: { reset: false },
  });
  assert.deepEqual(
    workflow.connections['process-record-batches'].main.map((edges) =>
      edges.map((edge) => edge.node),
    ),
    [['Read values collected-results'], ['Materialize details']],
  );
  assert.equal(workflow.connections['verify-item'].main[0][0].node, loop.name);
  assert.equal(workflow.connections['each-record'].main[0][0].node, loop.name);
  assert.equal(JSON.stringify(input.plan), before);
  assert.equal(
    compilePlannedN8nWorkflow(input).workflow.nodes.some(
      (node) => node.type === loop.type,
    ),
    false,
  );
});
test('missing, malformed or transformed batch settings fail at the boundary', () => {
  for (const batchScopes of [
    undefined,
    [],
    [{ ...createBatchIterationInput(2).batchScopes[0], batchSize: 0 }],
    [{ ...createBatchIterationInput(2).batchScopes[0], batchSize: 1.5 }],
    [{ ...createBatchIterationInput(2).batchScopes[0], id: ' ' }],
  ])
    assert.throws(() =>
      compileBatchedN8nWorkflow({
        ...createBatchIterationInput(2),
        batchScopes,
      }),
    );
  const input = createBatchIterationInput(2);
  input.batchScopes[0].id = '  explicitly spaced scope  ';
  assert.ok(
    compileBatchedN8nWorkflow(input).workflow.nodes.some(
      (node) => node.id === input.batchScopes[0].id,
    ),
  );
});
test('duplicate, overlapping, missing and improperly bounded scope members are rejected', () => {
  for (const change of [
    (i) => i.batchScopes.push({ ...i.batchScopes[0] }),
    (i) => i.batchScopes.push({ ...i.batchScopes[0], id: 'overlap' }),
    (i) => i.batchScopes[0].nodeIds.push('details'),
    (i) => i.batchScopes[0].nodeIds.push('missing'),
    (i) => (i.batchScopes[0].entryNodeId = 'confirm'),
    (i) => (i.batchScopes[0].exitNodeId = 'details'),
    (i) => (i.batchScopes[0].nodeIds = ['details', 'audit', 'verify-item']),
  ]) {
    const input = createBatchIterationInput(2);
    change(input);
    assert.throws(() => compileBatchedN8nWorkflow(input), /batch .*:/);
  }
});
test('batch boundaries cannot include streams that change item count or singleton materializers', () => {
  for (const change of [
    (i) => {
      i.batchScopes[0].nodeIds.unshift('each-record');
      i.batchScopes[0].entryNodeId = 'each-record';
    },
    (i) => {
      i.batchScopes[0].nodeIds.push('collected-results');
      i.batchScopes[0].exitNodeId = 'collected-results';
    },
    (i) => {
      delete i.apiNodes.find((node) => node.nodeId === 'details')
        .preservesInputItems;
    },
  ]) {
    const input = createBatchIterationInput(2);
    change(input);
    assert.throws(
      () => compileBatchedN8nWorkflow(input),
      /item-preserving main path contract/,
    );
  }
});
test('scope metadata never bypasses OAS provenance, DAG cycles, identities or SDK entry positions', () => {
  const input = createBatchIterationInput(2);
  input.plan.edges.push({
    from: 'audit',
    to: 'details',
    output: 'main',
    input: 'main',
  });
  assert.throws(() => compileBatchedN8nWorkflow(input), /cycle/);
  const collision = createBatchIterationInput(2);
  collision.batchScopes[0].id = 'details';
  assert.throws(
    () => compileBatchedN8nWorkflow(collision),
    /IDs and names must be unique/,
  );
  const missingPosition = createBatchIterationInput(2);
  delete missingPosition.apiNodes.find((node) => node.nodeId === 'details')
    .entry.config.position;
  assert.throws(
    () => compileBatchedN8nWorkflow(missingPosition),
    /requires config.position/,
  );
});
test('batch size does not cause per-item API cloning or model-generated request/loop code', () => {
  for (const size of [1, 2, 10]) {
    const { workflow } = compileBatchIteration(size);
    assert.equal(
      workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.httpRequest',
      ).length,
      5,
    );
    assert.equal(
      workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.splitInBatches',
      ).length,
      1,
    );
  }
});

test('adjacent single-member scopes connect completion to the next controller', () => {
  const input = createBatchIterationInput(2);
  input.batchScopes = [
    {
      id: 'detail-only',
      batchSize: 1,
      nodeIds: ['details'],
      entryNodeId: 'details',
      exitNodeId: 'details',
    },
    {
      id: 'follow-up',
      batchSize: 2,
      nodeIds: ['confirm', 'audit', 'verify-item'],
      entryNodeId: 'confirm',
      exitNodeId: 'verify-item',
    },
  ];
  const { workflow } = compileBatchedN8nWorkflow(input);
  assert.equal(
    workflow.connections['detail-only'].main[0][0].node,
    'follow-up',
  );
  assert.equal(
    workflow.connections['detail-only'].main[1][0].node,
    'Materialize details',
  );
  assert.equal(
    workflow.connections['Request details'].main[0][0].node,
    'detail-only',
  );
  assert.equal(
    workflow.connections['follow-up'].main[1][0].node,
    'Materialize confirm',
  );
});

test('batch scope start is driven by Manual Trigger and boundary bypasses fail', () => {
  const start = createBatchIterationInput(2);
  start.batchScopes = [
    {
      id: 'initial-call',
      batchSize: 1,
      nodeIds: ['records'],
      entryNodeId: 'records',
      exitNodeId: 'records',
    },
  ];
  const { workflow } = compileBatchedN8nWorkflow(start);
  assert.equal(workflow.connections.Start.main[0][0].node, 'initial-call');
  assert.equal(
    workflow.connections['initial-call'].main[0][0].node,
    'Read array each-record',
  );
  for (const edge of [
    { from: 'records', to: 'audit', output: 'main', input: 'main' },
    { from: 'confirm', to: 'collected-results', output: 'main', input: 'main' },
    { from: 'records', to: 'details', output: 'main', input: 'main' },
  ]) {
    const input = createBatchIterationInput(2);
    input.plan.edges.push(edge);
    assert.throws(
      () => compileBatchedN8nWorkflow(input),
      /response (confirm|audit|each-record) is not available on every incoming route/,
    );
  }
});
