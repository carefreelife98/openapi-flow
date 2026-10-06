import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import type {
  ApiSource,
  ApiCatalog,
  ApiSelection,
  ApiOperationContract,
  ApiCallArguments,
  WorkflowGraphPlan,
  ApiBindingPlan,
  WorkflowReviewGap,
  ReviewableWorkflowApiMaterial,
  ReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import type { N8nWorkflowResult } from '@openapi-flow/n8n';

// These channels carry host/library objects, not model structured-output schemas.
// createApiCatalog validates the source OAS; adapter calls validate proposals.
export const workflowStateSchema = new StateSchema({
  workflowId: z.string().min(1),
  workflowName: z.string().min(1),
  scenario: z.string().min(1),
  sources: z.array(z.custom<ApiSource>()).min(1),
  catalog: z.custom<ApiCatalog>().optional(),
  selection: z.custom<ApiSelection>().optional(),
  contracts: z.custom<ApiOperationContract[]>().optional(),
  arguments: z.custom<ApiCallArguments[]>().optional(),
  bindingPlan: z.custom<ApiBindingPlan>().optional(),
  graphPlan: z.custom<WorkflowGraphPlan>().optional(),
  workflow: z.custom<N8nWorkflowResult['workflow']>().optional(),
  status: z.enum(['complete', 'needs-review']).optional(),
  diagnostics: z.custom<WorkflowReviewGap[]>().optional(),
  reviewMaterials: z.custom<ReviewableWorkflowApiMaterial[]>().optional(),
  reviewPlan: z.custom<ReviewableWorkflowGraphPlan>().optional(),
  trace: z.array(z.string()),
});
