import type { WorkflowDraft, WorkflowDraftContext } from './workflow-draft.js';
import type { PrepareWorkflowDraftEditInput } from './workflow-draft-edit-assembly.js';
import type { BindingSchema } from './api-bindings.js';
import type { WorkflowResponseReference } from './workflow-plan.js';
import type { z } from 'zod';
import type {
  workflowExecutionBlockSchema,
  workflowExecutionProgramSchema,
  workflowProgramLimitsSchema,
} from '../schemas/workflow-execution-program-schema.js';
import type { WorkflowConnectionSessionSource } from './workflow-connection-session.js';
import type {
  WorkflowConnectionMaterialRepairStage,
  WorkflowConnectionSourceRepairRequest,
} from './workflow-connection-material-repair.js';
import type { WorkflowConnectionMaterialRepairRequest } from './workflow-connection-revision.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';
import type { ReviewableWorkflowGraphPlan } from './reviewable-workflow.js';
import type { WorkflowConnectionPlanningDescription } from './workflow-connection-planning.js';

export type WorkflowExecutionBlock = z.infer<
  typeof workflowExecutionBlockSchema
>;
export type WorkflowExecutionProgram = z.infer<
  typeof workflowExecutionProgramSchema
>;
export type WorkflowProgramLimits = z.infer<typeof workflowProgramLimitsSchema>;

export interface WorkflowProgramControlRequest {
  kind: 'parallel-barrier' | 'alternative-rejoin';
  id: string;
  inputCount: number;
}
export interface WorkflowProgramControls {
  version: string;
  capabilities: WorkflowCapability[];
  create: (request: WorkflowProgramControlRequest) => PlannedNativeNode;
}
export interface WorkflowExecutionProgramSource extends WorkflowConnectionSessionSource {
  limits: WorkflowProgramLimits;
  controls?: WorkflowProgramControls;
}
export interface ResolveWorkflowExecutionProgramInput extends WorkflowExecutionProgramSource {
  program: WorkflowExecutionProgram;
}
export interface WorkflowExecutionProgramDescription {
  sourceFingerprint: string;
  controlsAvailable: boolean;
  context: WorkflowConnectionPlanningDescription['context'];
  sources: WorkflowConnectionPlanningDescription['sources'];
  requirements: WorkflowConnectionSessionSource['requirements'];
  apiOperations: {
    nodeId: string;
    method: string;
    path: string;
    purpose?: string;
  }[];
  limits: WorkflowProgramLimits;
  materialRepairStages: WorkflowConnectionMaterialRepairStage[];
  responseValues: {
    references: WorkflowResponseReference[];
    schema: BindingSchema;
  }[];
}
export interface ResolvedWorkflowExecutionProgram {
  kind: 'resolved-execution-program';
  sourceFingerprint: string;
  program: WorkflowExecutionProgram;
  plan: ReviewableWorkflowGraphPlan;
  generatedNodeIds: string[];
}
export interface ValidateWorkflowExecutionProgramInput extends WorkflowExecutionProgramSource {
  result: ResolvedWorkflowExecutionProgram;
}
export interface WorkflowProgramRevision {
  revision: number;
  result: ResolvedWorkflowExecutionProgram;
}
export interface ReviseWorkflowExecutionProgramInput extends ResolveWorkflowExecutionProgramInput {
  current: WorkflowProgramRevision;
  previousSource: WorkflowExecutionProgramSource;
  expectedRevision: number;
}
export interface WorkflowExecutionProgramProjection extends WorkflowExecutionProgramDescription {
  result: ResolvedWorkflowExecutionProgram;
}
export type DescribeResolvedWorkflowExecutionProgramInput =
  ValidateWorkflowExecutionProgramInput;
export interface CreateWorkflowProgramMaterialRepairInput extends WorkflowExecutionProgramSource {
  expectedSourceFingerprint: string;
  decision: WorkflowConnectionMaterialRepairRequest;
}
export interface WorkflowProgramMaterialRepair {
  /** Runtime-only material boundary: no program control factory, model, signal or limits. */
  source: WorkflowConnectionSessionSource;
  sourceFingerprint: string;
  request: WorkflowConnectionSourceRepairRequest;
}

export interface InspectWorkflowProgramDeliveryInput extends ValidateWorkflowExecutionProgramInput {
  /** Explicitly affected business nodes. An unscoped finding must block the whole inventory. */
  blockedNodeIds: string[];
}
export interface WorkflowProgramDelivery {
  status: 'partial' | 'unavailable';
  sourceFingerprint: string;
  blockedNodeIds: string[];
  excludedNodeIds: string[];
  materials: NonNullable<WorkflowExecutionProgramSource['materials']>;
  plan: ReviewableWorkflowGraphPlan;
}

export interface WorkflowDraftProgramAssembly {
  result: ResolvedWorkflowExecutionProgram;
  limits: WorkflowProgramLimits;
  controls?: WorkflowProgramControls;
}
export interface WorkflowDraftExecutionProgramInput extends PrepareWorkflowDraftEditInput {
  limits: WorkflowProgramLimits;
  controls?: WorkflowProgramControls;
}
export interface DeriveWorkflowDraftProgramChangesInput extends WorkflowDraftExecutionProgramInput {
  result: ResolvedWorkflowExecutionProgram;
}

export interface CreateWorkflowProgramDeliveryDraftInput extends ValidateWorkflowExecutionProgramInput {
  id: string;
  blockedNodeIds?: string[];
}
export type WorkflowProgramDeliveryDraft =
  | { status: 'unavailable'; inspection: WorkflowProgramDelivery }
  | {
      status: 'ready';
      inspection: WorkflowProgramDelivery | ResolvedWorkflowExecutionProgram;
      draft: WorkflowDraft;
      context: WorkflowDraftContext;
    };
