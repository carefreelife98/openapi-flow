import type { WorkflowNativeParameterReference } from './native-parameter-reference.js';
import type { WorkflowDraftReferenceSources } from './workflow-draft-reference-sources.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';

export interface ValidateWorkflowDraftNativeReferenceInput {
  reference: WorkflowNativeParameterReference;
  sources: WorkflowDraftReferenceSources;
}
export interface ValidateWorkflowDraftNativeReferencesInput {
  node: PlannedNativeNode;
  capability: WorkflowCapability;
  sources: WorkflowDraftReferenceSources;
}
