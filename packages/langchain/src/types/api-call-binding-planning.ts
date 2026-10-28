import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { createApiBindingSourceDecisionSchema } from '../schemas/api-call-binding-plan-schema.js';
import type {
  ApiCallBindingPlanningInput,
  ApiBindingSourceSelection,
  ApiCallBindingPlan,
  ApiBindingSourceProposal,
  WorkflowConnectionApiRepairContext,
} from '@openapi-flow/core';
import type { PlanApiBindingsInput } from './binding-planning.js';
import type { ApiCallBindingRejection } from './api-call-binding-rejection.js';

export type ApiBindingSourceDecisionOutput = z.infer<
  ReturnType<typeof createApiBindingSourceDecisionSchema>
> &
  Pick<ApiBindingSourceProposal, 'reason'>;

export interface SelectApiBindingSourcesInput extends ApiCallBindingPlanningInput {
  model: BaseChatModel;
  signal?: AbortSignal;
  materialRepair?: WorkflowConnectionApiRepairContext;
}

export interface PlanApiCallBindingsInput extends SelectApiBindingSourcesInput {
  sources: ApiBindingSourceSelection;
  /** Host-owned bounded repair; never append these diagnostics to the user scenario. */
  rejectedProposals?: ApiCallBindingRejection[];
}

export interface PlanApiBindingsByCallInput extends PlanApiBindingsInput {
  /** Required host resource budget; it never limits the number of selected APIs. */
  concurrency: number;
  completedCalls?: ApiCallBindingPlan[];
  onCallPlanned?: (result: ApiCallBindingPlan) => void | Promise<void>;
  signal?: AbortSignal;
}
