import { planApiBindings, generateApiArguments } from '@openapi-flow/langchain';
import type {
  ApiBindingPlan,
  ReviewableWorkflowApiMaterial,
} from '@openapi-flow/core';
import type {
  WorkflowState,
  WorkflowUpdate,
  PlannedGraphDependencies,
} from '../../types/workflow-graph.js';
import { createApiBindingMaterials } from '../prepare-api-binding-materials.js';
import { collectSelectionReviewGaps } from './collect-selection-review-gaps.js';
import { collectApiBindingReviewGaps } from './collect-api-binding-review-gaps.js';
import { collectBlockedCallGaps } from './collect-blocked-call-gaps.js';

export async function prepareReviewableApiCalls(
  state: WorkflowState,
  dependencies: PlannedGraphDependencies,
): Promise<WorkflowUpdate> {
  if (!state.contracts || !state.selection)
    throw new Error(
      'review preparation requires resolved contracts and selection',
    );
  const selectionGaps = await collectSelectionReviewGaps(state);
  if (!state.contracts.length)
    return {
      bindingPlan: { calls: [], gaps: [] },
      reviewMaterials: [],
      diagnostics: selectionGaps,
      trace: [...state.trace, 'bindings', 'arguments'],
    };
  const materials = createApiBindingMaterials(state);
  const bindingPlan: ApiBindingPlan = await planApiBindings({
    scenario: state.scenario,
    model: dependencies.model,
    materials,
  });
  await dependencies.reviewBindings?.(bindingPlan);
  const bindingGaps = collectApiBindingReviewGaps({
    workflowId: state.workflowId,
    materials,
    bindingPlan,
  });
  const diagnostics = [...selectionGaps, ...bindingGaps];
  const blocked = collectBlockedCallGaps({
    materials,
    bindingPlan,
    selectionGaps,
    bindingGaps,
  });
  const reviewMaterials: ReviewableWorkflowApiMaterial[] = [];
  for (const material of materials) {
    const call = bindingPlan.calls.find(
      (item) => item.callId === material.callId,
    );
    if (!call)
      throw new Error(`review binding plan is missing ${material.callId}`);
    const gaps = blocked.get(material.callId);
    if (gaps) {
      reviewMaterials.push({
        status: 'blocked',
        callId: material.callId,
        operation: material.operation,
        requestMediaType: material.requestMediaType,
        bindings: call.bindings,
        gapIds: [...gaps],
      });
      continue;
    }
    const args = await generateApiArguments({
      ...material,
      bindings: call.bindings,
      scenario: state.scenario,
      model: dependencies.model,
    });
    if (args.unresolvedInputs.length)
      throw new Error(
        `Request inputs need user clarification: ${JSON.stringify(args.unresolvedInputs)}`,
      );
    reviewMaterials.push({
      status: 'ready',
      operation: material.operation,
      arguments: args,
    });
  }
  return {
    bindingPlan,
    reviewMaterials,
    diagnostics,
    trace: [...state.trace, 'bindings', 'arguments'],
  };
}
