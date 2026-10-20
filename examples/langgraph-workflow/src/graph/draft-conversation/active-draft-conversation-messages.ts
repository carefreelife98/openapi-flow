import type { WorkflowSourceMessage } from '@openapi-flow/core';

/** The transcript is immutable audit data; retired answer submissions are not current model evidence. */
export function activeDraftConversationMessages(
  messages: WorkflowSourceMessage[],
  inactiveIds: string[] | undefined,
): WorkflowSourceMessage[] {
  if (inactiveIds === undefined) return messages;
  if (
    new Set(inactiveIds).size !== inactiveIds.length ||
    inactiveIds.some((id) => !messages.some((message) => message.id === id))
  )
    throw new Error(
      'Inactive clarification evidence requires distinct original transcript message IDs',
    );
  return messages.filter((message) => !inactiveIds.includes(message.id));
}
