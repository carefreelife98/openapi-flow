import type { ApiOperationContract } from './api-operation.js';
import type {
  ReviewableWorkflowApiMaterial,
  WorkflowReviewGap,
  ReviewableWorkflowGraphPlan,
  BlockedWorkflowCall,
  ReadyWorkflowApiMaterial,
  BlockedWorkflowApiMaterial,
} from './reviewable-workflow.js';
import type {
  WorkflowCapability,
  PlannedNativeNode,
  WorkflowPlanEdge,
  WorkflowPlanGap,
  WorkflowGraphPlan,
  WorkflowPlanNodeContract,
} from './workflow-plan.js';
import type { PreparedNativeNodeMaterial } from './native-node-planning.js';
import type { NativeOutputContract } from './node-output.js';
import type { BindingSchema } from './api-bindings.js';
import type {
  ExplainedWorkflowConnection,
  ExplainedWorkflowBlockedCall,
} from './workflow-connection-planning.js';
import type { WorkflowPlanningSourceEvidence } from './workflow-planning-materials.js';

export type WorkflowGraphPlanningMode = 'executable' | 'reviewable';

export interface WorkflowGraphPlanningInput {
  mode: WorkflowGraphPlanningMode;
  scenario: string;
  materials: ReviewableWorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  gaps: WorkflowReviewGap[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface WorkflowGraphPlanningSnapshot extends WorkflowGraphPlanningInput {
  preparedNativeNodes: PlannedNativeNode[];
}

export type WorkflowGraphOperationMaterial = Pick<
  ApiOperationContract,
  'key' | 'method' | 'path'
> & {
  operation: Partial<
    Pick<
      ApiOperationContract['operation'],
      'summary' | 'description' | 'tags' | 'responses'
    >
  >;
};

export type WorkflowGraphApiMaterial = (
  | Omit<ReadyWorkflowApiMaterial, 'operation'>
  | Omit<BlockedWorkflowApiMaterial, 'operation'>
) & {
  operation: WorkflowGraphOperationMaterial;
  inputPorts: string[];
  outputPorts: string[];
};

export interface WorkflowGraphGapMaterial extends WorkflowReviewGap {
  inputPorts: string[];
  outputPorts: string[];
}

export interface WorkflowGraphCapabilityMaterial {
  name: string;
  description: string;
  parametersSchema: BindingSchema;
  waitsForAllInputs: boolean;
  exclusiveOutputPorts: boolean;
}

export interface WorkflowGraphPlanningContext {
  scenario: string;
  materials: WorkflowGraphApiMaterial[];
  preparedNativeNodes: PreparedNativeNodeMaterial[];
  nativeOutputs: NativeOutputContract[];
  capabilities: WorkflowGraphCapabilityMaterial[];
  gaps?: WorkflowGraphGapMaterial[];
}

export interface WorkflowGraphPlanningDescription {
  input: WorkflowGraphPlanningSnapshot;
  context: WorkflowGraphPlanningContext;
  sources: WorkflowPlanningSourceEvidence;
  planningCapabilities: WorkflowCapability[];
}

export interface ExecutableWorkflowGraphPlanningProposal {
  mode: 'executable';
  additionalNativeNodes: PlannedNativeNode[];
  edges: WorkflowPlanEdge[];
  gaps: WorkflowPlanGap[];
}

export interface ReviewableWorkflowGraphPlanningProposal {
  mode: 'reviewable';
  additionalNativeNodes: PlannedNativeNode[];
  edges: WorkflowPlanEdge[];
  additionalGaps: Pick<WorkflowReviewGap, 'id' | 'description'>[];
  blockedCalls: BlockedWorkflowCall[];
}

export type WorkflowGraphPlanningProposal =
  | ExecutableWorkflowGraphPlanningProposal
  | ReviewableWorkflowGraphPlanningProposal;

export interface WorkflowGraphPlanningNodeReason {
  nodeId: string;
  reason: string;
}

export interface WorkflowGraphPlanningAssessment {
  reason: string;
  nodes: WorkflowGraphPlanningNodeReason[];
  edges: ExplainedWorkflowConnection[];
  blockedCalls: ExplainedWorkflowBlockedCall[];
}

export type WorkflowGraphPlanningVerification =
  | { status: 'needs-review' }
  | {
      status: 'validated';
      contracts: WorkflowPlanNodeContract[];
      outputs: NativeOutputContract[];
    };

export type ExecutableWorkflowGraphPlanningResult = Pick<
  WorkflowGraphPlan,
  'nativeNodes' | 'edges' | 'gaps' | 'starts'
>;
export type ReviewableWorkflowGraphPlanningResult = Pick<
  ReviewableWorkflowGraphPlan,
  'nativeNodes' | 'edges' | 'gaps' | 'blockedCalls' | 'starts'
>;

export interface WorkflowGraphPlanningRecordFields {
  proposal: WorkflowGraphPlanningProposal;
  assessment: WorkflowGraphPlanningAssessment;
  evidence: {
    kind: 'supplied-graph-materials';
    context: WorkflowGraphPlanningContext;
    sources: WorkflowPlanningSourceEvidence;
  };
  verification: WorkflowGraphPlanningVerification;
}

export type WorkflowGraphPlanningRecord = WorkflowGraphPlanningRecordFields &
  (
    | { kind: 'executable'; plan: ExecutableWorkflowGraphPlanningResult }
    | { kind: 'reviewable'; plan: ReviewableWorkflowGraphPlanningResult }
  );

export interface CreateWorkflowGraphPlanningResultInput extends WorkflowGraphPlanningInput {
  proposal: WorkflowGraphPlanningProposal;
}

export interface CreateWorkflowGraphPlanningRecordInput extends CreateWorkflowGraphPlanningResultInput {
  plan: WorkflowGraphPlan | ReviewableWorkflowGraphPlan;
  assessment: WorkflowGraphPlanningAssessment;
}

export interface ValidateWorkflowGraphPlanningRecordInput extends WorkflowGraphPlanningInput {
  plan: WorkflowGraphPlan | ReviewableWorkflowGraphPlan;
  record: WorkflowGraphPlanningRecord;
}
