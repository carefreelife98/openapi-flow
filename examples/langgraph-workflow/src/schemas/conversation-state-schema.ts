import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import type {
  ApiSelectionAnalysis,
  ApiInputRequirement,
  ConfirmedApiInput,
  ApiAnswerIssue,
  ApiInputAnswerExtractionRecord,
} from '@openapi-flow/core';
import type { ConversationInputResponse } from '../types/workflow-conversation.js';
import type { PendingApiArguments } from '../types/api-preparation.js';
import { workflowStateSchema } from './workflow-state-schema.js';

export const conversationStateSchema = new StateSchema({
  ...workflowStateSchema.fields,
  selectionAnalysis: z.custom<ApiSelectionAnalysis>().optional(),
  pendingArguments: z.custom<PendingApiArguments[]>().optional(),
  requirements: z.custom<ApiInputRequirement[]>().optional(),
  confirmedInputs: z.custom<ConfirmedApiInput[]>().optional(),
  pendingInputResponse: z.custom<ConversationInputResponse>().optional(),
  inputAnswerIssues: z.custom<ApiAnswerIssue[]>().optional(),
  apiInputAnswerExtractions: z
    .custom<ApiInputAnswerExtractionRecord[]>()
    .optional(),
  operationAnswerErrors: z.array(z.string()).optional(),
  conversationStatus: z
    .enum([
      'working',
      'awaiting-input',
      'cancelled',
      'complete',
      'needs-review',
    ])
    .optional(),
});
