import type {
  WorkflowDraft,
  WorkflowDraftRequirement,
} from '../../../types/workflow-draft.js';

/** Called only after canonical validation; the latest history head owns removal state. */
export function listRemovedWorkflowDraftRequirements(
  draft: WorkflowDraft,
): WorkflowDraftRequirement[] {
  const heads = new Map(
    draft.requirementHistory.map((entry) => [entry.requirementId, entry]),
  );
  return [...heads.values()].flatMap((entry) =>
    entry.kind === 'removed' ? [structuredClone(entry.before)] : [],
  );
}
