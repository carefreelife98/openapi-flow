import type {
  ApiSelection,
  ApiBindingPlan,
  ApiBindingMaterial,
  WorkflowReviewGap,
} from '@openapi-flow/core';
import type { WorkflowState, WorkflowUpdate } from './workflow-graph.js';

export type SelectionGapHandler = (
  state: WorkflowState,
  selection: ApiSelection,
) => Promise<WorkflowUpdate>;
export interface CollectApiBindingReviewGapsInput {
  workflowId: string;
  materials: ApiBindingMaterial[];
  bindingPlan: ApiBindingPlan;
}

export interface CollectBlockedCallGapsInput {
  materials: ApiBindingMaterial[];
  bindingPlan: ApiBindingPlan;
  selectionGaps: WorkflowReviewGap[];
  bindingGaps: WorkflowReviewGap[];
}
