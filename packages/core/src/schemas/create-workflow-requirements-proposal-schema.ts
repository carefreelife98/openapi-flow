import { z } from 'zod';
import type {
  ClarificationQuestionLimits,
  ResolvedWorkflowClarificationOptions,
  WorkflowRequirementsProposal,
} from '../types/workflow-clarification.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';
import { clarificationQuestionLimitsSchema } from './workflow-clarification-settings-schema.js';
import {
  createPlanningEvidenceTextSchema,
  workflowMessageEvidenceSchema,
} from './planning-evidence-schema.js';

/** Reusable described shape; model references and canonical evidence use different schemas. */
export function createWorkflowRequirementsProposalSchema<Evidence>(
  configuredLimits: ClarificationQuestionLimits,
  options: ResolvedWorkflowClarificationOptions,
  evidenceSchema: z.ZodType<Evidence>,
  messageEvidenceSchema: z.ZodType<WorkflowMessageEvidence> = workflowMessageEvidenceSchema,
): z.ZodType<WorkflowRequirementsProposal<Evidence>> {
  const limits = clarificationQuestionLimitsSchema.parse(configuredLimits);
  const explanation = options.includeExplanations
    ? {
        explanation: z.strictObject({
          reason: createPlanningEvidenceTextSchema().describe(
            'A short user-facing justification, not private chain-of-thought.',
          ),
          evidence: z
            .array(evidenceSchema)
            .min(1)
            .describe(
              'Only supplied, checkable sources supporting this decision.',
            ),
        }),
      }
    : {};
  const choices = z
    .array(
      z.strictObject({
        label: createPlanningEvidenceTextSchema().describe(
          'A distinct meaningful alternative the user can explicitly adopt.',
        ),
        ...explanation,
      }),
    )
    .min(1)
    .max(limits.maxChoicesPerQuestion);
  // Literal kinds are mutually exclusive, so a union retains the same contract
  // while exporting the anyOf form accepted by structured-output providers.
  const answer = z.union([
    z.strictObject({ kind: z.literal('text') }),
    z.strictObject({ kind: z.literal('single-choice'), choices }),
    z.strictObject({ kind: z.literal('multiple-choice'), choices }),
  ]);
  return z
    .strictObject({
      statements: z.array(
        z.strictObject({
          text: createPlanningEvidenceTextSchema().describe(
            'A requirement explicitly supported by the supplied user messages. Do not add inferred related work or business defaults.',
          ),
          sources: z
            .array(messageEvidenceSchema)
            .min(1)
            .describe(
              'Exact user-message quotations supporting the stated requirement.',
            ),
          ...explanation,
        }),
      ),
      categories: z
        .array(
          z.strictObject({
            title: createPlanningEvidenceTextSchema().describe(
              'A request-specific grouping, not a fixed business taxonomy.',
            ),
            questions: z
              .array(
                z.strictObject({
                  message: createPlanningEvidenceTextSchema().describe(
                    'Ask only a consequential unresolved semantic choice. Missing concrete runtime values become input slots later, not mandatory questions here.',
                  ),
                  answer,
                  ...explanation,
                }),
              )
              .min(1)
              .max(limits.maxQuestionsPerCategory),
            ...explanation,
          }),
        )
        .max(limits.maxCategories)
        .describe(
          'Return [] when the user intent is sufficiently clear; never create empty categories.',
        ),
      ...(options.includeSuggestions
        ? {
            suggestions: z.array(
              z.strictObject({
                text: createPlanningEvidenceTextSchema().describe(
                  'Optional follow-up or related business extension. It is not a confirmed requirement and must not change scope before explicit adoption.',
                ),
                ...explanation,
              }),
            ),
          }
        : {}),
    })
    .superRefine((proposal, context) => {
      if (
        proposal.categories.reduce(
          (sum, category) => sum + category.questions.length,
          0,
        ) > limits.maxQuestionsPerRound
      )
        context.addIssue({
          code: 'custom',
          path: ['categories'],
          message: `Question count exceeds maxQuestionsPerRound ${limits.maxQuestionsPerRound}`,
        });
      const questionMessages = proposal.categories.flatMap((category) =>
        category.questions.map((question) => question.message),
      );
      if (new Set(questionMessages).size !== questionMessages.length)
        context.addIssue({
          code: 'custom',
          path: ['categories'],
          message: 'Questions must be distinct within a round',
        });
      for (const [categoryIndex, category] of proposal.categories.entries())
        for (const [questionIndex, question] of category.questions.entries()) {
          if (question.answer.kind === 'text') continue;
          if (
            new Set(question.answer.choices.map((choice) => choice.label))
              .size !== question.answer.choices.length
          )
            context.addIssue({
              code: 'custom',
              path: [
                'categories',
                categoryIndex,
                'questions',
                questionIndex,
                'answer',
                'choices',
              ],
              message: 'Choice labels must be distinct',
            });
        }
      if (!proposal.statements.length && !questionMessages.length)
        context.addIssue({
          code: 'custom',
          message:
            'A requirements analysis must state a user-grounded requirement or ask a question',
        });
    }) as z.ZodType<WorkflowRequirementsProposal<Evidence>>;
}
