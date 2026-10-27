import assert from 'node:assert/strict';
import test from 'node:test';
import { describeWorkflowConnectionPlanning } from '@openapi-flow/core';
import { planWorkflowConnections } from '@openapi-flow/langchain';
import {
  connectionPlanningFixture,
  connectionPlanningModel,
} from './fixtures/connection-planning-record-fixture.mjs';

test('single-pass wire enumerates actual supplied IDs and declared ports instead of asking the model to copy arbitrary identities', async () => {
  const { input, proposal } = connectionPlanningFixture();
  const { context } = describeWorkflowConnectionPlanning(input);
  const model = connectionPlanningModel(proposal, ({ schema }) => {
    const edge = schema.properties.edges.items.properties;
    for (const key of ['from', 'to']) {
      assert.deepEqual(
        edge[key].anyOf[0].enum,
        context.nodes.map((n) => n.id),
      );
      assert.deepEqual(edge[key].anyOf[1].required, ['gapId']);
      assert.equal(edge[key].anyOf[1].additionalProperties, false);
    }
    assert.deepEqual(edge.output.enum, [
      ...new Set(['main', ...context.nodes.flatMap((n) => n.outputs)]),
    ]);
    assert.deepEqual(edge.input.enum, [
      ...new Set(['main', ...context.nodes.flatMap((n) => n.inputs)]),
    ]);
  });
  await planWorkflowConnections({ ...input, model });
  assert.equal(model.calls, 1);
});

test('wrong known-node spelling and unknown ports fail at proposal validation, retain original output and never retry or approximate IDs', async () => {
  for (const change of [
    (o) => {
      o.edges[0].from += '-typo';
    },
    (o) => {
      o.edges[0].to += '-typo';
    },
    (o) => {
      o.edges[0].output = 'invented';
    },
    (o) => {
      o.edges[0].input = 'invented';
    },
    (o) => {
      o.edges[0].from = { gapId: 'source-typo' };
    },
    (o) => {
      o.edges[0].from = { gapId: o.edges[0].from };
    },
  ]) {
    const { input, proposal } = connectionPlanningFixture();
    change(proposal);
    const before = globalThis.structuredClone(proposal);
    const model = connectionPlanningModel(proposal);
    await assert.rejects(
      planWorkflowConnections({ ...input, model }),
      (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, before);
        return true;
      },
    );
    assert.deepEqual(proposal, before);
    assert.equal(model.calls, 1);
  }
});

test('a newly declared gap requires an explicit gap reference and resolves to the unchanged canonical graph ID', async () => {
  const { input: original } = connectionPlanningFixture();
  const input = {
    scenario: 'Read then notify using the unavailable action.',
    materials: [original.materials[0]],
  };
  const output = {
    edges: [
      {
        from: 'source',
        output: 'main',
        to: { gapId: 'missing-notification' },
        input: 'main',
      },
    ],
    additionalGaps: [
      {
        id: 'missing-notification',
        description: 'The requested notification action is unavailable.',
      },
    ],
    blockedCalls: [],
  };
  const before = globalThis.structuredClone(output);
  const model = connectionPlanningModel(output);
  const plan = await planWorkflowConnections({ ...input, model });
  assert.equal(plan.gaps[0].id, 'missing-notification');
  assert.deepEqual(plan.edges, [
    { ...output.edges[0], to: 'missing-notification' },
  ]);
  assert.deepEqual(output, before);
  assert.equal(model.calls, 1);
  output.edges[0].to = 'missing-notification';
  await assert.rejects(
    planWorkflowConnections({
      ...input,
      model: connectionPlanningModel(output),
    }),
    (error) => error.failure.stage === 'proposal-schema',
  );
});

test('empty node inventories still accept genuinely new gaps without creating an empty enum or invoking a second model', async () => {
  const output = {
    edges: [],
    additionalGaps: [
      {
        id: 'missing',
        description: 'No supplied action can implement the request.',
      },
    ],
  };
  const model = connectionPlanningModel(output, ({ schema }) => {
    assert.equal(schema.properties.edges.items.properties.from.type, 'object');
    assert.equal(Object.hasOwn(schema.properties, 'blockedCalls'), false);
  });
  const plan = await planWorkflowConnections({ scenario: 'Notify.', model });
  assert.equal(plan.gaps[0].id, 'missing');
  assert.equal(model.calls, 1);
});
