import type { ApiResponsePointerCatalog } from './api-response-pointers.js';
import type { WorkflowDraftContext } from './workflow-draft.js';
import type { WorkflowDraftApiResponseSource } from './workflow-draft-api-response-sources.js';
import type { PlannedNativeNode } from './workflow-plan.js';
import type { BindingSchema } from './api-bindings.js';
import type { StagedWorkflowDraftEdit } from './workflow-draft-edit-assembly.js';

export interface WorkflowDraftApiReferenceSource extends WorkflowDraftApiResponseSource {
  kind: 'api';
  responsePointerCatalog: ApiResponsePointerCatalog[];
}
export type WorkflowDraftReferenceSource =
  | WorkflowDraftApiReferenceSource
  | {
      kind: 'native';
      nodeId: string;
      schema: BindingSchema;
      node: PlannedNativeNode;
    };
export interface WorkflowDraftExclusiveOutputSource {
  kind: 'exclusive-output';
  nodeId: string;
  node: PlannedNativeNode;
  outputPorts: string[];
}
export interface DescribeWorkflowDraftReferenceSourcesInput {
  stage: StagedWorkflowDraftEdit;
  context: WorkflowDraftContext;
  excludedNodeIds: string[];
}
export interface WorkflowDraftReferenceSources {
  values: WorkflowDraftReferenceSource[];
  exclusiveOutputs: WorkflowDraftExclusiveOutputSource[];
}
