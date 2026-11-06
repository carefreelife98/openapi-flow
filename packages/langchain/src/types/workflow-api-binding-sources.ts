import type { PlanApiBindingsInput } from './binding-planning.js';
import type { ApiBindingSourceDecisionOutput } from './api-call-binding-planning.js';

export interface SelectWorkflowApiBindingSourcesInput extends PlanApiBindingsInput {
  signal?: AbortSignal;
  callIds?: string[];
}
export interface WorkflowApiBindingSourceDecisionOutput {
  calls: Record<string, ApiBindingSourceDecisionOutput>;
}
