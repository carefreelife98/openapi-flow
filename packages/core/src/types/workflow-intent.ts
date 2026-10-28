import type { WorkflowSourceMessage } from './workflow-draft.js';

/** Business scope before selecting concrete APIs, native instances, values or ports. */
export interface WorkflowIntentInput {
  scenario: string;
  messages: WorkflowSourceMessage[];
}

export type WorkflowIntentScope = 'required' | 'conditional' | 'excluded';
export type WorkflowIntentFlowKind = 'sequence' | 'parallel' | 'collect';

export interface WorkflowIntentRoleProposal {
  task: string;
  scope: WorkflowIntentScope;
  /** Original user message IDs only; no repeated quotations. */
  sourceMessageIds: string[];
}

export interface WorkflowIntentFlowProposal {
  kind: WorkflowIntentFlowKind;
  roleIndices: number[];
  intent: string;
}

export interface WorkflowIntentProposal {
  objective: string;
  roles: WorkflowIntentRoleProposal[];
  flows: WorkflowIntentFlowProposal[];
}

export interface WorkflowIntentRole extends Omit<
  WorkflowIntentRoleProposal,
  'sourceMessageIds'
> {
  id: string;
  sources: WorkflowSourceMessage[];
}

export interface WorkflowIntentFlow extends Omit<
  WorkflowIntentFlowProposal,
  'roleIndices'
> {
  roleIds: string[];
}

/** Retained proposal evidence; never an active business or execution flow. */
export interface InactiveWorkflowIntentFlow extends WorkflowIntentFlow {
  sourceIndex: number;
}

export interface WorkflowIntentPlan {
  id: string;
  source: WorkflowIntentInput;
  objective: string;
  roles: WorkflowIntentRole[];
  flows: WorkflowIntentFlow[];
  /** Relations mentioning conditional/excluded roles, in their original proposal positions. */
  inactiveFlows?: InactiveWorkflowIntentFlow[];
}

export interface ResolveWorkflowIntentInput extends WorkflowIntentInput {
  proposal: WorkflowIntentProposal;
}

export interface ValidateWorkflowIntentInput extends WorkflowIntentInput {
  plan: WorkflowIntentPlan;
}
