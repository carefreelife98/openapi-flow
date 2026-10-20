import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  inspectNativeReferenceStructure,
  describeNativeReferenceBindings,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import { resolveN8nNativeFeatures, N8nNativeFeature } from '@openapi-flow/n8n';
import { nativeFeatureRegistryFixture } from './fixtures/native-feature-registry-fixture.mjs';

test('material-dependent implementations inspect unresolved identities without declaring their source/output ready', async () => {
  const registry = resolveN8nNativeFeatures(
    await nativeFeatureRegistryFixture(),
  );
  for (const name of [
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
    N8nNativeFeature.SplitNativeOutputArray,
  ]) {
    const capability = registry.capabilities.find(
      (capability) => capability.name === name,
    );
    const node = {
      id: 'pending',
      capability: name,
      parameters: { sourceNodeId: 'removed-source', pointer: '/renamed-array' },
    };
    const original = globalThis.structuredClone(node);
    const references = inspectNativeReferenceStructure({ node, capability });
    assert.deepEqual(references, [
      {
        nodeIdPointer: '/sourceNodeId',
        valuePointer: '/pointer',
        reference: {
          source:
            name === N8nNativeFeature.SplitNativeOutputArray
              ? 'node-output'
              : 'response',
          nodeId: 'removed-source',
          pointer: '/renamed-array',
        },
      },
    ]);
    assert.equal(
      capability.parametersSchema.safeParse(node.parameters).success,
      false,
    );
    assert.throws(() => describeNativeReferenceBindings({ node, capability }));
    assert.throws(() =>
      createNativeOutputContracts({
        nativeNodes: [node],
        capabilities: [capability],
      }),
    );
    assert.deepEqual(node, original);
  }
});

test('item-join structure preserves explicit scope and API port order while full source checks remain strict', async () => {
  const registry = resolveN8nNativeFeatures(
    await nativeFeatureRegistryFixture(),
  );
  const capability = registry.capabilities.find(
    (capability) => capability.name === N8nNativeFeature.JoinApiItems,
  );
  const node = {
    id: 'join',
    capability: capability.name,
    parameters: {
      scopeNodeId: 'new-scope',
      sourceCallIds: ['new-second-role', 'new-first-role'],
    },
  };
  assert.deepEqual(inspectNativeReferenceStructure({ node, capability }), [
    {
      nodeIdPointer: '/sourceCallIds/0',
      reference: { source: 'response', nodeId: 'new-second-role', pointer: '' },
    },
    {
      nodeIdPointer: '/sourceCallIds/1',
      reference: { source: 'response', nodeId: 'new-first-role', pointer: '' },
    },
    {
      nodeIdPointer: '/scopeNodeId',
      reference: { source: 'node-output', nodeId: 'new-scope', pointer: '' },
    },
  ]);
  assert.equal(
    capability.parametersSchema.safeParse(node.parameters).success,
    false,
  );
  assert.throws(() =>
    createNativeOutputContracts({
      nativeNodes: [node],
      capabilities: [capability],
    }),
  );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node: {
          ...node,
          parameters: { ...node.parameters, sourceCallIds: ['same', 'same'] },
        },
        capability,
      }),
    /unique/,
  );
});

test('reference inspection rejects malformed pointers, wrong value types, extra parameters and runtime ownership', async () => {
  const capability = resolveN8nNativeFeatures(
    await nativeFeatureRegistryFixture(),
  ).capabilities.find(
    (capability) => capability.name === N8nNativeFeature.SplitApiResponseArray,
  );
  const node = {
    id: 'split',
    capability: capability.name,
    parameters: { sourceNodeId: 'left', pointer: '/rows' },
  };
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node: { ...node, capability: 'different' },
        capability,
      }),
    /does not match/,
  );
  for (const parameters of [
    { pointer: '/rows' },
    { sourceNodeId: 3, pointer: '/rows' },
    { sourceNodeId: 'left', pointer: '/~2' },
    { ...node.parameters, extra: true },
  ])
    assert.throws(() =>
      inspectNativeReferenceStructure({
        node: { ...node, parameters },
        capability,
      }),
    );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node: { ...node, parameters: { sourceNodeId: 'left', pointer: '/~2' } },
        capability,
      }),
    (error) =>
      /invalid response JSON pointer.*reference binding/.test(error.message) &&
      error.cause.message === 'Invalid JSON Pointer: /~2',
  );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node: { ...node, runtimeParameters: true },
        capability,
      }),
    /literal structural parameters/,
  );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node,
        capability: { ...capability, referenceStructureSchema: undefined },
      }),
    /referenceStructureSchema/,
  );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node,
        capability: { ...capability, parameterReferenceBindings: undefined },
      }),
    /parameterReferenceBindings/,
  );
});

test('structural schemas cannot inject defaults, coerce types, transform data or invent physical reference locations', async () => {
  const capability = resolveN8nNativeFeatures(
    await nativeFeatureRegistryFixture(),
  ).capabilities.find(
    (capability) => capability.name === N8nNativeFeature.SplitApiResponseArray,
  );
  const node = {
    id: 'split',
    capability: capability.name,
    parameters: { sourceNodeId: 'left', pointer: '/rows' },
  };
  for (const [parameters, schema] of [
    [
      { sourceNodeId: 'left' },
      z.strictObject({
        sourceNodeId: z.string(),
        pointer: z.string().default('/rows'),
      }),
    ],
    [
      { sourceNodeId: 4, pointer: '/rows' },
      z.strictObject({ sourceNodeId: z.coerce.string(), pointer: z.string() }),
    ],
    [
      node.parameters,
      z.strictObject({
        sourceNodeId: z.string().transform(() => 'right'),
        pointer: z.string(),
      }),
    ],
  ])
    assert.throws(
      () =>
        inspectNativeReferenceStructure({
          node: { ...node, parameters },
          capability: { ...capability, referenceStructureSchema: schema },
        }),
      /without defaults, coercion or transformation/,
    );
  for (const parameterReferenceBindings of [
    () => [
      {
        nodeIdPointer: '/pointer',
        reference: { source: 'response', nodeId: 'left', pointer: '/rows' },
      },
    ],
    () => [
      {
        nodeIdPointer: '/sourceNodeId',
        valuePointer: '/pointer',
        reference: { source: 'response', nodeId: 'left', pointer: '/invented' },
      },
    ],
    () => [
      {
        nodeIdPointer: '/sourceNodeId',
        reference: { source: 'invented-kind', nodeId: 'left' },
      },
    ],
  ])
    assert.throws(() =>
      inspectNativeReferenceStructure({
        node,
        capability: { ...capability, parameterReferenceBindings },
      }),
    );
});
