import type { z } from 'zod';
import type {
  workflowConnectionRegionSchema,
  workflowConnectionRegionNodeSchema,
} from '../schemas/workflow-connection-region-schema.js';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionStepExpectation,
  WorkflowConnectionStepDescription,
} from './workflow-connection-session.js';
import type { WorkflowPlanNodeContract } from './workflow-plan.js';

export type WorkflowConnectionRegion = z.infer<
  typeof workflowConnectionRegionSchema
>;
export type WorkflowConnectionRegionNode = z.infer<
  typeof workflowConnectionRegionNodeSchema
>;
export interface CreateWorkflowConnectionRegionPatchInput extends WorkflowConnectionSessionInput {
  expected: WorkflowConnectionStepExpectation;
  region: WorkflowConnectionRegion;
}

export type WorkflowConnectionRegionContext = Pick<
  WorkflowConnectionStepDescription,
  | 'context'
  | 'requirements'
  | 'edgeCatalog'
  | 'rootNodeIds'
  | 'terminals'
  | 'goals'
> & { retiredNodes?: Pick<WorkflowPlanNodeContract, 'id'>[] };
export interface DeriveWorkflowConnectionRegionPatchInput {
  description: WorkflowConnectionRegionContext;
  region: WorkflowConnectionRegion;
}
export type WorkflowConnectionPortCandidate = Pick<
  WorkflowPlanNodeContract,
  'id' | 'inputs' | 'outputs'
>;
export interface WorkflowConnectionCandidateGroup {
  sources: WorkflowConnectionPortCandidate[];
  targets: WorkflowConnectionPortCandidate[];
}
