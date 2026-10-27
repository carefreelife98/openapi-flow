import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
  NativeSelectionPlanningStoppedError,
} from '@openapi-flow/example-langgraph-workflow';
import { nativeSelectionParentFixture } from './fixtures/native-selection-parent-fixture.mjs';

for (const [name, create] of [
  ['orchestrated', createOrchestratedWorkflowGenerationGraph],
  ['conversational', createConversationalWorkflowGenerationGraph],
]) {
  test(`${name} parent runs the optional native repair child before value generation and SDK compilation`, async () => {
    const f = nativeSelectionParentFixture(name);
    const graph = create(f.dependencies);
    const config = {
      configurable: { thread_id: name },
      recursionLimit: 100,
      durability: 'sync',
    };
    const result = await graph.invoke(f.input, config);
    assert.equal(result.status, 'complete');
    assert.equal(result.nativeSelectionPlanning.status, 'ready');
    assert.equal(result.nativeSelectionPlanning.modelInvocations, 3);
    assert.equal(result.nativeSelectionPlanning.reselections, 1);
    assert.equal(result.nativeSelectionPlanning.reviews.length, 1);
    assert.equal(result.nativeSelection.gaps.length, 0);
    assert.equal(
      result.nativeConfigurations[0].result.node.parameters.enabled,
      false,
    );
    assert.deepEqual(
      f.calls.map((call) => call.name),
      [
        'select_native_node_instances',
        'review_native_instance_selection',
        'select_native_node_instances',
        'generate_native_node_parameters',
        'plan_workflow_connections',
      ],
    );
    assert.deepEqual(
      f.progress.map((event) => event.phase),
      ['selected', 'reviewed', 'ready'],
    );
    assert(
      result.workflow.nodes.some(
        (node) => node.type === 'n8n-nodes-base.manualTrigger',
      ),
    );
    assert(
      result.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.set'),
    );
    const history = [];
    for await (const checkpoint of f.dependencies.checkpointer.list({}))
      history.push(checkpoint);
    const child = history.filter((entry) =>
      entry.config.configurable.checkpoint_ns?.includes(
        'selectNativeInstances:',
      ),
    );
    assert(
      child.length > 0,
      'Parent MemorySaver owns the invoked child checkpoints',
    );
    assert(
      child.some(
        (entry) => entry.checkpoint.channel_values.modelInvocations === 2,
      ),
    );
  });

  test(`${name} parent stops on genuine business input with original selection/review instead of producing a misleading workflow`, async () => {
    const f = nativeSelectionParentFixture('blocked-' + name, true);
    const graph = create(f.dependencies);
    const config = {
      configurable: { thread_id: 'blocked-' + name },
      recursionLimit: 100,
    };
    let original;
    await assert.rejects(graph.invoke(f.input, config), (error) => {
      original = error;
      return (
        error instanceof NativeSelectionPlanningStoppedError &&
        error.failure.receipt.status === 'needs-business-decision'
      );
    });
    const saved = await graph.getState(config);
    assert.equal(saved.values.nativePlanningStatus, 'selection-blocked');
    assert.equal(saved.values.nativeSelection.gaps.length, 1);
    assert.equal(saved.values.nativeSelectionPlanning.reviews.length, 1);
    assert.equal(saved.values.workflow, undefined);
    assert.equal(f.calls.length, 2);
    await assert.rejects(
      graph.invoke(null, config),
      (error) =>
        error instanceof NativeSelectionPlanningStoppedError &&
        assert.deepEqual(error.failure, original.failure) === undefined,
    );
    assert.equal(f.calls.length, 2);
  });

  test(`${name} parent resume reuses the failed child checkpoint instead of invoking the provider again`, async () => {
    const f = nativeSelectionParentFixture('transport-' + name);
    const cause = new Error('Original provider failure');
    const model = f.dependencies.model;
    f.dependencies.model = {
      withStructuredOutput(schema, options) {
        const call = model.withStructuredOutput(schema, options);
        return {
          async invoke(messages, config) {
            if (options.name === 'review_native_instance_selection') {
              f.calls.push({ name: options.name });
              throw cause;
            }
            return call.invoke(messages, config);
          },
        };
      },
    };
    const graph = create(f.dependencies);
    const config = {
      configurable: { thread_id: 'transport-' + name },
      recursionLimit: 100,
    };
    let original;
    await assert.rejects(graph.invoke(f.input, config), (error) => {
      original = error;
      return error.cause === cause;
    });
    assert.equal(f.calls.length, 2);
    await assert.rejects(
      graph.invoke(null, config),
      (error) => error === original,
    );
    assert.equal(f.calls.length, 2);
    assert.equal((await graph.getState(config)).values.workflow, undefined);
  });
}
