import type { ApiOperationContract } from './api-operation.js';
import type { ApiOperationKey } from './api-catalog.js';
import type { WorkflowCapability } from './workflow-plan.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type { BindingSchema } from './api-bindings.js';
import type {
  WorkflowDraftClarification,
  WorkflowDraftClarificationDescription,
} from './workflow-draft-clarification.js';

export interface WorkflowMessageEvidence {
  kind: 'message';
  messageId: string;
  quote: string;
}
export interface WorkflowOasEvidence {
  kind: 'oas';
  operation: ApiOperationKey;
  /** RFC 6901 pointer into the supplied resolved Operation Object. */
  pointer: string;
}
export interface WorkflowNativeEvidence {
  kind: 'native';
  capability: string;
}
export interface WorkflowEntryPointContract {
  kind: string;
  description: string;
}
export interface WorkflowEntryPointEvidence {
  kind: 'entrypoint';
  entrypoint: string;
}
export type WorkflowPlanningEvidence =
  | WorkflowMessageEvidence
  | WorkflowOasEvidence
  | WorkflowNativeEvidence
  | WorkflowEntryPointEvidence;
export interface WorkflowPlanningContext {
  messages: WorkflowSourceMessage[];
  planningMessageIds?: string[];
  operations?: ApiOperationContract[];
  capabilities?: WorkflowCapability[];
  entrypoint?: WorkflowEntryPointContract;
  clarification?: WorkflowDraftClarification;
}
export interface DescribedWorkflowCapability {
  name: string;
  description: string;
  parametersSchema: BindingSchema;
  supportsRuntimeParameters?: true;
  materialRequirements?: WorkflowCapability['materialRequirements'];
}
export interface WorkflowPlanningContextDescription {
  messages: WorkflowSourceMessage[];
  operations: ApiOperationContract[];
  capabilities: DescribedWorkflowCapability[];
  entrypoint?: WorkflowEntryPointContract;
  clarification?: WorkflowDraftClarificationDescription;
}
export interface ValidateWorkflowPlanningEvidenceInput {
  context: WorkflowPlanningContext;
  evidence: WorkflowPlanningEvidence[];
}
