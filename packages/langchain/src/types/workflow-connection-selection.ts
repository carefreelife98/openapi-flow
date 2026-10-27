import type { z } from 'zod';
import type { createWorkflowConnectionSelectionSchema } from '../schemas/workflow-connection-selection-schema.js';
import type {
  WorkflowConnectionProposal,
  BlockedWorkflowCall,
  WorkflowPlanEdge,
} from '@openapi-flow/core';

export type WorkflowConnectionSelectionOutput = z.infer<
  ReturnType<typeof createWorkflowConnectionSelectionSchema>
>;

export type WorkflowConnectionExecutionEdge = Omit<
  WorkflowConnectionSelectionOutput['edges'][number],
  'reason'
> & { reason?: unknown };
export type WorkflowConnectionExecutionBlockedCall = BlockedWorkflowCall & {
  reason?: unknown;
};
export interface WorkflowConnectionExecutionOutput extends Omit<
  WorkflowConnectionProposal,
  'edges' | 'blockedCalls'
> {
  reason?: unknown;
  edges: WorkflowConnectionExecutionEdge[];
  blockedCalls?: WorkflowConnectionExecutionBlockedCall[];
}

export type ResolvedWorkflowConnectionSelectionEdge = WorkflowPlanEdge &
  Pick<WorkflowConnectionExecutionEdge, 'reason'>;
export interface ResolvedWorkflowConnectionSelection extends Omit<
  WorkflowConnectionExecutionOutput,
  'edges'
> {
  edges: ResolvedWorkflowConnectionSelectionEdge[];
}
