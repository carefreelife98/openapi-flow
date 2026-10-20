import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationContext } from './draft-conversation-context.js';

export async function analyzeDraftConversationTurn(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  if (!state.draft || !state.requestMessageIds || !state.events)
    throw new Error(
      'Draft conversation requires initialized draft, requestMessageIds and events',
    );
  const plan = await analyzeWorkflowDraftEdit({
    draft: state.draft,
    context: draftConversationContext(state, dependencies),
    requestMessageIds: state.requestMessageIds,
    options: { includeExplanations: dependencies.includeExplanations },
    model: dependencies.model,
  });
  return {
    plan,
    events: [...state.events, { kind: 'plan', id: plan.id }],
    phase:
      state.clarification !== undefined
        ? 'scoping'
        : dependencies.reviewPolicy === 'review' && plan.status !== 'no-change'
          ? 'selecting'
          : 'planning',
  };
}
