import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { workflowConnectionOutlineRejectionSchema } from '../schemas/workflow-connection-outline-rejection-schema.js';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionOutline,
  WorkflowConnectionStepDescription,
} from '@openapi-flow/core';

export interface WorkflowConnectionOutlineRequestInput extends WorkflowConnectionSessionInput {
  /** A revisable grouping hypothesis, never replacement user requirements or execution edges. */
  previousOutline?: WorkflowConnectionOutline;
}
export interface WorkflowConnectionOutlineRequestDescription {
  description: WorkflowConnectionStepDescription;
  previousOutline?: WorkflowConnectionOutline;
  requestFingerprint: string;
}
export type WorkflowConnectionOutlineRejection = z.infer<
  typeof workflowConnectionOutlineRejectionSchema
>;
export interface CreateWorkflowConnectionOutlineRejectionInput extends WorkflowConnectionOutlineRequestInput {
  error: unknown;
}
export interface PlanWorkflowConnectionOutlineInput extends WorkflowConnectionOutlineRequestInput {
  model: BaseChatModel;
  signal?: AbortSignal;
  rejectedProposals?: WorkflowConnectionOutlineRejection[];
}
