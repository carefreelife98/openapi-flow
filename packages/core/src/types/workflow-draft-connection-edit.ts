import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditConnectionChange,
  AssembledWorkflowDraftEdit,
} from './workflow-draft-edit-assembly.js';
import type { WorkflowDraftEditStep } from './workflow-draft-edit.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowPlanEdge,
  WorkflowPlanNodeContract,
} from './workflow-plan.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type { ApiOperationContract } from './api-operation.js';
import type { WorkflowDraftApiCall } from './workflow-draft.js';

export type WorkflowDraftConnectionEditInput = PrepareWorkflowDraftEditInput;
/** A single ready instance cannot have a non-cyclic inter-instance edge. */
export interface WorkflowDraftSingleNodeConnectionProof {
  kind: 'single-node-dag';
  nodeId: string;
}
export interface WorkflowDraftConnectionEditDescriptionFields {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  steps: WorkflowDraftEditStep[];
  messages: WorkflowSourceMessage[];
  backgroundMessages: WorkflowSourceMessage[];
  includeExplanations: boolean;
  structuralProof?: WorkflowDraftSingleNodeConnectionProof;
}
export interface WorkflowDraftConnectionEditEdge {
  id: string;
  edge: WorkflowPlanEdge;
  editable: boolean;
}
export type WorkflowDraftConnectionEditDescription =
  WorkflowDraftConnectionEditDescriptionFields &
    (
      | { status: 'not-required' | 'waiting-for-materials' }
      | {
          status: 'ready';
          contracts: WorkflowPlanNodeContract[];
          apiInstances: WorkflowDraftConnectionEditApiInstance[];
          affectedNodeIds: string[];
          existingEdges: WorkflowDraftConnectionEditEdge[];
        }
    );
export type ReadyWorkflowDraftConnectionEditDescription = Extract<
  WorkflowDraftConnectionEditDescription,
  { status: 'ready' }
>;
export interface WorkflowDraftConnectionEditEndpoint {
  nodeId: string;
  port: string;
}
export interface WorkflowDraftConnectionEditApiInstance {
  nodeId: string;
  method: ApiOperationContract['method'];
  path: string;
  summary?: string;
  values: WorkflowDraftApiCall['values'];
  bindings: WorkflowDraftApiCall['bindings'];
}
export type ProposedWorkflowDraftConnectionEdit = {
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
} & (
  | {
      kind: 'add';
      source: WorkflowDraftConnectionEditEndpoint;
      target: WorkflowDraftConnectionEditEndpoint;
    }
  | { kind: 'remove'; edgeId: string }
  | { kind: 'keep-connections' }
  | { kind: 'needs-clarification'; message: string }
);
export interface WorkflowDraftConnectionEditProposal {
  decisions: ProposedWorkflowDraftConnectionEdit[];
}
export interface ResolveWorkflowDraftConnectionEditInput extends WorkflowDraftConnectionEditInput {
  fingerprint: string;
  proposal: WorkflowDraftConnectionEditProposal;
}
export interface WorkflowDraftConnectionEditQuestion {
  id: string;
  message: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface WorkflowDraftConnectionEditResultFields {
  fingerprint: string;
  proposal: WorkflowDraftConnectionEditProposal;
}
export type WorkflowDraftConnectionEditResult =
  | {
      status: 'not-required' | 'waiting-for-materials';
      description: WorkflowDraftConnectionEditDescription;
    }
  | (WorkflowDraftConnectionEditResultFields &
      (
        | {
            status: 'ready';
            connections: WorkflowDraftEditConnectionChange[];
            candidate: AssembledWorkflowDraftEdit;
          }
        | {
            status: 'needs-clarification';
            questions: WorkflowDraftConnectionEditQuestion[];
          }
      ));
