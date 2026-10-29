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
import type { ApiBindingGeneratedKeySelection } from './api-binding-key-generation.js';
import type { ApiCallBindingRejection } from './api-call-binding-rejection.js';

type ApiBindingSourceDecisionBase = z.infer<
  ReturnType<typeof createApiBindingSourceDecisionSchema>
>;
type ApiBindingProvidedSourceKind = {
  kind: 'selected-response-sources' | 'partially-missing-response-sources';
};
type ApiBindingKeySourceDecision = Extract<
  ApiBindingSourceDecisionBase['decision'],
  ApiBindingProvidedSourceKind
> & { keySelections?: ApiBindingGeneratedKeySelection[] };
type ApiBindingIndependentSourceDecision = Exclude<
  ApiBindingSourceDecisionBase['decision'],
  ApiBindingProvidedSourceKind
> & { keySelections?: never };
export type ApiBindingSourceDecisionOutput = Omit<
  ApiBindingSourceDecisionBase,
  'decision'
> & {
  decision: ApiBindingKeySourceDecision | ApiBindingIndependentSourceDecision;
} & Pick<ApiBindingSourceProposal, 'reason'>;

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
