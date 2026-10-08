import {
  compileReviewableN8nWorkflow,
  createHttpRequestNode,
  createN8nNativeOutputSources,
} from '@openapi-flow/n8n';
import type { ReadyWorkflowApiMaterial } from '@openapi-flow/core';
import type {
  WorkflowState,
  WorkflowUpdate,
  PlannedGraphDependencies,
} from '../../types/workflow-graph.js';

export function compileReviewableWorkflowStage(
  state: WorkflowState,
  dependencies: PlannedGraphDependencies,
): WorkflowUpdate {
  if (!state.reviewPlan || !state.reviewMaterials)
    throw new Error('review compilation requires plan and materials');
  const blocked = new Set(
    state.reviewPlan.blockedCalls.map((item) => item.callId),
  );
  const ready = state.reviewMaterials.filter(
    (item): item is ReadyWorkflowApiMaterial =>
      item.status === 'ready' && !blocked.has(item.arguments.callId),
  );
  const names = Object.fromEntries(
    ready.map((item) => [
      item.arguments.callId,
      'Request ' + item.arguments.callId,
    ]),
  );
  const nativeOutputSources = createN8nNativeOutputSources({
    nativeNodes: state.reviewPlan.nativeNodes,
    capabilities: dependencies.capabilities,
    apiNodeNames: names,
  });
  const apiNodes = ready.map((item, index) => {
    const deployment = dependencies.deployments?.find(
      (deployment) => deployment.documentId === item.operation.key.documentId,
    );
    return createHttpRequestNode({
      operation: item.operation,
      arguments: item.arguments,
      baseUrl: deployment?.baseUrl,
      credentialBindings: deployment?.credentialBindings,
      securityRequirementIndex: deployment?.securityRequirementIndex,
      apiNodeNames: names,
      nativeOutputSources,
      position: [300, index * 200],
    });
  });
  const result = compileReviewableN8nWorkflow({
    id: state.workflowId,
    name: state.workflowName,
    plan: state.reviewPlan,
    materials: state.reviewMaterials,
    apiNodes,
    capabilities: dependencies.capabilities,
  });
  return { ...result, trace: [...state.trace, 'compile'] };
}
