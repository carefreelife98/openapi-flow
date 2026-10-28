import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeNativeInstanceSelection,
  resolveNativeInstanceSelection,
} from '@openapi-flow/core';
import {
  selectNativeNodeInstances,
  reviewNativeInstanceSelection,
} from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { nativeSelectionReviewFixture } from './fixtures/native-instance-selection-review-fixture.mjs';

function restoreContext(context) {
  const { materialSourceSets, ...fields } = context;
  return {
    ...fields,
    capabilities: fields.capabilities.map((capability) => {
      if (!Object.hasOwn(capability, 'materialSourcesRef')) return capability;
      const { materialSourcesRef, ...definition } = capability;
      assert.equal(Object.hasOwn(definition, 'materialSources'), false);
      assert.ok(materialSourceSets[materialSourcesRef]);
      return {
        ...definition,
        materialSources: materialSourceSets[materialSourcesRef],
      };
    }),
  };
}

function captureModel(output, inspect) {
  return {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          inspect(JSON.parse(messages[1].content));
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

test('selection pools repeated contracts without changing its original receipt or any source value', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const input = {
    ...fixture.input,
    capabilities: resolveN8nNativePlanningFeatures({
      apiMaterials: fixture.input.apiMaterials,
      features: [
        N8nNativeFeature.GatherApiResponses,
        N8nNativeFeature.CollectApiResponses,
      ],
    }).planningCapabilities,
  };
  const expected = describeNativeInstanceSelection(input).context;
  const proposal = { instances: [], gaps: [] };
  let requests = 0;
  const result = await selectNativeNodeInstances({
    ...input,
    model: captureModel(proposal, (context) => {
      requests++;
      assert.equal(context.materialSourceSets.length, 1);
      assert.deepEqual(
        context.capabilities.map((capability) => capability.materialSourcesRef),
        [0, 0],
      );
      assert.deepEqual(restoreContext(context), expected);
      assert.ok(
        JSON.stringify(context).length < JSON.stringify(expected).length,
      );
    }),
  });
  assert.equal(requests, 1);
  assert.deepEqual(
    result,
    resolveNativeInstanceSelection({ ...input, proposal }),
  );
  assert.deepEqual(describeNativeInstanceSelection(input).context, expected);
});

test('review consumes the same lossless shared representation while retaining source validation', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const input = {
    ...fixture.input,
    capabilities: resolveN8nNativePlanningFeatures({
      apiMaterials: fixture.input.apiMaterials,
      features: [
        N8nNativeFeature.If,
        N8nNativeFeature.GatherApiResponses,
        N8nNativeFeature.CollectApiResponses,
      ],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: fixture.proposal,
  });
  const proposal = {
    assessments: Object.fromEntries(
      selection.gaps.map((gap) => [
        gap.id,
        { kind: 'unsupported-native-behavior', reason: 'Fixture review.' },
      ]),
    ),
  };
  const before = globalThis.structuredClone(selection);
  await reviewNativeInstanceSelection({
    ...input,
    selection,
    model: captureModel(proposal, (context) => {
      assert.equal(context.context.materialSourceSets.length, 1);
      assert.deepEqual(restoreContext(context.context), selection.context);
    }),
  });
  assert.deepEqual(selection, before);
});
