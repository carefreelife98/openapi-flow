import type {
  ApplyDraftChangeSetInput,
  ApplyDraftChangeSetResult,
} from '../../types/workflow-draft-changes.js';
import type {
  WorkflowDraft,
  WorkflowDraftContent,
} from '../../types/workflow-draft.js';
import { draftChangeSetSchema } from '../../schemas/draft-change-set-schema.js';
import { validateWorkflowDraft } from '../validate-workflow-draft.js';
import { applyDraftChange } from './apply-draft-change.js';
import { analyzeDraftChangeImpact } from '../impact/analyze-draft-change-impact.js';
import { isDeepStrictEqual } from 'node:util';
import { appendWorkflowDraftRequirementHistory } from '../requirements/history/append-workflow-draft-requirement-history.js';

/** Commit one validated candidate; any error leaves the source draft unchanged. */
export function applyDraftChangeSet(
  input: ApplyDraftChangeSetInput,
): ApplyDraftChangeSetResult {
  validateWorkflowDraft(input);
  const changeSet = draftChangeSetSchema.parse(input.changeSet);
  if (changeSet.baseRevision !== input.draft.revision)
    throw new Error(
      `Stale draft revision: expected ${input.draft.revision}, received ${changeSet.baseRevision}`,
    );
  if (input.draft.revision === Number.MAX_SAFE_INTEGER)
    throw new Error('Draft revision cannot exceed Number.MAX_SAFE_INTEGER');
  const content: WorkflowDraftContent = structuredClone({
    id: input.draft.id,
    requirements: input.draft.requirements,
    apiCalls: input.draft.apiCalls,
    nativeNodes: input.draft.nativeNodes,
    ...(input.draft.gapNodes === undefined
      ? {}
      : { gapNodes: input.draft.gapNodes }),
    edges: input.draft.edges,
  });
  const requirementHistory = structuredClone(input.draft.requirementHistory);
  for (const change of changeSet.changes) {
    if (
      change.kind === 'set-requirement' ||
      change.kind === 'remove-requirement'
    ) {
      const requirementId =
        change.kind === 'set-requirement'
          ? change.requirement.id
          : change.requirementId;
      const before = content.requirements.find(
        (item) => item.id === requirementId,
      );
      applyDraftChange(content, change);
      const after = content.requirements.find(
        (item) => item.id === requirementId,
      );
      if (!isDeepStrictEqual(before, after))
        requirementHistory.push(
          appendWorkflowDraftRequirementHistory({
            draftId: input.draft.id,
            revision: input.draft.revision + 1,
            history: requirementHistory,
            before,
            after,
            sourceMessageIds:
              change.kind === 'set-requirement'
                ? change.requirement.sourceMessageIds
                : change.sourceMessageIds,
            messages: input.context.messages,
          }),
        );
    } else applyDraftChange(content, change);
  }
  const impact = analyzeDraftChangeImpact({
    before: input.draft,
    after: content,
    context: input.context,
  });
  if (!impact.affectedNodeIds.length && !impact.changedRequirementIds.length)
    throw new Error(
      'Draft change set does not change any requirement, node or connection',
    );
  const affected = new Set(impact.affectedNodeIds);
  const draft: WorkflowDraft = {
    ...content,
    revision: input.draft.revision + 1,
    requirementHistory,
    approvals: input.draft.approvals.map((approval) => ({
      ...structuredClone(approval),
      invalidatedNodeIds: [
        ...new Set([
          ...approval.invalidatedNodeIds,
          ...approval.nodeIds.filter((id) => affected.has(id)),
        ]),
      ],
    })),
  };
  validateWorkflowDraft({ draft, context: input.context });
  return { draft, impact };
}
