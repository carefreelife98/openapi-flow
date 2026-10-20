import { z } from 'zod';
import { clarificationQuestionLimitsSchema } from '@openapi-flow/core';
import type { WorkflowDraftConversationClarificationOptions } from '../types/workflow-draft-conversation.js';

export const draftConversationClarificationOptionsSchema: z.ZodType<WorkflowDraftConversationClarificationOptions> =
  z.strictObject({
    limits: clarificationQuestionLimitsSchema,
    includeSuggestions: z.boolean().optional(),
  });
