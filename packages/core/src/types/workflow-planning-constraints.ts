import type { z } from 'zod';
import type {
  workflowPlanningDependencySchema,
  workflowPlanningConflictSchema,
  workflowPlanningConstraintInspectionSchema,
} from '../schemas/workflow-planning-constraint-schema.js';
import type { WorkflowConnectionPlanningInput } from './workflow-connection-planning.js';
import type { WorkflowConnectionGoalProposal } from './workflow-connection-session.js';
import type {
  WorkflowPlanNodeContract,
  WorkflowPlanEdge,
} from './workflow-plan.js';

export type WorkflowPlanningDependency = z.infer<
  typeof workflowPlanningDependencySchema
>;
export type WorkflowPlanningConflict = z.infer<
  typeof workflowPlanningConflictSchema
>;
export type WorkflowPlanningConstraintInspection = z.infer<
  typeof workflowPlanningConstraintInspectionSchema
>;

export interface InspectWorkflowPlanningConstraintsInput extends WorkflowConnectionPlanningInput {
  goals?: WorkflowConnectionGoalProposal[];
  editableEdgeIds?: string[];
}

export interface InspectWorkflowNodeConstraintsInput {
  contracts: WorkflowPlanNodeContract[];
  goals: WorkflowConnectionGoalProposal[];
  protectedEdges: WorkflowPlanEdge[];
}

export interface WorkflowDependencyTraversalFrame {
  nodeId: string;
  nextIndex: number;
  incoming?: WorkflowPlanningDependency;
}

export interface WorkflowDependencyPathInput {
  parents: Map<string, WorkflowPlanningDependency>;
  from: string;
  to: string;
}
