import { z } from 'zod';
import {
  createWorkflowReviewSuggestionFieldsSchema,
  createWorkflowReviewChoiceSuggestionSchema,
} from '@openapi-flow/core';
import type { WorkflowReviewSuggestionsDescription } from '@openapi-flow/core';
import type {
  ProposedWorkflowReviewSuggestionEvidence,
  WorkflowReviewSuggestionsModelOutput,
} from '../types/workflow-review-suggestions.js';
import { createWorkflowPlanningEvidenceSchemas } from './workflow-planning-evidence-schemas.js';

export function createWorkflowReviewSuggestionsSchema(
  description: WorkflowReviewSuggestionsDescription,
  candidateIds: string[],
) {
  const original = createWorkflowPlanningEvidenceSchemas(
    description.context,
    candidateIds,
    description.context.messages.map((message) => message.id),
  );
  const evidence: z.ZodType<ProposedWorkflowReviewSuggestionEvidence> = z.union(
    [
      original.evidence,
      ...(description.boundary.questions.length
        ? [
            z.strictObject({
              kind: z.literal('review-question'),
              questionId: z.enum(
                description.boundary.questions.map((question) => question.id),
              ),
            }),
          ]
        : []),
    ],
  );
  const fields = createWorkflowReviewSuggestionFieldsSchema(
    description.options,
    evidence,
  ).shape;
  const variants: z.ZodType[] = [
    z.strictObject({ kind: z.literal('change-request'), ...fields }),
  ];
  if (description.options.includeExtensions)
    variants.push(
      z.strictObject({ kind: z.literal('extend-workflow'), ...fields }),
    );
  const unstructured = description.boundary.questions.filter(
    (question) => question.answer === undefined,
  );
  if (unstructured.length)
    variants.push(
      z.strictObject({
        kind: z.literal('answer-question'),
        questionIds: z
          .array(z.enum(unstructured.map((question) => question.id)))
          .min(1)
          .refine((ids) => new Set(ids).size === ids.length),
        ...fields,
      }),
    );
  for (const question of description.boundary.questions)
    if (question.answer !== undefined)
      variants.push(
        createWorkflowReviewChoiceSuggestionSchema(
          question,
          description.options.includeExplanations,
        ),
      );
  return z.strictObject({
    suggestions: z
      .array(z.union(variants))
      .max(description.limits.maxSuggestions),
  }) as z.ZodType<WorkflowReviewSuggestionsModelOutput>;
}
