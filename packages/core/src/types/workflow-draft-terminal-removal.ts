import type {
  PrepareWorkflowDraftEditInput,
  WorkflowDraftEditConnectionChange,
  AssembledWorkflowDraftEdit,
} from './workflow-draft-edit-assembly.js';

export type WorkflowDraftTerminalRemovalInput = PrepareWorkflowDraftEditInput;

/** Code-owned structural proof; never a model proposal or a human approval. */
export interface WorkflowDraftTerminalRemoval {
  kind: 'terminal-node-removal';
  fingerprint: string;
  removedNodeIds: string[];
  connections: WorkflowDraftEditConnectionChange[];
  candidate: AssembledWorkflowDraftEdit;
}

export type WorkflowDraftTerminalRemovalResult =
  | { status: 'not-applicable' }
  | { status: 'ready'; result: WorkflowDraftTerminalRemoval };
