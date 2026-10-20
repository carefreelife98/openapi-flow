import type { CompileBatchedN8nWorkflowInput } from '../../types/batch-execution.js';
import type { N8nCompileResult } from '../../types/workflow-compilation.js';
import { batchExecutionScopesSchema } from '../../schemas/batch-execution-schema.js';
import { compileValidatedWorkflowFragments } from '../compile-validated-workflow-fragments.js';
import { buildN8nWorkflow } from '../build-n8n-workflow.js';
import {
  prepareNativeRuntimeInputs,
  assembleNativeRuntimeInputs,
} from '../inputs/compile-native-runtime-inputs.js';

export function compileBatchedN8nWorkflow(
  input: CompileBatchedN8nWorkflowInput,
): N8nCompileResult {
  const batchScopes = batchExecutionScopesSchema.parse(input.batchScopes);
  const nativeInputs = prepareNativeRuntimeInputs({
    nativeInputs: input.nativeInputs,
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
    apiMaterials: input.materials.map((item) => ({
      callId: item.arguments.callId,
      operation: item.operation,
      requestMediaType: item.arguments.requestMediaType,
    })),
    nativeOutputs: [],
  });
  const graph = {
    id: input.id,
    name: input.name,
    nodes: compileValidatedWorkflowFragments(
      nativeInputs === undefined
        ? input
        : { ...input, capabilities: nativeInputs.capabilities },
    ),
    edges: input.plan.edges,
    starts: input.plan.starts,
    triggerConnections: 'connected' as const,
    annotations: [],
    batchScopes,
  };
  const result =
    nativeInputs === undefined
      ? { workflow: buildN8nWorkflow(graph) }
      : assembleNativeRuntimeInputs({ ...graph, nativeInputs });
  const workflow = result.workflow;
  workflow.settings = { ...workflow.settings, executionOrder: 'v1' };
  return { status: 'complete', ...result };
}
