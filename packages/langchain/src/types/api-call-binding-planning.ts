import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiCallBindingPlanningInput,
  ApiBindingSourceSelection,
  ApiCallBindingPlan,
} from '@openapi-flow/core';
import type { PlanApiBindingsInput } from './binding-planning.js';

export interface SelectApiBindingSourcesInput extends ApiCallBindingPlanningInput {
  model: BaseChatModel;
  signal?: AbortSignal;
}

export interface PlanApiCallBindingsInput extends SelectApiBindingSourcesInput {
  sources: ApiBindingSourceSelection;
}

export interface PlanApiBindingsByCallInput extends PlanApiBindingsInput {
  /** Required host resource budget; it never limits the number of selected APIs. */
  concurrency: number;
  completedCalls?: ApiCallBindingPlan[];
  onCallPlanned?: (result: ApiCallBindingPlan) => void | Promise<void>;
  signal?: AbortSignal;
}
