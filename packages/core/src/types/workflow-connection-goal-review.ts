import type { z } from 'zod';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionGoalPlanningDescription,
} from './workflow-connection-session.js';
import type { WorkflowConnectionConflictMaterials } from './workflow-connection-material-repair.js';
import type {
  WorkflowPlanNodeContract,
  WorkflowPlanEdge,
} from './workflow-plan.js';
import type {
  workflowConnectionGoalReviewSchema,
  workflowConnectionGoalReviewProposalSchema,
  workflowReviewedGoalCandidateSchema,
  workflowConnectionGoalReviewPolicySchema,
} from '../schemas/workflow-connection-goal-review-schema.js';

export type WorkflowConnectionGoalReview = z.infer<
  typeof workflowConnectionGoalReviewSchema
>;
export type WorkflowConnectionGoalReviewProposal = z.infer<
  typeof workflowConnectionGoalReviewProposalSchema
>;
export type WorkflowReviewedGoalCandidate = z.infer<
  typeof workflowReviewedGoalCandidateSchema
>;
export type WorkflowConnectionGoalReviewPolicyId = z.infer<
  typeof workflowConnectionGoalReviewPolicySchema
>;
export interface WorkflowConnectionGoalReviewPolicy {
  id: WorkflowConnectionGoalReviewPolicyId;
  protectedEdges: WorkflowPlanEdge[];
  enforcement: 'core-atomic-connection-validation';
}
export interface WorkflowConnectionGoalReviewDescription extends Pick<
  WorkflowConnectionGoalPlanningDescription,
  'sourceFingerprint' | 'requirements' | 'apiOperations'
> {
  scope: 'initial-goal-interpretation-before-connection-planning';
  sessionId: string;
  goalFingerprint: string;
  goals: WorkflowConnectionSessionInput['session']['goals'];
  materials: WorkflowConnectionConflictMaterials;
  nodeContracts: WorkflowPlanNodeContract[];
  codePolicies: WorkflowConnectionGoalReviewPolicy[];
}
export interface CreateWorkflowConnectionGoalReviewInput extends WorkflowConnectionSessionInput {
  proposal: WorkflowConnectionGoalReviewProposal;
}
export interface ValidateWorkflowConnectionGoalReviewInput extends WorkflowConnectionSessionInput {
  review: WorkflowConnectionGoalReview;
}
