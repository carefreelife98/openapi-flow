import assert from 'node:assert/strict';
import test from 'node:test';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  planWorkflowGraph,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import {
  nativeNodes,
  capabilities,
  graphMaterial,
  plan,
} from './fixtures/native-output-binding-fixture.mjs';

async function invokePlanner(reviewable, model, overrides = {}) {
  const input = {
    scenario: 'Use the existing context ID unchanged to read detail.',
    model,
    capabilities,
    preparedNativeNodes: nativeNodes,
    ...overrides,
  };
  return reviewable
    ? planReviewableWorkflowGraph({
        ...input,
        materials: [{ ...graphMaterial, status: 'ready' }],
        gaps: [],
      })
    : planWorkflowGraph({ ...input, materials: [graphMaterial] });
}

function output(reviewable, additions = []) {
  return {
    additionalNativeNodes: additions,
    edges: plan.edges,
    ...(reviewable ? { additionalGaps: [], blockedCalls: [] } : { gaps: [] }),
  };
}

test('both model contracts request only additional nodes and preserve existing implementation ports', async () => {
  for (const reviewable of [false, true]) {
    const registered = capabilities.map((capability) =>
      capability.name === nativeNodes[0].capability
        ? {
            ...capability,
            inputPorts: () => ['receive'],
            outputPorts: () => ['send'],
          }
        : capability,
    );
    let calls = 0;
    const model = {
      withStructuredOutput(schema) {
        const wire = toJsonSchema(schema);
        assert.ok(wire.required.includes('additionalNativeNodes'));
        assert.equal(wire.properties.nativeNodes, undefined);
        assert.match(wire.properties.additionalNativeNodes.description, /NEW/);
        return {
          async invoke(messages) {
            calls++;
            const input = JSON.parse(messages[1].content);
            assert.deepEqual(input.preparedNativeNodes, [
              {
                ...nativeNodes[0],
                inputPorts: ['receive'],
                outputPorts: ['send'],
              },
            ]);
            assert.equal(
              input.nativeOutputs[0].schema.properties.id.type,
              'string',
            );
            return schema.parse({
              ...output(reviewable),
              edges: [{ ...plan.edges[0], output: 'send' }],
            });
          },
        };
      },
    };
    const result = await invokePlanner(reviewable, model, {
      capabilities: registered,
    });
    assert.deepEqual(result.nativeNodes, nativeNodes);
    assert.equal(result.edges[0].output, 'send');
    assert.equal(calls, 1);
  }
});

test('repeating a prepared node reproduces the captured failure and remains an error, not deduplication', async () => {
  for (const reviewable of [false, true]) {
    const rejected = output(reviewable, nativeNodes);
    const original = globalThis.structuredClone(rejected);
    let calls = 0;
    await assert.rejects(
      invokePlanner(reviewable, {
        withStructuredOutput() {
          return {
            async invoke() {
              calls++;
              return rejected;
            },
          };
        },
      }),
      (error) => {
        assert.equal(error.failure.stage, 'graph-validation');
        assert.deepEqual(error.failure.output, original);
        assert.match(
          error.cause.message,
          /additionalNativeNodes\[context\] duplicates preparedNativeNodes/,
        );
        return true;
      },
    );
    assert.deepEqual(rejected, original);
    assert.equal(calls, 1);
  }
});

test('the ambiguous old model field is rejected rather than accepted through an alias', async () => {
  for (const reviewable of [false, true]) {
    const { additionalNativeNodes, ...rest } = output(reviewable);
    const rejected = { ...rest, nativeNodes: additionalNativeNodes };
    await assert.rejects(
      invokePlanner(reviewable, {
        withStructuredOutput() {
          return {
            async invoke() {
              return rejected;
            },
          };
        },
      }),
      (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, rejected);
        return true;
      },
    );
  }
});
