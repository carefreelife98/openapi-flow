import { z } from 'zod';
import type { WorkflowDraftApiBindingAnswer } from '../types/workflow-draft-api-binding-clarification.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';

export const workflowDraftApiBindingAnswerSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({
      kind: z.literal('choose-source'),
      questionId: planningEvidenceTextSchema,
      choiceId: planningEvidenceTextSchema,
    }),
    z.strictObject({
      kind: z.literal('bind-source'),
      questionId: planningEvidenceTextSchema,
      sourceNodeId: planningEvidenceTextSchema,
      sourcePointer: z.string(),
    }),
    z.strictObject({
      kind: z.literal('no-binding'),
      questionId: planningEvidenceTextSchema,
    }),
  ],
) satisfies z.ZodType<WorkflowDraftApiBindingAnswer>;

export const workflowDraftApiBindingAnswersSchema = z
  .array(workflowDraftApiBindingAnswerSchema)
  .min(1)
  .refine(
    (answers) =>
      new Set(answers.map((answer) => answer.questionId)).size ===
      answers.length,
    'Binding answers must identify distinct current questions',
  );
