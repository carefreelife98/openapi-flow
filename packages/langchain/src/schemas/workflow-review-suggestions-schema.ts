import { z } from 'zod';
import { createWorkflowReviewSuggestionsProposalSchema } from '@openapi-flow/core';
import type { WorkflowReviewSuggestionsDescription } from '@openapi-flow/core';
import type { ProposedWorkflowReviewSuggestionEvidence } from '../types/workflow-review-suggestions.js';
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
  return createWorkflowReviewSuggestionsProposalSchema(description, evidence);
}
