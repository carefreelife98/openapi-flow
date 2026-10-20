import type { WorkflowDraftRequirement } from './workflow-draft.js';
import type { ValidateWorkflowDraftEditPlanInput } from './workflow-draft-edit.js';
import type { WorkflowDraftEditResolution } from './workflow-draft-edit-assembly.js';
import type { WorkflowDraftSelectedNode } from './workflow-draft-selected-nodes.js';

export interface WorkflowDraftRequirementEditInput extends ValidateWorkflowDraftEditPlanInput {
  stepId: string;
}
export interface WorkflowDraftRequirementEditDescription {
  action: 'revise' | 'restore';
  planId: string;
  baseRevision: number;
  stepId: string;
  requirement: WorkflowDraftRequirement;
  nodes: WorkflowDraftSelectedNode[];
}
export type WorkflowDraftRequirementAnswer = Pick<
  Extract<WorkflowDraftEditResolution, { kind: 'requirement' }>,
  'answerMessageId' | 'text' | 'state' | 'scope'
>;
