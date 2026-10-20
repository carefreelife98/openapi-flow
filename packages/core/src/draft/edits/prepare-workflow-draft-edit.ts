import type {
  PrepareWorkflowDraftEditInput,
  PreparedWorkflowDraftEdit,
} from '../../types/workflow-draft-edit-assembly.js';
import { resolvePreparedWorkflowDraftEdit } from './assembly/resolve-prepared-workflow-draft-edit.js';

/** Planning materials are deliberately not a validated canonical draft or executable workflow. */
export function prepareWorkflowDraftEdit(
  input: PrepareWorkflowDraftEditInput,
): PreparedWorkflowDraftEdit {
  const prepared = resolvePreparedWorkflowDraftEdit(input, 'complete');
  return {
    kind: prepared.kind,
    planId: prepared.planId,
    baseRevision: prepared.baseRevision,
    content: prepared.content,
    nodeRemovalConnections: prepared.nodeRemovalConnections,
    pendingRepairs: prepared.pendingRepairs,
    deferredRequirementIds: prepared.deferredRequirementIds,
    pendingClarificationQuestionIds: prepared.pendingClarificationQuestionIds,
  };
}
