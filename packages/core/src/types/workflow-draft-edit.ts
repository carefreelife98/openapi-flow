import type { z } from 'zod';
import type { ApiOperationKey } from './api-catalog.js';
import type {
  WorkflowDraft,
  WorkflowDraftInput,
  WorkflowDraftRequirement,
} from './workflow-draft.js';
import type { WorkflowDraftClarificationOwner } from './workflow-draft-clarification-ownership.js';
import type {
  WorkflowMessageEvidence,
  WorkflowPlanningContextDescription,
  WorkflowPlanningEvidence,
} from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type { WorkflowDraftCapabilityGapFinding } from './workflow-draft-capability-gap.js';
import type { WorkflowPlanNodeContract } from './workflow-plan.js';

export interface WorkflowDraftEditOptions {
  includeExplanations?: boolean;
}
export interface ResolvedWorkflowDraftEditOptions {
  includeExplanations: boolean;
}
export interface WorkflowDraftEditDecisionFields<Evidence> {
  instruction: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export type WorkflowDraftEditDecision<
  Operation = ApiOperationKey,
  Evidence = WorkflowPlanningEvidence,
> = WorkflowDraftEditDecisionFields<Evidence> &
  (
    | { kind: 'add-api-call'; operation: Operation }
    | { kind: 'replace-api-operation'; nodeId: string; operation: Operation }
    | { kind: 'add-native-node'; capability: string }
    | {
        kind: 'report-capability-gap';
        finding: WorkflowDraftCapabilityGapFinding<Operation>;
      }
    | { kind: 'revise-api-inputs' | 'revise-api-bindings'; nodeId: string }
    | { kind: 'revise-native-node'; nodeId: string }
    | { kind: 'remove-node'; nodeId: string }
    | { kind: 'revise-connections'; nodeIds: string[] }
    | {
        kind:
          'revise-requirement' | 'remove-requirement' | 'restore-requirement';
        requirementId: string;
      }
    | { kind: 'needs-clarification'; owner: WorkflowDraftClarificationOwner }
    | { kind: 'no-change' }
  );
export interface WorkflowDraftEditProposal<
  Operation = ApiOperationKey,
  Evidence = WorkflowPlanningEvidence,
> {
  decisions: WorkflowDraftEditDecision<Operation, Evidence>[];
}
export interface WorkflowDraftEditInput extends WorkflowDraftInput {
  /** The current edit request, not arbitrary earlier accepted conversation turns. */
  requestMessageIds: string[];
}
export interface WorkflowDraftEditContextDescription {
  draft: WorkflowDraft;
  /** Code-derived actual ports, references and join semantics; not model-owned output. */
  nodeContracts: WorkflowPlanNodeContract[];
  nodeContractsFingerprint: string;
  /** Latest removed heads only, supplied as reference choices, never replacement values. */
  removedRequirements: WorkflowDraftRequirement[];
  planning: WorkflowPlanningContextDescription;
  requestMessageIds: string[];
  draftFingerprint: string;
  contextFingerprint: string;
}
export type WorkflowDraftEditStage =
  | 'requirements'
  | 'resolve-contracts'
  | 'native-parameters'
  | 'api-bindings'
  | 'api-arguments'
  | 'connections'
  | 'clarification';
export interface WorkflowDraftEditStep {
  id: string;
  decision: WorkflowDraftEditDecision;
  /** Allocated by code only for a new API/native instance. */
  newNodeId?: string;
  stages: WorkflowDraftEditStage[];
}
export interface WorkflowDraftEditPlan {
  id: string;
  draftId: string;
  baseRevision: number;
  draftFingerprint: string;
  contextFingerprint: string;
  nodeContractsFingerprint: string;
  requestMessageIds: string[];
  options: ResolvedWorkflowDraftEditOptions;
  status: 'ready-for-planning' | 'needs-clarification' | 'no-change';
  steps: WorkflowDraftEditStep[];
}
export interface CreateWorkflowDraftEditPlanInput extends WorkflowDraftEditInput {
  options?: WorkflowDraftEditOptions;
  proposal: WorkflowDraftEditProposal;
}
export interface ValidateWorkflowDraftEditPlanInput extends WorkflowDraftEditInput {
  plan: WorkflowDraftEditPlan;
}
export interface WorkflowDraftEditSchemaSources<Operation, Evidence> {
  operationSchema?: z.ZodType<Operation>;
  apiNodeIds: string[];
  nativeNodeIds: string[];
  gapNodeIds?: string[];
  capabilityNames: string[];
  requirementIds: string[];
  removedRequirementIds: string[];
  messageSchema: z.ZodType<WorkflowMessageEvidence>;
  evidenceSchema: z.ZodType<Evidence>;
}
