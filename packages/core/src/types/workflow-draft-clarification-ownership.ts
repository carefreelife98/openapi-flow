import type { WorkflowDraftScope } from './workflow-draft.js';
import type { WorkflowPlanningEvidence } from './planning-evidence.js';
import type {
  ValidateWorkflowDraftEditPlanInput,
  WorkflowDraftEditDecision,
  WorkflowDraftEditDecisionFields,
} from './workflow-draft-edit.js';

export type WorkflowDraftClarificationPlanningStage =
  | 'api-bindings'
  | 'api-arguments'
  | 'native-parameters'
  | 'requirements'
  | 'connections';
export type WorkflowDraftClarificationOwner =
  | { kind: 'semantic'; scope: WorkflowDraftScope }
  | {
      kind: 'planning-step';
      decisionIndex: number;
      stage: WorkflowDraftClarificationPlanningStage;
    };
export interface ResolveWorkflowDraftClarificationOwnerIndexInput {
  decisions: WorkflowDraftEditDecision[];
  sourceIndex: number;
}
export type ResolvedWorkflowDraftClarificationOwner =
  | { kind: 'semantic'; scope: WorkflowDraftScope }
  | {
      kind: 'planning-step';
      stepId: string;
      nodeId?: string;
      stage: WorkflowDraftClarificationPlanningStage;
    };
export interface WorkflowDraftClarificationOwnership extends WorkflowDraftEditDecisionFields<WorkflowPlanningEvidence> {
  sourceStepId: string;
  owner: ResolvedWorkflowDraftClarificationOwner;
}
export interface DescribeWorkflowDraftClarificationOwnershipInput extends ValidateWorkflowDraftEditPlanInput {
  /** Omission describes the whole plan. Supplying an ID selects only that actual owner/source step. */
  stepId?: string;
  /** Only concerns owned by this exact stage; earlier unresolved-intent text is not replay authority. */
  stage?: WorkflowDraftClarificationPlanningStage;
}
