import type { ApiOperationContract } from './api-operation.js';

/** Selected identity and original contract, not executable parameters or readiness. */
export interface WorkflowDraftSelectedApiNode {
  id: string;
  kind: 'api';
  operation: ApiOperationContract;
  instruction?: string;
}
export interface WorkflowDraftSelectedNativeNode {
  id: string;
  kind: 'native';
  capability: string;
  instruction?: string;
}
export type WorkflowDraftSelectedNode =
  | WorkflowDraftSelectedApiNode
  | WorkflowDraftSelectedNativeNode
  | WorkflowDraftSelectedGapNode;

export interface WorkflowDraftSelectedGapNode {
  id: string;
  kind: 'capability-gap';
  instruction: string;
}
