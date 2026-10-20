import { z } from 'zod';
import type {
  WorkflowReviewSuggestionsDescription,
  WorkflowReviewSuggestionsProposal,
  ProposedWorkflowReviewSuggestion,
} from '../types/workflow-review-suggestions.js';
import {
  workflowReviewBoundarySchema,
  workflowReviewSuggestionLimitsSchema,
  workflowReviewSuggestionOptionsSchema,
} from './workflow-review-suggestion-settings-schema.js';

/** Only user-facing proposed messages and actual source choices are model-owned. */
export function createWorkflowReviewSuggestionsProposalSchema<Evidence>(
  description: WorkflowReviewSuggestionsDescription,
  evidenceSchema: z.ZodType<Evidence>,
): z.ZodType<WorkflowReviewSuggestionsProposal<Evidence>> {
  workflowReviewBoundarySchema.parse(description.boundary);
  workflowReviewSuggestionLimitsSchema.parse(description.limits);
  workflowReviewSuggestionOptionsSchema.parse(description.options);
  const fields = {
    text: z
      .string()
      .refine((text) => text.trim().length > 0)
      .describe(
        'A concrete message the user may explicitly adopt. Not a confirmed instruction, a workflow, a value default or a credential.',
      ),
    sources: z.array(evidenceSchema).min(1),
    ...(description.options.includeExplanations
      ? {
          reason: z
            .string()
            .min(1)
            .describe(
              'Concise user-facing reason and relevance, not private chain-of-thought.',
            ),
        }
      : {}),
  };
  const choices: z.ZodType[] = [
    z.strictObject({ kind: z.literal('change-request'), ...fields }),
  ];
  if (description.options.includeExtensions)
    choices.push(
      z.strictObject({ kind: z.literal('extend-workflow'), ...fields }),
    );
  if (description.boundary.questions.length)
    choices.push(
      z.strictObject({
        kind: z.literal('answer-question'),
        questionIds: z
          .array(
            z.enum(
              description.boundary.questions.map((question) => question.id),
            ),
          )
          .min(1)
          .refine((ids) => new Set(ids).size === ids.length),
        ...fields,
      }),
    );
  const suggestion = z.union(choices) as z.ZodType<
    ProposedWorkflowReviewSuggestion<Evidence>
  >;
  return z.strictObject({
    suggestions: z
      .array(suggestion)
      .max(description.limits.maxSuggestions)
      .refine(
        (items) =>
          new Set(items.map((item) => item.text)).size === items.length,
      )
      .describe(
        'Return only useful grounded options; [] is valid. Never regenerate review identities, questions, facts, approval or readiness.',
      ),
  }) as z.ZodType<WorkflowReviewSuggestionsProposal<Evidence>>;
}
