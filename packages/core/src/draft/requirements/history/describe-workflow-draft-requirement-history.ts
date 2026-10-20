import type { WorkflowDraftInput } from '../../../types/workflow-draft.js';
import type { WorkflowDraftRequirementHistoryDescription } from '../../../types/workflow-draft-requirement-history.js';
import { validateWorkflowDraft } from '../../validate-workflow-draft.js';

export function describeWorkflowDraftRequirementHistory(
  input: WorkflowDraftInput,
): WorkflowDraftRequirementHistoryDescription {
  validateWorkflowDraft(input);
  const heads = new Map(
    input.draft.requirementHistory.map((entry) => [entry.requirementId, entry]),
  );
  return {
    draftId: input.draft.id,
    revision: input.draft.revision,
    entries: structuredClone(input.draft.requirementHistory),
    current: [...heads.values()]
      .filter((entry) => entry.kind !== 'removed')
      .map((entry) => ({
        requirementId: entry.requirementId,
        entryId: entry.id,
      })),
    removed: [...heads.values()]
      .filter((entry) => entry.kind === 'removed')
      .map((entry) => ({
        requirementId: entry.requirementId,
        entryId: entry.id,
      })),
  };
}
