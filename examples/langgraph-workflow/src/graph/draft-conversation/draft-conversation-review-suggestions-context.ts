import {
  stageWorkflowDraftEdit,
  describeWorkflowDraftCapabilityGap,
} from '@openapi-flow/core';
import type {
  WorkflowReviewSuggestionsInput,
  WorkflowReviewBoundary,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewSourceToken } from './draft-conversation-review-token.js';
import {
  draftConversationContext,
  draftConversationEditInput,
} from './draft-conversation-context.js';

/** A read-only host projection. Never send n8n JSON, deployment URLs or credential configuration to this model. */
export function draftConversationReviewSuggestionsContext(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowReviewSuggestionsInput {
  if (
    !state.draft ||
    !state.messages ||
    !state.questions ||
    !dependencies.reviewSuggestions
  )
    throw new Error(
      'Review suggestions require initialized draft/messages/questions and explicit settings',
    );
  const initial = state.phase === 'clarification-questions';
  if (
    !initial &&
    state.phase !== 'selecting' &&
    state.phase !== 'questions' &&
    state.phase !== 'candidate'
  )
    throw new Error(
      'Review suggestions require an actual review or question boundary',
    );
  if (initial && !state.clarification)
    throw new Error(
      'Initial review suggestions require the original clarification round',
    );
  const stage = initial
    ? undefined
    : stageWorkflowDraftEdit(draftConversationEditInput(state, dependencies));
  const questions = initial
    ? state
        .clarification!.round.categories.flatMap(
          (category) => category.questions,
        )
        .filter(
          (question) =>
            state.clarification!.resolution.pendingQuestionIds.includes(
              question.id,
            ) ||
            state.clarification!.resolution.deferredQuestionIds.includes(
              question.id,
            ),
        )
        .map((question) => ({
          id: question.id,
          message: question.message,
          ...(question.answer.kind === 'text'
            ? {}
            : {
                answer: {
                  kind: question.answer.kind,
                  choices: question.answer.choices.map(({ id, label }) => ({
                    id,
                    label,
                  })),
                },
              }),
        }))
    : state.questions.map((question) => ({
        id: question.id,
        message: question.message,
      }));
  const kind: WorkflowReviewBoundary['kind'] = initial
    ? 'requirements-clarification'
    : state.phase === 'selecting'
      ? 'selection-review'
      : state.phase === 'questions'
        ? 'planning-questions'
        : 'candidate-review';
  return {
    context: draftConversationContext(state, dependencies),
    boundary: {
      key: draftConversationReviewSourceToken(state),
      kind,
      revision: state.draft.revision,
      questions,
      data: JSON.parse(
        JSON.stringify({
          draft: {
            requirements: state.draft.requirements,
            apiCalls: state.draft.apiCalls,
            nativeNodes: state.draft.nativeNodes,
            ...(state.draft.gapNodes === undefined
              ? {}
              : {
                  gapNodes: state.draft.gapNodes.map((gap) =>
                    describeWorkflowDraftCapabilityGap({
                      gap,
                      context: draftConversationContext(state, dependencies),
                    }),
                  ),
                }),
            edges: state.draft.edges,
          },
          bindingQuestions: state.questions.flatMap((question) =>
            question.bindingQuestion === undefined
              ? []
              : [question.bindingQuestion],
          ),
          ...(state.plan === undefined
            ? {}
            : {
                selectedRoles: state.plan.steps.map((step) => ({
                  decision: step.decision,
                  ...(step.newNodeId === undefined
                    ? {}
                    : { nodeId: step.newNodeId }),
                })),
              }),
          ...(state.clarification === undefined
            ? {}
            : {
                clarification: {
                  facts: state.clarification.resolution.facts,
                  questions: state.clarification.round.categories.flatMap(
                    (category) => category.questions,
                  ),
                  pendingQuestionIds:
                    state.clarification.resolution.pendingQuestionIds,
                  deferredQuestionIds:
                    state.clarification.resolution.deferredQuestionIds,
                },
              }),
          ...(stage === undefined
            ? {}
            : {
                staged: {
                  ...stage.content,
                  ...(stage.content.gapNodes === undefined
                    ? {}
                    : {
                        gapNodes: stage.content.gapNodes.map((gap) =>
                          describeWorkflowDraftCapabilityGap({
                            gap,
                            context: draftConversationContext(
                              state,
                              dependencies,
                            ),
                          }),
                        ),
                      }),
                },
                selectedApiResponses: stage.apiResponseSources.map(
                  (source) => ({
                    nodeId: source.nodeId,
                    method: source.operation.method,
                    path: source.operation.path,
                    responses: source.operation.operation.responses,
                    parameters: source.operation.effective.parameters,
                    requestBody: source.operation.operation.requestBody,
                    preparation: source.preparation,
                  }),
                ),
              }),
          ...(state.phase === 'candidate' && state.candidate !== undefined
            ? {
                candidate: {
                  requirements: state.candidate.result.draft.requirements,
                  apiCalls: state.candidate.result.draft.apiCalls,
                  nativeNodes: state.candidate.result.draft.nativeNodes,
                  ...(state.candidate.result.draft.gapNodes === undefined
                    ? {}
                    : {
                        gapNodes: state.candidate.result.draft.gapNodes.map(
                          (gap) =>
                            describeWorkflowDraftCapabilityGap({
                              gap,
                              context: draftConversationContext(
                                state,
                                dependencies,
                              ),
                            }),
                        ),
                      }),
                  edges: state.candidate.result.draft.edges,
                  ...(state.candidate.result.status === 'changed'
                    ? { impact: state.candidate.result.impact }
                    : {}),
                },
              }
            : {}),
        }),
      ),
    },
    limits: dependencies.reviewSuggestions.limits,
    options: {
      includeExplanations: dependencies.includeExplanations,
      includeExtensions: dependencies.reviewSuggestions.includeExtensions,
    },
  };
}
