import assert from 'node:assert/strict';
import { createResponseValueSchema } from '@openapi-flow/core';
import type { ApiCallArguments, PlannedNativeNode } from '@openapi-flow/core';
import {
  N8nNativeFeature,
  createApiResponseResultsCapability,
  createResponseEvaluationCapability,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  resolveN8nNativePlanningFeatures,
  resolveN8nNativeMaterials,
} from '@openapi-flow/n8n';
import type {
  ApiResponseResultsParameters,
  CreateApiResponseResultsCapabilityInput,
  CreateHttpRequestNodeInput,
  ResponseEvaluationParameters,
} from '@openapi-flow/n8n';

/** Independent installed-package proof using an unchanged actual OAS contract. */
export function verifyConsumerApiResponseResults(
  input: CreateHttpRequestNodeInput,
) {
  const callIds = ['results-first', 'results-second', 'results-third'];
  const calls: ApiCallArguments[] = callIds.map((callId) => ({
    callId,
    values: globalThis.structuredClone(input.arguments.values),
    bindings: [],
    unresolvedInputs: [],
    ...(input.arguments.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.arguments.requestMediaType }),
  }));
  const source: CreateApiResponseResultsCapabilityInput = {
    materials: calls.map(({ callId }) => ({
      callId,
      operation: input.operation,
    })),
  };
  const capability = createApiResponseResultsCapability(source);
  const evaluation = createResponseEvaluationCapability({
    sources: { apiMaterials: source.materials, nativeOutputs: [] },
  });
  const evaluationParameters: ResponseEvaluationParameters = {
    checks: [
      {
        kind: 'unassessed',
        source: { source: 'response', nodeId: callIds[0]!, pointer: '' },
      },
    ],
  };
  assert.equal(evaluation.name, N8nNativeFeature.EvaluateResponses);
  assert.ok(evaluation.outputSchema?.(evaluationParameters));
  assert.throws(() =>
    evaluation.outputSchema?.({
      checks: [
        {
          kind: 'unassessed',
          source: { source: 'response', nodeId: 'not-offered', pointer: '' },
        },
      ],
    }),
  );
  const parameters: ApiResponseResultsParameters = { sourceNodeIds: callIds };
  const planned: PlannedNativeNode = {
    id: 'consumer-result-list',
    capability: N8nNativeFeature.GatherApiResponses,
    parameters,
  };
  const stable = resolveN8nNativePlanningFeatures();
  assert.ok(
    stable.planningCapabilities.some(
      (entry) => entry.name === N8nNativeFeature.GatherApiResponses,
    ),
  );
  assert.ok(
    stable.planningCapabilities.every(
      (entry) => entry.name !== N8nNativeFeature.ComposeApiResponses,
    ),
  );
  const bound = resolveN8nNativeMaterials({
    apiMaterials: source.materials,
    nativeOutputs: [],
    nativeNodes: [planned],
    capabilities: [capability],
  });
  const schema = bound.outputs[0]?.schema;
  assert.ok(schema && typeof schema !== 'boolean');
  assert.deepEqual(
    bound.outputs[0]?.schema,
    capability.outputSchema?.(parameters),
  );
  const outputSchema = capability.outputSchema;
  assert.ok(outputSchema);
  assert.throws(() => outputSchema({ sourceNodeIds: ['not-offered'] }));
  assert.throws(() =>
    capability.parametersSchema.parse({
      ...parameters,
      fields: [{ name: 'invented' }],
    }),
  );
  const body = createResponseValueSchema(input.operation, '');
  const expectedEntries = calls.map(({ callId }) => ({
    type: 'object',
    properties: {
      callId: { const: callId },
      documentId: { const: input.operation.key.documentId },
      method: { const: input.operation.method },
      path: { const: input.operation.path },
      body,
    },
    required: ['callId', 'documentId', 'method', 'path', 'body'],
    additionalProperties: false,
  }));
  assert.deepEqual(schema.properties, {
    results: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { anyOf: expectedEntries },
      allOf: callIds.map((callId) => ({
        contains: {
          type: 'object',
          properties: { callId: { const: callId } },
          required: ['callId'],
        },
        minContains: 1,
        maxContains: 1,
      })),
    },
  });
  const apiNodes = calls.map((call, index) =>
    createHttpRequestNode({
      ...input,
      arguments: call,
      position: [0, index * 200],
    }),
  );
  const compiled = compilePlannedN8nWorkflow({
    id: 'installed-response-results',
    name: 'Independent installed API results',
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
      edges: callIds.map((from, index) => ({
        from,
        output: 'main',
        to: planned.id,
        input: `input${index + 1}`,
      })),
    },
  });
  const aggregate = compiled.workflow.nodes.find(
    (node) => node.id === planned.id,
  );
  assert.equal(aggregate?.type, 'n8n-nodes-base.aggregate');
  assert.equal(aggregate?.parameters?.destinationFieldName, 'results');
  return compiled.workflow;
}
