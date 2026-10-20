import { z } from 'zod';
import { workflowReviewSuggestionLimitsSchema } from '@openapi-flow/core';
import type { WorkflowDraftConversationReviewSuggestionOptions } from '../types/workflow-draft-conversation.js';

export const draftConversationReviewSuggestionOptionsSchema = z.strictObject({
  limits: workflowReviewSuggestionLimitsSchema,
  includeExtensions: z.boolean().optional(),
}) satisfies z.ZodType<WorkflowDraftConversationReviewSuggestionOptions>;
