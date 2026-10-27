import type { z } from 'zod';
import type {
  workflowConnectionOutlineBundleProposalSchema,
  workflowConnectionOutlineProposalSchema,
  workflowConnectionOutlineSchema,
} from '../schemas/workflow-connection-outline-schema.js';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionStepDescription,
  ApplyWorkflowConnectionStepInput,
} from './workflow-connection-session.js';
import type { WorkflowPlanEdge } from './workflow-plan.js';

export type WorkflowConnectionOutlineBundleProposal = z.infer<
  typeof workflowConnectionOutlineBundleProposalSchema
>;
export type WorkflowConnectionOutlineProposal = z.infer<
  typeof workflowConnectionOutlineProposalSchema
>;
export type WorkflowConnectionOutline = z.infer<
  typeof workflowConnectionOutlineSchema
>;
export interface CreateWorkflowConnectionOutlineInput extends WorkflowConnectionSessionInput {
  proposal: WorkflowConnectionOutlineProposal;
}
export interface WorkflowConnectionOutlineInput extends WorkflowConnectionSessionInput {
  outline: WorkflowConnectionOutline;
}
export interface WorkflowConnectionOutlineBundleInput extends WorkflowConnectionOutlineInput {
  bundleId: string;
}
export interface WorkflowConnectionOutlineBundleStatus {
  bundleId: string;
  pendingNodeIds: string[];
  unmetGoalIds: string[];
  openBoundaries: WorkflowConnectionStepDescription['inspection']['openBoundaries'];
  pending: boolean;
}
export interface WorkflowConnectionOutlineDescription {
  outline: WorkflowConnectionOutline;
  step: WorkflowConnectionStepDescription;
  bundles: WorkflowConnectionOutlineBundleStatus[];
}
export interface WorkflowConnectionOutlineBundleDescription extends WorkflowConnectionOutlineDescription {
  bundle: WorkflowConnectionOutline['bundles'][number];
  requiredProducerIds: string[];
  crossingEdges: WorkflowPlanEdge[];
}
export interface ApplyWorkflowConnectionOutlineStepInput extends ApplyWorkflowConnectionStepInput {
  outline: WorkflowConnectionOutline;
  bundleId: string;
}
