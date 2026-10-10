import { compileNativeWorkflowNodes } from './compile-native-workflow-nodes.js';
import {
  validateWorkflowGraphPlan,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import type { CompilePlannedN8nWorkflowInput } from '../types/native-capability.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';
import { validateCompiledBindingSources } from './validate-compiled-binding-sources.js';

export function compileValidatedWorkflowFragments(
  input: CompilePlannedN8nWorkflowInput,
): N8nNodeFragment[] {
  if (input.plan.gaps.length)
    throw new Error(
      `Workflow needs review: ${JSON.stringify(input.plan.gaps)}`,
    );
  validateWorkflowGraphPlan(input);
  const expectedIds = input.materials
    .map((item) => item.arguments.callId)
    .sort();
  const actualIds = input.apiNodes.map((item) => item.nodeId).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds))
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
