import { z } from 'zod';
import { draftConversationMessageSchema } from './workflow-draft-conversation-input-schema.js';
import {
  workflowClarificationRepliesSchema,
  workflowClarificationAnswerChangesSchema,
  workflowDraftApiBindingAnswersSchema,
} from '@openapi-flow/core';

export const draftConversationResponseSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('reply-inputs'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    text: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal('answer-api-bindings'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    answers: workflowDraftApiBindingAnswersSchema,
  }),
  z.strictObject({
    action: z.literal('revise-clarification'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    changes: workflowClarificationAnswerChangesSchema,
  }),
  z.strictObject({
    action: z.literal('adopt-suggestion'),
    token: z.string().min(1),
    reviewId: z.string().min(1),
    suggestionId: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
  }),
  z.strictObject({
    action: z.literal('answer-clarification'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    replies: workflowClarificationRepliesSchema.refine(
      (replies) => replies.length > 0,
    ),
  }),
  z.strictObject({ action: z.literal('approve'), token: z.string().min(1) }),
  z.strictObject({
    action: z.literal('revise'),
    token: z.string().min(1),
    message: draftConversationMessageSchema,
  }),
  z.strictObject({ action: z.literal('cancel'), token: z.string().min(1) }),
  z.strictObject({
    action: z.literal('answer-inputs'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    answers: z
      .array(
        z.strictObject({ requirementId: z.string().min(1), value: z.json() }),
      )
      .min(1),
  }),
  z.strictObject({
    action: z.literal('answer-requirement'),
    token: z.string().min(1),
    messageId: z.string().refine((id) => id.trim().length > 0),
    stepId: z.string().min(1),
    requirement: z.strictObject({
      text: z.string().refine((text) => text.trim().length > 0),
      state: z.enum(['confirmed', 'needs-clarification', 'deferred']),
      scope: z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('workflow') }),
        z.strictObject({
          kind: z.literal('nodes'),
          nodeIds: z
            .array(z.string().min(1))
            .min(1)
            .refine((ids) => new Set(ids).size === ids.length),
        }),
      ]),
    }),
  }),
]);
