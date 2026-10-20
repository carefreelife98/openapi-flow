import type {
  ApiCallArguments,
  ApiOperationContract,
  ApiBindingPlan,
  ApiInputRequirement,
  ReviewableWorkflowApiMaterial,
  WorkflowReviewGap,
} from '@openapi-flow/core';

export interface PendingApiArguments {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  purpose?: string;
}

export type ApiLiteralInputMode = 'scenario' | 'confirmed-only';

export interface PreparedApiMaterials {
  bindingPlan: ApiBindingPlan;
  reviewMaterials: ReviewableWorkflowApiMaterial[];
  diagnostics: WorkflowReviewGap[];
  pendingArguments: PendingApiArguments[];
  requirements: ApiInputRequirement[];
  trace: string[];
}
