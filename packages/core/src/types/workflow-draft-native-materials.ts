import type {
  WorkflowDraftContent,
  WorkflowDraftContext,
} from './workflow-draft.js';
import type { NativeOutputContract } from './node-output.js';

export interface ResolveWorkflowDraftNativeSnapshotInput {
  content: WorkflowDraftContent;
  context: WorkflowDraftContext;
  deferredNodeIds: string[];
  unavailableApiNodeIds: string[];
  shouldDeferNode?: (
    nodeId: string,
    availableOutputs: NativeOutputContract[],
    resolvedNodeIds: string[],
  ) => boolean;
}
