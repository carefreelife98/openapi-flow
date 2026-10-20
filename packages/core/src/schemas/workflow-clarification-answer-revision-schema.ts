import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { workflowClarificationReplySchema } from './workflow-clarification-reply-schema.js';
import type { WorkflowClarificationAnswerChange } from '../types/workflow-clarification-answer-revision.js';

export const workflowClarificationAnswerChangeSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({
      kind: z.literal('replace-answer'),
      reply: workflowClarificationReplySchema,
    }),
    z.strictObject({
      kind: z.literal('reopen-question'),
      questionId: planningEvidenceTextSchema,
    }),
  ],
) satisfies z.ZodType<WorkflowClarificationAnswerChange>;

export const workflowClarificationAnswerChangesSchema = z
  .array(workflowClarificationAnswerChangeSchema)
  .min(1)
  .superRefine((changes, context) => {
    const ids = changes.map((change) =>
      change.kind === 'replace-answer'
        ? change.reply.questionId
        : change.questionId,
    );
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        message: 'Clarification answer changes repeat a question ID',
      });
  });
