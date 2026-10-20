import { validateWorkflowGraphPlan } from '@openapi-flow/core';
import type { CompilePlannedN8nWorkflowInput } from '../types/native-capability.js';
import type { N8nNodeFragment } from '../types/node-fragment.js';
import { compileWorkflowMaterialFragments } from './compile-workflow-material-fragments.js';
import { resolveN8nNativeMaterials } from './resolve-n8n-native-materials.js';

export function compileValidatedWorkflowFragments(
  input: CompilePlannedN8nWorkflowInput,
): N8nNodeFragment[] {
  if (input.plan.gaps.length)
    throw new Error(
      `Workflow needs review: ${JSON.stringify(input.plan.gaps)}`,
    );
  const materialSnapshot = resolveN8nNativeMaterials({
    apiMaterials: input.materials.map((material) => ({
      callId: material.arguments.callId,
      operation: material.operation,
      requestMediaType: material.arguments.requestMediaType,
    })),
    nativeOutputs: [],
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
  });
  const current = { ...input, capabilities: materialSnapshot.capabilities };
  validateWorkflowGraphPlan(current);
  return compileWorkflowMaterialFragments(current);
}
