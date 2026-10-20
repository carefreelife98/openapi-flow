import type { ReviewableWorkflowApiMaterial } from './reviewable-workflow.js';

export interface WorkflowApiInputDeferral {
  /** Exact current OAS-derived input slot IDs explicitly deferred by the caller. */
  deferredApiInputIds?: string[];
}

export interface WorkflowApiInputReadinessInput extends WorkflowApiInputDeferral {
  materials: ReviewableWorkflowApiMaterial[];
}
