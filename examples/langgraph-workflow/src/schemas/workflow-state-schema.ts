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
  NativeInstanceSelection,
  NativeInstanceDependencyPlan,
} from '@openapi-flow/core';
import type {
  N8nWorkflowResult,
  N8nNativeInputTemplate,
} from '@openapi-flow/n8n';
import type { HostNativeConfigurationTask } from '../types/native-planning.js';
import type { NativeSelectionPlanningReceipt } from '../types/native-selection-planning.js';
import type {
  ResolvedApiRequestMediaType,
  NativeWorkflowMaterialPlan,
} from '../types/workflow-graph.js';

// These channels carry host/library objects, not model structured-output schemas.
// createApiCatalog validates the source OAS; adapter calls validate proposals.
export const workflowStateSchema = new StateSchema({
  workflowId: z.string().min(1),
  workflowName: z.string().min(1),
  scenario: z.string().min(1),
  sources: z.array(z.custom<ApiSource>()),
  catalog: z.custom<ApiCatalog>().optional(),
  selection: z.custom<ApiSelection>().optional(),
  contracts: z.custom<ApiOperationContract[]>().optional(),
  requestMediaTypes: z.custom<ResolvedApiRequestMediaType[]>().optional(),
  arguments: z.custom<ApiCallArguments[]>().optional(),
  bindingPlan: z.custom<ApiBindingPlan>().optional(),
  graphPlan: z.custom<WorkflowGraphPlan>().optional(),
  workflow: z.custom<N8nWorkflowResult['workflow']>().optional(),
  status: z.enum(['complete', 'needs-review']).optional(),
  diagnostics: z.custom<WorkflowReviewGap[]>().optional(),
  reviewMaterials: z.custom<ReviewableWorkflowApiMaterial[]>().optional(),
  reviewPlan: z.custom<ReviewableWorkflowGraphPlan>().optional(),
  nativePlan: z.custom<NativeWorkflowMaterialPlan>().optional(),
  nativeSelection: z.custom<NativeInstanceSelection>().optional(),
  nativeSelectionPlanning: z
    .custom<NativeSelectionPlanningReceipt>()
    .optional(),
  nativeDependencies: z.custom<NativeInstanceDependencyPlan>().optional(),
  nativeConfigurations: z.custom<HostNativeConfigurationTask[]>().optional(),
  activeNativeNodeId: z.string().optional(),
  nativePlanningStatus: z
    .enum([
      'working',
      'awaiting-input',
      'ready',
      'cancelled',
      'selection-blocked',
    ])
    .optional(),
  nativeReplyIssues: z.array(z.string()).optional(),
  nativeInputTemplate: z.custom<N8nNativeInputTemplate>().optional(),
  trace: z.array(z.string()),
});
