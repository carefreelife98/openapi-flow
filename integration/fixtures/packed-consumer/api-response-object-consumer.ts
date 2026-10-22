import assert from 'node:assert/strict';
import {
  createNativeOutputContracts,
  createResponseValueSchema,
} from '@openapi-flow/core';
import type { ApiCallArguments, PlannedNativeNode } from '@openapi-flow/core';
import {
  N8nNativeFeature,
  createApiResponseObjectCapability,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  resolveN8nNativePlanningFeatures,
  resolveN8nNativeMaterials,
} from '@openapi-flow/n8n';
import type {
  ApiResponseObjectParameters,
  CreateApiResponseObjectCapabilityInput,
  CreateHttpRequestNodeInput,
} from '@openapi-flow/n8n';

/** Three test-owned call roles reuse explicit literals, not a previous call's planning receipt. */
export function verifyConsumerApiResponseObject(
  input: CreateHttpRequestNodeInput,
) {
  assert.deepEqual(input.arguments.bindings, []);
  assert.deepEqual(input.arguments.unresolvedInputs, []);
  const before = globalThis.structuredClone(input.arguments.values);
  const callIds = ['consumer-first', 'consumer-second', 'consumer-third'];
  const calls: ApiCallArguments[] = callIds.map((callId) => ({
    callId,
    values: globalThis.structuredClone(input.arguments.values),
    bindings: [],
    unresolvedInputs: [],
    ...(input.arguments.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.arguments.requestMediaType }),
  }));
  const source: CreateApiResponseObjectCapabilityInput = {
    materials: calls.map((call) => ({
      callId: call.callId,
      operation: input.operation,
    })),
  };
  const capability = createApiResponseObjectCapability(source);
  const parameters: ApiResponseObjectParameters = {
    fields: calls.map((call, index) => ({
      name: `result.${index + 1}`,
      sourceNodeId: call.callId,
      pointer: '',
    })),
  };
  const first = calls[0];
  assert.ok(first, 'The first test-owned API role is required');
  parameters.fields.push({
    name: 'firstAgain',
    sourceNodeId: first.callId,
    pointer: '',
  });
  const planned: PlannedNativeNode = {
    id: 'consumer-result-object',
    capability: N8nNativeFeature.ComposeApiResponses,
    parameters,
  };
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability],
  });
  assert.ok(output);
  const expected = createResponseValueSchema(input.operation, '');
  assert.deepEqual(output.schema, {
    type: 'object',
    properties: Object.fromEntries(
      parameters.fields.map((field) => [field.name, expected]),
    ),
    required: parameters.fields.map((field) => field.name),
    additionalProperties: false,
  });
  assert.deepEqual(capability.inputPorts(parameters), [
    'input1',
    'input2',
    'input3',
  ]);
  const outputSchema = capability.outputSchema;
  assert.ok(outputSchema, 'The capability must declare its output schema');
  assert.throws(() =>
    outputSchema({
      fields: [{ name: 'bad', sourceNodeId: 'not-offered', pointer: '' }],
    }),
  );
  const stable = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.ComposeApiResponses],
  });
  const bound = resolveN8nNativeMaterials({
    apiMaterials: source.materials,
    nativeOutputs: [],
    nativeNodes: [planned],
    capabilities: stable.planningCapabilities,
  });
  assert.deepEqual(bound.outputs, [output]);
  const apiNodes = calls.map((call, index) =>
    createHttpRequestNode({
      ...input,
      arguments: call,
      position: [0, index * 200],
    }),
  );
  const compiled = compilePlannedN8nWorkflow({
    id: 'installed-response-object',
    name: 'Independent installed API response object',
    materials: calls.map((call) => ({
      operation: input.operation,
      arguments: call,
    })),
    apiNodes,
    capabilities: bound.capabilities,
    plan: {
      nativeNodes: [planned],
      gaps: [],
      starts: callIds,
      edges: calls.map((call, index) => ({
        from: call.callId,
        output: 'main',
        to: planned.id,
        input: `input${index + 1}`,
      })),
    },
  });
  const merge = compiled.workflow.nodes.find(
    (node) => node.type === 'n8n-nodes-base.merge',
  );
  const set = compiled.workflow.nodes.find((node) => node.id === planned.id);
  assert.ok(merge);
  assert.ok(merge.parameters, 'Compiled Merge parameters are required');
  assert.equal(merge.parameters.numberInputs, 3);
  assert.equal(set?.type, 'n8n-nodes-base.set');
  for (const [index, fragment] of apiNodes.entries()) {
    assert.ok(
      compiled.workflow.connections[fragment.exit.name]?.main?.[0]?.some(
        (edge) => edge.node === merge.name && edge.index === index,
      ),
    );
  }
  assert.deepEqual(input.arguments.values, before);
  return compiled.workflow;
}
