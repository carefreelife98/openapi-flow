import type { z } from 'zod';
import type { JsonValue } from './api-arguments.js';
import type { BindingSchema, ApiBindingMaterial } from './api-bindings.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';
import type { ValidateWorkflowDraftEditPlanInput } from './workflow-draft-edit.js';
import type { WorkflowDraftEditResolution } from './workflow-draft-edit-assembly.js';
import type {
  WorkflowDraftApiCall,
  WorkflowSourceMessage,
} from './workflow-draft.js';
import type { JsonObject } from './openapi.js';
import type { ApiInputLiteralSource } from './api-input-literal-source.js';

export interface WorkflowDraftApiInputEditMaterial extends ApiBindingMaterial {
  requestedInputs?: string[];
}

export interface WorkflowDraftApiInputEditInput extends ValidateWorkflowDraftEditPlanInput {
  stepId: string;
  /** Omission preserves the call's explicit existing media selection. */
  requestMediaType?: string;
}
export interface ProposedWorkflowDraftApiInputEditTarget {
  kind: 'set' | 'remove';
  pointer: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface WorkflowDraftApiInputEditProposal {
  targets: ProposedWorkflowDraftApiInputEditTarget[];
}
export type WorkflowDraftApiInputEditTarget = Omit<
  ProposedWorkflowDraftApiInputEditTarget,
  'kind'
> & { id: string } & (
    { kind: 'set'; schema: BindingSchema } | { kind: 'remove' }
  );
export interface WorkflowDraftApiInputEditDescription {
  stepId: string;
  instruction: string;
  call: WorkflowDraftApiCall;
  requestSchema: JsonObject;
  messages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}
export interface CreateWorkflowDraftApiInputEditContractInput extends WorkflowDraftApiInputEditInput {
  proposal: WorkflowDraftApiInputEditProposal;
}
export interface WorkflowDraftApiInputEditContract {
  id: string;
  planId: string;
  stepId: string;
  nodeId: string;
  /** Shared original request resource; field schemas refer to it, never duplicate it. */
  schemaResource: BindingSchema;
  targets: WorkflowDraftApiInputEditTarget[];
  requestMediaType?: string;
}
export interface WorkflowDraftApiInputEditContractInput extends WorkflowDraftApiInputEditInput {
  contract: WorkflowDraftApiInputEditContract;
}
export interface WorkflowDraftApiInputEditValueSource extends ApiInputLiteralSource {
  messageId: string;
}
export type WorkflowDraftApiInputEditValue = (
  | {
      status: 'provided';
      value: JsonValue;
      source: WorkflowDraftApiInputEditValueSource;
    }
  | { status: 'needs-input' }
) & {
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
};
export interface WorkflowDraftApiInputEditValues {
  values: Record<string, WorkflowDraftApiInputEditValue>;
}
export interface ResolveWorkflowDraftApiInputEditsInput extends WorkflowDraftApiInputEditContractInput {
  output: WorkflowDraftApiInputEditValues;
}
export type WorkflowDraftApiInputEditResult =
  | {
      status: 'ready';
      contractId: string;
      values: WorkflowDraftApiInputEditValues;
      resolution: Extract<WorkflowDraftEditResolution, { kind: 'api-inputs' }>;
    }
  | {
      status: 'needs-input';
      contractId: string;
      values: WorkflowDraftApiInputEditValues;
      pendingTargets: WorkflowDraftApiInputEditTarget[];
    };
export type WorkflowDraftApiInputEditValuesSchema =
  z.ZodType<WorkflowDraftApiInputEditValues>;
