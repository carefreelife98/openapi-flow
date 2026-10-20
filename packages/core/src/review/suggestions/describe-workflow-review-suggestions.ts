import { createHash } from 'node:crypto';
import type {
  WorkflowReviewSuggestionsInput,
  WorkflowReviewSuggestionsDescription,
} from '../../types/workflow-review-suggestions.js';
import {
  workflowReviewBoundarySchema,
  workflowReviewSuggestionLimitsSchema,
  workflowReviewSuggestionOptionsSchema,
} from '../../schemas/workflow-review-suggestion-settings-schema.js';
import { describeWorkflowPlanningContext } from '../../planning/evidence/describe-workflow-planning-context.js';

export function describeWorkflowReviewSuggestions(
  input: WorkflowReviewSuggestionsInput,
): WorkflowReviewSuggestionsDescription {
  const context = describeWorkflowPlanningContext(input.context);
  const boundary = workflowReviewBoundarySchema.parse(input.boundary);
  const limits = workflowReviewSuggestionLimitsSchema.parse(input.limits);
  const options = workflowReviewSuggestionOptionsSchema.parse(
    input.options === undefined ? {} : input.options,
  );
  const described = { context, boundary, limits, options };
  return {
    ...described,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(described))
      .digest('hex'),
  };
}
