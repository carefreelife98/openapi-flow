import type { ApiOperationContract } from './api-operation.js';
import type { NativeOutputContract } from './node-output.js';
import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditResolution,
  WorkflowDraftEditRepair,
} from './workflow-draft-edit-assembly.js';
import type {
  WorkflowDraftApiCall,
  WorkflowSourceMessage,
  WorkflowDraftRequirement,
} from './workflow-draft.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type { JsonObject } from './openapi.js';
import type { ApiResponsePointerCatalog } from './api-response-pointers.js';
import type { WorkflowDraftApiSourcePreparation } from './workflow-draft-api-response-sources.js';

export type WorkflowDraftApiBindingEditScope =
  { kind: 'step'; stepId: string } | { kind: 'repair'; taskId: string };
export interface WorkflowDraftApiBindingEditInput extends PrepareWorkflowDraftEditInput {
  scope: WorkflowDraftApiBindingEditScope;
}
export type WorkflowDraftApiBindingEditSource =
  | {
      nodeId: string;
      kind: 'api';
      operation: ApiOperationContract;
      responsePointerCatalog: ApiResponsePointerCatalog[];
      preparation: WorkflowDraftApiSourcePreparation;
      requirements: WorkflowDraftRequirement[];
    }
  | {
      nodeId: string;
      kind: 'native';
      schema: NativeOutputContract['schema'];
      requirements: WorkflowDraftRequirement[];
    };
export interface WorkflowDraftApiBindingEditDescription {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  scope: WorkflowDraftApiBindingEditScope;
  instruction: string;
  call: WorkflowDraftApiCall;
  operation: ApiOperationContract;
  requestSchema: JsonObject;
  sourceCandidates: WorkflowDraftApiBindingEditSource[];
  /** Repair scopes must explicitly decide each affected existing target. */
  requiredTargetPointers: string[];
  messages: WorkflowSourceMessage[];
  backgroundMessages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}
export type ProposedWorkflowDraftApiBindingEdit = {
  targetPointer: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
} & (
  | {
      kind: 'bind' | 'replace-literal-with-binding';
      sourceNodeId: string;
      sourcePointer: string;
    }
  | { kind: 'unbind' }
  | { kind: 'keep' }
  | { kind: 'needs-clarification'; message: string }
);
export interface WorkflowDraftApiBindingEditProposal {
  decisions: ProposedWorkflowDraftApiBindingEdit[];
}
export interface ResolveWorkflowDraftApiBindingEditInput extends WorkflowDraftApiBindingEditInput {
  fingerprint: string;
  proposal: WorkflowDraftApiBindingEditProposal;
}
export interface WorkflowDraftApiBindingEditQuestion {
  id: string;
  nodeId: string;
  targetPointer: string;
  message: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface WorkflowDraftApiBindingEditResultFields {
  fingerprint: string;
  proposal: WorkflowDraftApiBindingEditProposal;
}
export type WorkflowDraftApiBindingEditResult =
  WorkflowDraftApiBindingEditResultFields &
    (
      | {
          status: 'ready';
          kind: 'step';
          resolution: Extract<
            WorkflowDraftEditResolution,
            { kind: 'api-bindings' }
          >;
        }
      | {
          status: 'ready';
          kind: 'repair';
          repair: Extract<WorkflowDraftEditRepair, { kind: 'api-bindings' }>;
        }
      | {
          status: 'needs-clarification';
          questions: WorkflowDraftApiBindingEditQuestion[];
        }
    );
