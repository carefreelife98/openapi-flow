import type { WorkflowJSON, StickyNoteConfig } from '@n8n/workflow-sdk';
import type {
  ApiCatalog,
  ApiCapabilityGap,
  ApiSelection,
  WorkflowPlanEdge,
  ApiOperationContract,
} from '@openapi-flow/core';

export interface N8nWorkflowPreviewIssue {
  stage: 'api-bindings' | 'workflow-graph';
  description: string;
}

export interface N8nPreviewNativeNode {
  id: string;
  capability: string;
}

export interface CreateN8nWorkflowPreviewInput {
  id: string;
  name: string;
  scenario: string;
  catalog: ApiCatalog;
  selection: ApiSelection;
  issues?: N8nWorkflowPreviewIssue[];
  proposedNativeNodes?: N8nPreviewNativeNode[];
  proposedEdges?: WorkflowPlanEdge[];
}

export type N8nWorkflowPreviewMetadata = Omit<
  CreateN8nWorkflowPreviewInput,
  'catalog'
>;

export interface N8nApiSelectionPreviewDiagnostic extends ApiCapabilityGap {
  stage: 'api-selection';
}

export interface N8nWorkflowRequirementPreviewDiagnostic extends N8nWorkflowPreviewIssue {
  kind: 'unmet_requirement';
}

export type N8nWorkflowPreviewDiagnostic =
  N8nApiSelectionPreviewDiagnostic | N8nWorkflowRequirementPreviewDiagnostic;

export interface N8nPreviewNote {
  content: string;
  config: StickyNoteConfig;
}

export interface CreateN8nPreviewNotesInput {
  metadata: N8nWorkflowPreviewMetadata;
  contracts: ApiOperationContract[];
  diagnostics: N8nWorkflowPreviewDiagnostic[];
}

export interface N8nPreviewWorkflowJSON extends WorkflowJSON {
  active: false;
}

export interface N8nWorkflowPreviewResult {
  status: 'needs-review';
  executable: false;
  diagnostics: N8nWorkflowPreviewDiagnostic[];
  previewWorkflow: N8nPreviewWorkflowJSON;
}
