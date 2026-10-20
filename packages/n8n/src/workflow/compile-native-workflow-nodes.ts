import type { CompileNativeWorkflowNodesInput } from '../types/native-capability.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';
import { resolveN8nNativeMaterials } from './resolve-n8n-native-materials.js';
import { compileNativeMaterialFragments } from './compile-native-material-fragments.js';
import { findSingletonApiResponses } from './find-singleton-api-responses.js';

export function compileNativeWorkflowNodes(
  input: CompileNativeWorkflowNodesInput,
): N8nNodeFragment[] {
  const apiMaterials = input.materials.map((item) => ({
    callId: item.arguments.callId,
    operation: item.operation,
    requestMediaType: item.arguments.requestMediaType,
  }));
  const materials = resolveN8nNativeMaterials({
    apiMaterials,
    nativeOutputs: [],
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
  });
  return compileNativeMaterialFragments({
    nativeNodes: input.plan.nativeNodes,
    materials,
    apiMaterials,
    apiNodeNames: Object.fromEntries(
      input.apiNodes.map((item) => [item.nodeId, item.exit.name]),
    ),
    singletonApiResponseIds: findSingletonApiResponses(input),
    externalNativeOutputSources: [],
    nodeIds: input.plan.nativeNodes.map((node) => node.id),
  }).fragments;
}
