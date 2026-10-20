import { isDeepStrictEqual } from 'node:util';
import type {
  WorkflowDraftInput,
  WorkflowDraftRequirement,
} from '../../../types/workflow-draft.js';
import type { WorkflowDraftRequirementHistoryEntry } from '../../../types/workflow-draft-requirement-history.js';
import { appendWorkflowDraftRequirementHistory } from './append-workflow-draft-requirement-history.js';

/** Validate the chain and its current projection. Hashes are consistency checks, not authentication. */
export function validateWorkflowDraftRequirementHistory(
  input: WorkflowDraftInput,
): void {
  const active = new Map<string, WorkflowDraftRequirement>();
  const seen: WorkflowDraftRequirementHistoryEntry[] = [];
  let revision = 0;
  for (const entry of input.draft.requirementHistory) {
    if (entry.revision < revision || entry.revision > input.draft.revision)
      throw new Error(
        `Requirement history ${entry.requirementId} has an invalid revision`,
      );
    revision = entry.revision;
    const after = 'after' in entry ? entry.after : undefined;
    if (after && after.id !== entry.requirementId)
      throw new Error(
        'Requirement history snapshot has a different requirementId',
      );
    const actual = appendWorkflowDraftRequirementHistory({
      draftId: input.draft.id,
      revision: entry.revision,
      history: seen,
      before: active.get(entry.requirementId),
      after,
      sourceMessageIds: entry.evidence.map((item) => item.messageId),
      messages: input.context.messages,
    });
    if (!isDeepStrictEqual(actual, entry))
      throw new Error(
        `Requirement history ${entry.requirementId} has changed snapshots, sources, ordering or identity`,
      );
    if (after) active.set(entry.requirementId, after);
    else active.delete(entry.requirementId);
    seen.push(entry);
  }
  if (
    active.size !== input.draft.requirements.length ||
    input.draft.requirements.some(
      (requirement) =>
        !isDeepStrictEqual(active.get(requirement.id), requirement),
    )
  )
    throw new Error(
      'Requirement history does not match the current draft requirements',
    );
}
