import { z } from 'zod';
import { workflowConnectionGoalAssessmentSchema } from '@openapi-flow/core';
import type { WorkflowConnectionGoalReviewDescription } from '@openapi-flow/core';
import type { WorkflowConnectionGoalReviewModelOutput } from '../types/workflow-connection-goal-review.js';

export function createWorkflowConnectionGoalReviewSchema(
  description: WorkflowConnectionGoalReviewDescription,
): z.ZodType<WorkflowConnectionGoalReviewModelOutput> {
  const assessment = workflowConnectionGoalAssessmentSchema
    .omit({ factId: true })
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
      sourceQuotes: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          'Exact unchanged quotes from THIS original requirement, including any missing or contradicted clause.',
        ),
      reason: z
        .string()
        .min(1)
        .describe(
          'Brief evidence-based explanation comparing the entire original requirement with goals and actual mappings. Not private reasoning.',
        ),
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
