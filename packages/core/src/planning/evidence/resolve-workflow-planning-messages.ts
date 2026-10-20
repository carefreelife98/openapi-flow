import type { WorkflowPlanningContext } from '../../types/planning-evidence.js';
import type { WorkflowSourceMessage } from '../../types/workflow-draft.js';
import {
  workflowPlanningMessagesSchema,
  workflowSourceMessagesSchema,
} from '../../schemas/planning-evidence-schema.js';
import { workflowPlanningMessageIdsSchema } from '../../schemas/workflow-planning-message-ids-schema.js';

/** Audit messages remain declared; only explicitly active IDs enter model/evidence payloads. */
export function resolveWorkflowPlanningMessages(
  context: WorkflowPlanningContext,
): WorkflowSourceMessage[] {
  const parsed = workflowSourceMessagesSchema.safeParse(context?.messages);
  if (!parsed.success)
    throw new Error(
      'planning context.messages requires distinct non-empty IDs and string text',
      { cause: parsed.error },
    );
  if (context.planningMessageIds === undefined) {
    const active = workflowPlanningMessagesSchema.safeParse(parsed.data);
    if (!active.success)
      throw new Error(
        'planning context.messages requires at least one message with non-empty text when planningMessageIds is omitted',
        { cause: active.error },
      );
    return active.data;
  }
  const ids = workflowPlanningMessageIdsSchema.parse(
    context.planningMessageIds,
  );
  return ids.map((id) => {
    const message = parsed.data.find((entry) => entry.id === id);
    if (!message)
      throw new Error(`planningMessageIds references unknown message ${id}`);
    const selected = workflowPlanningMessagesSchema.element.safeParse(message);
    if (!selected.success)
      throw new Error(
        `planning context.messages selected message ${id} requires non-empty text`,
        { cause: selected.error },
      );
    return selected.data;
  });
}
