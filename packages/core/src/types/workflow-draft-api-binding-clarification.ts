import type { ApiOperationKey } from './api-catalog.js';
import type { BindingSchema } from './api-bindings.js';
import type { ResolvedWorkflowDraftSourceEvidence } from './workflow-draft-source-evidence.js';

export interface ProposedWorkflowDraftApiBindingSource {
  sourceNodeId: string;
  sourcePointer: string;
}
export type ProposedWorkflowDraftApiBindingQuestion =
  | { kind: 'binding-intent'; targetPointer: string }
  | {
      kind: 'choose-source';
      targetPointer: string;
      candidates: ProposedWorkflowDraftApiBindingSource[];
    };
export interface WorkflowDraftApiBindingSourceChoice extends ProposedWorkflowDraftApiBindingSource {
  id: string;
  label: string;
}
export interface WorkflowDraftApiCallPlanningQuestion extends ResolvedWorkflowDraftSourceEvidence {
  id: string;
  nodeId: string;
  operation: ApiOperationKey;
  method: string;
  path: string;
  kind: ProposedWorkflowDraftApiBindingQuestion['kind'];
  targetPointer: string;
  targetSchemas: BindingSchema[];
  message: string;
  choices: WorkflowDraftApiBindingSourceChoice[];
}
export type WorkflowDraftApiBindingAnswer =
  | { kind: 'choose-source'; questionId: string; choiceId: string }
  | ({
      kind: 'bind-source';
      questionId: string;
    } & ProposedWorkflowDraftApiBindingSource)
  | { kind: 'no-binding'; questionId: string };
