import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiBindingPlanningInput,
  ApiBindingPlanProposal,
  ExplainedApiBindingCall,
} from '@openapi-flow/core';

export interface PlanApiBindingsInput extends ApiBindingPlanningInput {
  model: BaseChatModel;
  includeExplanations?: boolean;
}

export interface ExplainedApiBindingPlanOutput extends Omit<
  ApiBindingPlanProposal,
  'calls'
> {
  calls: ExplainedApiBindingCall[];
}
export type ApiBindingPlanOutput =
  ApiBindingPlanProposal | ExplainedApiBindingPlanOutput;
