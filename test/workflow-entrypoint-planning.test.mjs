import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeNativeNodePlanning,
  describeWorkflowConnectionPlanning,
  validateNativeNodePlanningRecord,
  validateWorkflowConnectionPlanningRecord,
} from '@openapi-flow/core';
import {
  planNativeNodes,
  planWorkflowConnections,
  orchestrateWorkflow,
} from '@openapi-flow/langchain';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import {
  nativePlanningRecordFixture,
  nativePlanningRecordModel,
} from './fixtures/native-planning-record-fixture.mjs';
import {
  connectionPlanningFixture,
  connectionPlanningModel,
  explainConnections,
} from './fixtures/connection-planning-record-fixture.mjs';

test('native context captures the supplied compiler entrypoint without adding a selectable trigger or changing the scenario', () => {
  const fixture = nativePlanningRecordFixture();
  const entrypoint = describeN8nManualTrigger();
  const description = describeNativeNodePlanning({
    ...fixture.input,
    entrypoint,
  });
  assert.deepEqual(description.context.entrypoint, entrypoint);
  assert.deepEqual(description.input.entrypoint, entrypoint);
  assert.equal(description.context.scenario, fixture.input.scenario);
  assert.equal(
    description.context.capabilities.length,
    fixture.input.capabilities.length,
  );
  entrypoint.description = 'caller mutated after capture';
  assert.notEqual(
    description.context.entrypoint.description,
    entrypoint.description,
  );
  description.context.entrypoint.description = 'context mutated independently';
  assert.notEqual(
    description.input.entrypoint.description,
    description.context.entrypoint.description,
  );
});

test('native planning passes the real entrypoint as input evidence, not generated output or node parameters', async () => {
  const fixture = nativePlanningRecordFixture();
  const input = { ...fixture.input, entrypoint: describeN8nManualTrigger() };
  const result = await planNativeNodes({
    ...input,
    includeExplanations: true,
    model: nativePlanningRecordModel(
      fixture.explained,
      ({ schema, messages }) => {
        assert.deepEqual(
          JSON.parse(messages[1].content).entrypoint,
          input.entrypoint,
        );
        assert.match(messages[0].content, /entrypoint/);
        assert.equal(Object.hasOwn(schema.properties, 'entrypoint'), false);
      },
    ),
  });
  assert.deepEqual(result.nativeNodes, fixture.nodes);
  assert.deepEqual(
    result.nativePlanning.evidence.context.entrypoint,
    input.entrypoint,
  );
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: result.nativePlanning,
  });
  assert.throws(
    () =>
      validateNativeNodePlanningRecord({
        ...input,
        entrypoint: {
          ...input.entrypoint,
          description: 'different owner contract',
        },
        plan: result,
        record: result.nativePlanning,
      }),
    /differs from/,
  );
});

test('an omitted start contract is not inferred even when the scenario mentions a manual workflow', () => {
  const native = describeNativeNodePlanning({
    planId: 'unspecified',
    scenario: 'Create a manual workflow.',
  });
  const connections = describeWorkflowConnectionPlanning({
    scenario: 'Create a manual workflow.',
  });
  for (const description of [native, connections]) {
    assert.equal(Object.hasOwn(description.context, 'entrypoint'), false);
    assert.equal(Object.hasOwn(description.input, 'entrypoint'), false);
  }
});

test('connection planning captures the owner-provided start contract but keeps only real material IDs and code-derived roots', async () => {
  const fixture = connectionPlanningFixture();
  const input = { ...fixture.input, entrypoint: describeN8nManualTrigger() };
  const described = describeWorkflowConnectionPlanning(input);
  assert.deepEqual(described.context.entrypoint, input.entrypoint);
  assert.deepEqual(described.input.entrypoint, input.entrypoint);
  assert.equal(
    described.context.nodes.some((node) => node.id === 'manual'),
    false,
  );
  const result = await planWorkflowConnections({
    ...input,
    includeExplanations: true,
    model: connectionPlanningModel(
      explainConnections(fixture.proposal),
      ({ context, schema, messages }) => {
        assert.deepEqual(context.entrypoint, input.entrypoint);
        assert.match(messages[0].content, /entrypoint/);
        assert.equal(Object.hasOwn(schema.properties, 'entrypoint'), false);
      },
    ),
  });
  assert.deepEqual(result.starts, fixture.plan.starts);
  assert.deepEqual(
    result.connectionPlanning.evidence.context.entrypoint,
    input.entrypoint,
  );
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan: result,
    record: result.connectionPlanning,
  });
  assert.throws(
    () =>
      validateWorkflowConnectionPlanningRecord({
        ...input,
        entrypoint: { ...input.entrypoint, kind: 'another-start' },
        plan: result,
        record: result.connectionPlanning,
      }),
    /differs from/,
  );
});

test('invalid or extra entrypoint fields fail at both boundaries before a model request', async () => {
  for (const entrypoint of [
    null,
    {},
    { kind: 'manual' },
    { kind: '', description: 'provided' },
    { kind: 'manual', description: ' ' },
    { kind: 'manual', description: 'provided', token: 'not-allowed' },
  ]) {
    const native = nativePlanningRecordFixture();
    const connections = connectionPlanningFixture();
    const nativeModel = nativePlanningRecordModel(native.explained);
    const connectionModel = connectionPlanningModel(connections.proposal);
    await assert.rejects(
      planNativeNodes({ ...native.input, entrypoint, model: nativeModel }),
    );
    await assert.rejects(
      planWorkflowConnections({
        ...connections.input,
        entrypoint,
        model: connectionModel,
      }),
    );
    assert.equal(nativeModel.calls, 0);
    assert.equal(connectionModel.calls, 0);
  }
});

test('models cannot change the entrypoint through either structured output', async () => {
  const native = nativePlanningRecordFixture();
  const connections = connectionPlanningFixture();
  const entrypoint = describeN8nManualTrigger();
  await assert.rejects(
    planNativeNodes({
      ...native.input,
      entrypoint,
      model: nativePlanningRecordModel({
        nativeNodes: native.nodes,
        gaps: [],
        entrypoint,
      }),
    }),
    (error) => error.failure.stage === 'proposal-schema',
  );
  await assert.rejects(
    planWorkflowConnections({
      ...connections.input,
      entrypoint,
      model: connectionPlanningModel({ ...connections.proposal, entrypoint }),
    }),
    (error) => error.failure.stage === 'proposal-schema',
  );
});

test('orchestration forwards the same explicit start contract to both planning calls', async () => {
  const fixture = connectionPlanningFixture();
  const entrypoint = describeN8nManualTrigger();
  const contexts = [];
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke(messages) {
          contexts.push(JSON.parse(messages[1].content));
          return options.name === 'plan_native_nodes'
            ? { nativeNodes: [], gaps: [] }
            : globalThis.structuredClone(fixture.proposal);
        },
      };
    },
  };
  await orchestrateWorkflow({
    ...fixture.input,
    workflowId: 'entrypoint-composition',
    entrypoint,
    model,
    preparedNativeNodes: fixture.input.nativeNodes,
  });
  assert.equal(contexts.length, 2);
  for (const context of contexts)
    assert.deepEqual(context.entrypoint, entrypoint);
});
