import type { z } from 'zod';
import type { workflowConnectionProposalAttemptSchema } from '../schemas/workflow-connection-proposal-attempt-schema.js';
import type { WorkflowConnectionSessionInput } from '@openapi-flow/core';
export type WorkflowConnectionProposalAttempt = z.infer<
  typeof workflowConnectionProposalAttemptSchema
>;
export type WorkflowConnectionProposalContext = Pick<
  WorkflowConnectionProposalAttempt,
  'id' | 'expected'
>;
export interface CreateWorkflowConnectionProposalAttemptInput extends WorkflowConnectionProposalContext {
  output: unknown;
}
export interface CreateWorkflowConnectionStepRejectionInput extends WorkflowConnectionSessionInput {
  error: unknown;
}
