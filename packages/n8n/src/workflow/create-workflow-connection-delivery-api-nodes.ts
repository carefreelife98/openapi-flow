import { inspectWorkflowConnectionDelivery } from '@openapi-flow/core';
import type { CreateWorkflowConnectionDeliveryApiNodesInput } from '../types/workflow-connection-delivery.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';
import { createN8nNativeOutputSources } from './create-n8n-native-output-sources.js';
import { httpResponseNodeName } from '../nodes/request/response/http-response-node-name.js';
import { createHttpRequestNode } from '../nodes/request/create-http-request-node.js';

/** Own SDK exit names and native/API binding sources at the compiler boundary, never in a host adapter. */
export function createWorkflowConnectionDeliveryApiNodes(
  input: CreateWorkflowConnectionDeliveryApiNodesInput,
): N8nNodeFragment[] {
  if (!Array.isArray(input.materials))
    throw new Error('Connection delivery requires an explicit materials array');
  const delivery = inspectWorkflowConnectionDelivery(input);
  const ids = new Set(
    delivery.components.flatMap((component) =>
      component.plan === undefined ? [] : component.nodeIds,
    ),
  );
  const materials = input.materials.flatMap((material) =>
    material.status === 'ready' && ids.has(material.arguments.callId)
      ? [material]
      : [],
  );
  const apiNodeNames = Object.fromEntries(
    materials.map((material) => [
      material.arguments.callId,
      httpResponseNodeName(material.arguments.callId),
    ]),
  );
  const apiResponseContracts = Object.fromEntries(
    materials.map((material) => [
      material.arguments.callId,
      material.operation,
    ]),
  );
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes: delivery.components.flatMap((component) =>
      component.plan === undefined ? [] : component.nativeNodes,
    ),
    capabilities: input.capabilities,
    apiNodeNames,
    apiResponseContracts,
  });
  return materials.map((material, index) =>
    createHttpRequestNode({
      operation: material.operation,
      arguments: material.arguments,
      position: [300, index * 260],
      apiNodeNames,
      apiResponseContracts,
      nativeOutputSources,
    }),
  );
}
