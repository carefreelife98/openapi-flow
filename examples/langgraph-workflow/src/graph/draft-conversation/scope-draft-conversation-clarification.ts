import { planWorkflowDraftClarificationScopes } from '@openapi-flow/langchain';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';

export async function scopeDraftConversationClarification(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  if (!state.clarification || !state.plan || !state.events)
    throw new Error(
      'Clarification scoping requires its original facts and selected plan',
    );
  const clarificationScopes = await planWorkflowDraftClarificationScopes({
    ...draftConversationEditInput(state, dependencies),
    model: dependencies.model,
  });
  return {
    clarificationScopes,
    phase:
      dependencies.reviewPolicy === 'review' &&
      state.plan.status !== 'no-change'
        ? 'selecting'
        : 'planning',
    events: [
      ...state.events,
      { kind: 'clarification-scopes', id: clarificationScopes.fingerprint },
    ],
  };
}
