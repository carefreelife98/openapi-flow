import { createNativeOutputContracts } from '@openapi-flow/core';
import type { CompileNativeWorkflowNodesInput } from '../types/native-capability.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';
import { compileNativeWorkflowNodes } from './compile-native-workflow-nodes.js';
import { validateCompiledBindingSources } from './validate-compiled-binding-sources.js';

/** Shared SDK material lowering. The owning strict/draft boundary validates the whole topology first. */
export function compileWorkflowMaterialFragments(
  input: CompileNativeWorkflowNodesInput,
): N8nNodeFragment[] {
  const expected = input.materials
    .map((material) => material.arguments.callId)
    .sort();
  const actual = input.apiNodes.map((fragment) => fragment.nodeId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('apiNodes must match material callIds exactly');
  const nativeNodes = compileNativeWorkflowNodes(input);
  validateCompiledBindingSources(
    input.apiNodes,
    nativeNodes,
    createNativeOutputContracts({
      nativeNodes: input.plan.nativeNodes,
      capabilities: input.capabilities,
    }),
    input.materials,
  );
  return [...input.apiNodes, ...nativeNodes];
}
