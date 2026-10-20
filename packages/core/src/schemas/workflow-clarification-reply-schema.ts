import { z } from 'zod';
import type { WorkflowClarificationReply } from '../types/workflow-clarification.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';

export const workflowClarificationReplySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('single-choice'),
    questionId: planningEvidenceTextSchema,
    choiceId: planningEvidenceTextSchema,
  }),
  z.strictObject({
    kind: z.literal('multiple-choice'),
    questionId: planningEvidenceTextSchema,
    choiceIds: z.array(planningEvidenceTextSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal('text'),
    questionId: planningEvidenceTextSchema,
    text: planningEvidenceTextSchema,
  }),
  z.strictObject({
    kind: z.literal('defer'),
    questionId: planningEvidenceTextSchema,
  }),
]) satisfies z.ZodType<WorkflowClarificationReply>;

export const workflowClarificationRepliesSchema = z
  .array(workflowClarificationReplySchema)
  .superRefine((replies, context) => {
    if (
      new Set(replies.map((reply) => reply.questionId)).size !== replies.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Clarification replies repeat a question ID',
      });
    for (const [index, reply] of replies.entries())
      if (
        reply.kind === 'multiple-choice' &&
        new Set(reply.choiceIds).size !== reply.choiceIds.length
      )
        context.addIssue({
          code: 'custom',
          path: [index, 'choiceIds'],
          message: 'Selected choices must be distinct',
        });
  });
