import type { PlannedNativeNode, WorkflowPlanEdge } from './workflow-plan.js';
import type { WorkflowDraftCapabilityGap } from './workflow-draft-capability-gap.js';
import type {
  WorkflowDraft,
  WorkflowDraftContent,
  WorkflowDraftApiCall,
  WorkflowDraftContext,
  WorkflowDraftRequirement,
} from './workflow-draft.js';

export type WorkflowDraftChange =
  | { kind: 'add-api-call'; call: WorkflowDraftApiCall }
  | { kind: 'update-api-call'; call: WorkflowDraftApiCall }
  | { kind: 'add-native-node'; node: PlannedNativeNode }
  | { kind: 'update-native-node'; node: PlannedNativeNode }
  | { kind: 'add-capability-gap'; node: WorkflowDraftCapabilityGap }
  | { kind: 'remove-node'; nodeId: string }
  | { kind: 'add-edge'; edge: WorkflowPlanEdge }
  | { kind: 'remove-edge'; edge: WorkflowPlanEdge }
  | { kind: 'set-requirement'; requirement: WorkflowDraftRequirement }
  | {
      kind: 'remove-requirement';
      requirementId: string;
      sourceMessageIds: string[];
    };

export interface DraftChangeSet {
  baseRevision: number;
  changes: WorkflowDraftChange[];
}

export interface DraftChangeImpact {
  changedNodeIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  affectedNodeIds: string[];
  preservedNodeIds: string[];
  changedRequirementIds: string[];
  invalidatedApprovalIds: string[];
}

export interface AnalyzeDraftChangeImpactInput {
  before: WorkflowDraft;
  after: WorkflowDraftContent;
  context: WorkflowDraftContext;
}

export interface ApplyDraftChangeSetInput {
  draft: WorkflowDraft;
  changeSet: DraftChangeSet;
  context: WorkflowDraftContext;
}

export interface ApplyDraftChangeSetResult {
  draft: WorkflowDraft;
  impact: DraftChangeImpact;
}
