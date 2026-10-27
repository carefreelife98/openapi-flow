import type {
  WorkflowConnectionSession,
  WorkflowConnectionSourceRepairRequest,
  WorkflowConnectionMaterialRepairRequest,
  WorkflowConnectionGoalPlanningDescription,
  WorkflowConnectionConflictMaterials,
  WorkflowReviewedGoalCandidate,
} from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionGoalsInput,
  WorkflowConnectionGoalRejection,
  WorkflowConnectionGoalSelection,
} from './incremental-connection-planning.js';

export interface PlanWorkflowConnectionGoalRecoveryInput extends PlanWorkflowConnectionGoalsInput {
  rejectedProposals: WorkflowConnectionGoalRejection[];
}
export interface WorkflowConnectionGoalRecoveryDescription extends WorkflowConnectionGoalPlanningDescription {
  conflictMaterials: WorkflowConnectionConflictMaterials;
  rejectedProposals: WorkflowConnectionGoalRejection[];
  rejectedGoalReviews?: WorkflowReviewedGoalCandidate[];
}
export interface WorkflowConnectionRecoveredGoalSelection {
  kind: 'goals';
  goals: WorkflowConnectionGoalSelection[];
}
export interface WorkflowConnectionGoalRecoveryModelOutput {
  decision:
    | WorkflowConnectionRecoveredGoalSelection
    | WorkflowConnectionMaterialRepairRequest;
}
export interface RecoveredWorkflowConnectionGoals {
  kind: 'goals';
  session: WorkflowConnectionSession;
}
export type PlanWorkflowConnectionGoalRecoveryResult =
  RecoveredWorkflowConnectionGoals | WorkflowConnectionSourceRepairRequest;
