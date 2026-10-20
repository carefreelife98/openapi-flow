import { randomUUID } from 'node:crypto';
import type {
  ApproveWorkflowDraftInput,
  WorkflowDraft,
} from '../types/workflow-draft.js';
import { inspectDraftReadiness } from './inspect-draft-readiness.js';
import { draftRevisionSchema } from '../schemas/workflow-draft-schema.js';
import { validateWorkflowDraft } from './validate-workflow-draft.js';

/** Host approval is an explicit revision-checked action, not a model field. */
export function approveWorkflowDraft(
  input: ApproveWorkflowDraftInput,
): WorkflowDraft {
  const readiness = inspectDraftReadiness(input);
  draftRevisionSchema.parse(input.expectedRevision);
  if (input.expectedRevision !== input.draft.revision)
    throw new Error(
      `Stale approval revision: expected ${input.draft.revision}, received ${input.expectedRevision}`,
    );
  if (
    !Array.isArray(input.nodeIds) ||
    !input.nodeIds.length ||
    new Set(input.nodeIds).size !== input.nodeIds.length
  )
    throw new Error('Draft approval requires distinct nodeIds');
  for (const id of input.nodeIds) {
    const node = readiness.nodes.find((node) => node.nodeId === id);
    if (!node || node.planningStatus !== 'ready')
      throw new Error(`Cannot approve unknown or decision-blocked node ${id}`);
  }
  if (input.draft.revision === Number.MAX_SAFE_INTEGER)
    throw new Error('Draft revision cannot exceed Number.MAX_SAFE_INTEGER');
  const draft = structuredClone(input.draft);
  draft.revision++;
  draft.approvals.push({
    id: randomUUID(),
    revision: draft.revision,
    nodeIds: [...input.nodeIds],
    invalidatedNodeIds: [],
  });
  validateWorkflowDraft({ draft, context: input.context });
  return draft;
}
