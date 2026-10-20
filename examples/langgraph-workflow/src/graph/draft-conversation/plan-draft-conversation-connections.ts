import {
  assembleWorkflowDraftEdit,
  describeWorkflowDraftConnectionEdit,
  createWorkflowDraftEditCandidateContext,
  validateWorkflowDraftNativeDependencyResolutions,
  resolveWorkflowDraftTerminalRemoval,
} from '@openapi-flow/core';
import { planWorkflowDraftConnectionEdit } from '@openapi-flow/langchain';
import { compileN8nWorkflowTemplate } from '@openapi-flow/n8n';
import { selectDraftConversationDeployments } from './select-draft-conversation-deployments.js';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';

export async function planDraftConversationConnections(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const input = draftConversationEditInput(state, dependencies);
  if (state.nativeDependencies !== undefined)
    validateWorkflowDraftNativeDependencyResolutions({
      ...input,
      producerDependencies: state.nativeDependencies,
    });
  const description = describeWorkflowDraftConnectionEdit(input);
  if (description.status === 'waiting-for-materials')
    throw new Error(
      'Conversation scheduler reached connections before explicit material decisions and repairs were ready',
    );
  const structural = resolveWorkflowDraftTerminalRemoval(input);
  const routing =
    structural.status === 'ready' || description.status === 'not-required'
      ? undefined
      : await planWorkflowDraftConnectionEdit({
          ...input,
          model: dependencies.model,
        });
  if (routing?.status === 'needs-clarification')
    return {
      questions: routing.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
      })),
      phase: 'questions',
    };
  if (routing && routing.status !== 'ready')
    throw new Error(
      'Connection planning did not produce an actual ready candidate',
    );
  const result =
    structural.status === 'ready'
      ? structural.result.candidate
      : routing === undefined
        ? assembleWorkflowDraftEdit(input)
        : routing.candidate;
  const empty =
    result.draft.apiCalls.length +
      result.draft.nativeNodes.length +
      (result.draft.gapNodes === undefined
        ? 0
        : result.draft.gapNodes.length) ===
    0;
  const preview = empty
    ? undefined
    : compileN8nWorkflowTemplate({
        draft: result.draft,
        context: createWorkflowDraftEditCandidateContext(input),
        name: dependencies.name,
        itemMode: dependencies.itemMode,
        deployments: selectDraftConversationDeployments(
          result.draft,
          dependencies,
        ),
      });
  return {
    candidate: { result, ...(preview === undefined ? {} : { preview }) },
    connectionResult: routing,
    structuralConnectionResult:
      structural.status === 'ready' ? structural.result : undefined,
    phase:
      result.status === 'changed' && dependencies.reviewPolicy === 'review'
        ? 'candidate'
        : 'adopting',
  };
}
