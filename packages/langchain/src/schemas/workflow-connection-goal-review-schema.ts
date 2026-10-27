import { z } from 'zod';
import { workflowConnectionGoalAssessmentSchema } from '@openapi-flow/core';
import type { WorkflowConnectionGoalReviewDescription } from '@openapi-flow/core';
import type { WorkflowConnectionGoalReviewModelOutput } from '../types/workflow-connection-goal-review.js';

export function createWorkflowConnectionGoalReviewSchema(
  description: WorkflowConnectionGoalReviewDescription,
  validatePresentation = true,
): z.ZodType<WorkflowConnectionGoalReviewModelOutput> {
  const assessment = workflowConnectionGoalAssessmentSchema
    .omit({ factId: true, sourceQuotes: true, explanationStatus: true })
    .extend({
      policyIds:
        workflowConnectionGoalAssessmentSchema.shape.policyIds.describe(
          'Select only supplied code-enforced policy IDs for clauses actually covered by that policy. A protected-edge policy does not prove data semantics or implementation of new connections.',
        ),
      goalIds: z
        .array(z.enum(description.goals.map((goal) => goal.id)))
        .describe(
          'Select only actual candidate goals. An omitted requirement may have no matching goal.',
        ),
      reason: validatePresentation
        ? z
            .string()
            .min(1)
            .describe(
              'Brief evidence-based explanation comparing the entire original requirement with goals and actual mappings. Not private reasoning.',
            )
        : z.unknown().optional(),
    });
  return z.strictObject({
    assessments: z.strictObject(
      Object.fromEntries(
        description.requirements.map((fact) => [
          fact.id,
          assessment.describe(fact.text),
        ]),
      ),
    ),
  });
}
