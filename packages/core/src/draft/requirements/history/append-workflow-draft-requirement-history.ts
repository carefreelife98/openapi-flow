import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  AppendWorkflowDraftRequirementHistoryInput,
  WorkflowDraftRequirementHistoryEntry,
} from '../../../types/workflow-draft-requirement-history.js';

/** Snapshots, source quotes and predecessor identity are code-owned, not model fields. */
export function appendWorkflowDraftRequirementHistory(
  input: AppendWorkflowDraftRequirementHistoryInput,
): WorkflowDraftRequirementHistoryEntry {
  const requirement = input.after === undefined ? input.before : input.after;
  if (
    !requirement ||
    (input.before && input.after && input.before.id !== input.after.id)
  )
    throw new Error(
      'Requirement history needs an actual unchanged requirement identity',
    );
  if (
    input.before &&
    input.after &&
    isDeepStrictEqual(input.before, input.after)
  )
    throw new Error(
      `Requirement history cannot record a no-op: ${requirement.id}`,
    );
  if (
    input.after &&
    !isDeepStrictEqual(input.sourceMessageIds, input.after.sourceMessageIds)
  )
    throw new Error(
      `Requirement history ${requirement.id} must preserve the current requirement sourceMessageIds`,
    );
  if (
    !Array.isArray(input.sourceMessageIds) ||
    !input.sourceMessageIds.length ||
    new Set(input.sourceMessageIds).size !== input.sourceMessageIds.length
  )
    throw new Error(
      'Requirement history needs distinct explicit sourceMessageIds',
    );
  if (!Array.isArray(input.messages))
    throw new Error('Requirement history requires context.messages');
  const evidence = input.sourceMessageIds.map((id) => {
    const message = input.messages.find((entry) => entry.id === id);
    if (!message)
      throw new Error(
        `Requirement history ${requirement.id} references unknown source message ${id}`,
      );
    return {
      kind: 'message' as const,
      messageId: message.id,
      quote: message.text,
    };
  });
  const previous = input.history.findLast(
    (entry) => entry.requirementId === requirement.id,
  );
  const change =
    input.before === undefined
      ? {
          kind:
            previous === undefined
              ? ('created' as const)
              : ('restored' as const),
          after: structuredClone(input.after!),
        }
      : input.after === undefined
        ? { kind: 'removed' as const, before: structuredClone(input.before) }
        : {
            kind: 'revised' as const,
            before: structuredClone(input.before),
            after: structuredClone(input.after),
          };
  const fields = {
    revision: input.revision,
    requirementId: requirement.id,
    ...(previous === undefined ? {} : { previousEntryId: previous.id }),
    evidence,
    ...change,
  };
  return {
    id:
      'requirement-history:' +
      createHash('sha256')
        .update(JSON.stringify([input.draftId, fields]))
        .digest('hex'),
    ...fields,
  };
}
