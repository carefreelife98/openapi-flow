import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import {
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
} from '@openapi-flow/core';
import type { WorkflowPlanningContext } from '@openapi-flow/core';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { activeDraftConversationMessages } from './active-draft-conversation-messages.js';

export function draftConversationClarificationSourceContext(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowPlanningContext {
  if (!state.clarification)
    throw new Error('Clarification source context requires the original round');
  return {
    messages: state.clarification.round.sourceMessages,
    operations: dependencies.context.operations,
    capabilities: dependencies.context.capabilities,
    entrypoint: describeN8nManualTrigger(),
  };
}
/** A separate checkpointed model node; answering a question never reruns this call. */
export async function clarifyDraftConversationRequest(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  if (
    !dependencies.clarification ||
    !state.turnRequestMessageIds ||
    !state.turnMessages ||
    !state.events
  )
    throw new Error(
      'Request clarification requires explicit budgets and initialized original request messages',
    );
  const messages = state.turnRequestMessageIds.map((id) => {
    const message = state.turnMessages!.find((message) => message.id === id);
    if (!message)
      throw new Error(
        `Clarification original request message ${id} is missing`,
      );
    return message;
  });
  const context: WorkflowPlanningContext = {
    messages,
    operations: dependencies.context.operations,
    capabilities: dependencies.context.capabilities,
    entrypoint: describeN8nManualTrigger(),
  };
  const round = await clarifyWorkflowRequirements({
    model: dependencies.model,
    context,
    backgroundMessages: activeDraftConversationMessages(
      state.turnMessages,
      state.inactiveClarificationMessageIds,
    ).filter((message) => !state.turnRequestMessageIds!.includes(message.id)),
    limits: dependencies.clarification.limits,
    options: {
      includeExplanations: dependencies.includeExplanations,
      includeSuggestions: dependencies.clarification.includeSuggestions,
    },
  });
  const resolution = resolveWorkflowClarificationReplies({
    round,
    context,
    replies: [],
  });
  return {
    clarification: prepareWorkflowDraftClarification({
      context,
      round,
      resolution,
    }),
    phase: resolution.pendingQuestionIds.length
      ? 'clarification-questions'
      : 'analyzing',
    events: [...state.events, { kind: 'clarification-round', id: round.id }],
  };
}
