import type { CompilePlannedN8nWorkflowInput } from '../types/native-capability.js';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import type { N8nCompileResult } from '../types/workflow-compilation.js';
import { assembleN8nWorkflow } from './assemble-n8n-workflow.js';
import { compileValidatedWorkflowFragments } from './compile-validated-workflow-fragments.js';
import {
  prepareNativeRuntimeInputs,
  assembleNativeRuntimeInputs,
} from './inputs/compile-native-runtime-inputs.js';

export function compilePlannedN8nWorkflow(
  input: CompilePlannedN8nWorkflowInput,
): N8nCompileResult {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'compilePlannedN8nWorkflow',
      stage: 'compilation',
      code: 'N8N_COMPILATION_FAILED',
    },
    () => compilePlannedN8nWorkflowSource(input),
  );
}

function compilePlannedN8nWorkflowSource(
  input: CompilePlannedN8nWorkflowInput,
): N8nCompileResult {
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
  const nodes = compileValidatedWorkflowFragments(
    nativeInputs === undefined
      ? input
      : { ...input, capabilities: nativeInputs.capabilities },
  );
  const graph = {
    id: input.id,
    name: input.name,
    nodes,
    edges: input.plan.edges,
    starts: input.plan.starts,
  };
  const result: N8nCompileResult =
    nativeInputs === undefined
      ? assembleN8nWorkflow(graph)
      : {
          status: 'complete',
          ...assembleNativeRuntimeInputs({
            ...graph,
            nativeInputs,
            triggerConnections: 'connected',
            annotations: [],
          }),
        };
  result.workflow.settings = {
    ...result.workflow.settings,
    executionOrder: 'v1',
  };
  return result;
}
