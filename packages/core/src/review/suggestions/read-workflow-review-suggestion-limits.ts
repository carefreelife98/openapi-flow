import type {
  WorkflowReviewSuggestionEnvironment,
  WorkflowReviewSuggestionLimits,
} from '../../types/workflow-review-suggestions.js';
import { workflowReviewSuggestionLimitsSchema } from '../../schemas/workflow-review-suggestion-settings-schema.js';

export function readWorkflowReviewSuggestionLimits(
  environment: WorkflowReviewSuggestionEnvironment,
): WorkflowReviewSuggestionLimits {
  const name = 'OPENAPI_FLOW_REVIEW_MAX_SUGGESTIONS';
  const value = environment[name];
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw new Error(`${name} must explicitly provide a positive integer`);
  return workflowReviewSuggestionLimitsSchema.parse({
    maxSuggestions: Number(value),
  });
}
