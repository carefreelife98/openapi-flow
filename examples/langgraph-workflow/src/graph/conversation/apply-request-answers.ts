import {
  applyConfirmedApiInputs,
  inspectApiArgumentRequirements,
  validateApiInputAnswers,
} from '@openapi-flow/core';
import { extractApiInputAnswers } from '@openapi-flow/langchain';
import type {
  ApiInputRequirement,
  ReviewableWorkflowApiMaterial,
} from '@openapi-flow/core';
import type { PlannedGraphDependencies } from '../../types/workflow-graph.js';
import type {
  ConversationState,
  ConversationUpdate,
} from '../../types/workflow-conversation.js';
import type { PendingApiArguments } from '../../types/api-preparation.js';

/** Model extraction is a separate checkpointed node, never replayed by interrupt. */
export async function applyRequestAnswers(
  state: ConversationState,
  dependencies: PlannedGraphDependencies,
): Promise<ConversationUpdate> {
  if (
    !state.contracts ||
    !state.pendingArguments ||
    !state.requirements?.length ||
    !state.reviewMaterials ||
    !state.confirmedInputs ||
    !state.pendingInputResponse
  )
    throw new Error(
      'answer application requires complete pending clarification state',
    );
  const response = state.pendingInputResponse;
  if (response.action === 'cancel')
    throw new Error('Cancelled input must not reach answer application');
  const answers =
    response.action === 'reply'
      ? await extractApiInputAnswers({
          reply: response.text,
          requirements: state.requirements,
          model: dependencies.model,
        })
      : response.answers;
  if (!answers.length)
    return {
      inputAnswerIssues: [
        {
          requirementId: '',
          message:
            'The reply supplies no requested input value. Scope changes require a new planning request.',
        },
      ],
      conversationStatus: 'awaiting-input',
    };
  const checked = validateApiInputAnswers({
    requirements: state.requirements,
    answers,
    operations: state.contracts.map((operation) => operation.key),
  });
  if (checked.status === 'invalid-answer')
    return {
      inputAnswerIssues: checked.issues,
      conversationStatus: 'awaiting-input',
    };
  const pendingArguments: PendingApiArguments[] = [];
  const requirements: ApiInputRequirement[] = [];
  const reviewMaterials: ReviewableWorkflowApiMaterial[] = [
    ...state.reviewMaterials,
  ];
  for (const pending of state.pendingArguments) {
    const args = pending.arguments;
    const confirmedInputs = checked.confirmedInputs.filter(
      (item) => item.callId === args.callId,
    );
    const values = applyConfirmedApiInputs({
      operation: pending.operation,
      callId: args.callId,
      values: args.values,
      bindings: args.bindings,
      requestMediaType: args.requestMediaType,
      confirmedInputs,
    });
    const inspection = inspectApiArgumentRequirements({
      operation: pending.operation,
      callId: args.callId,
      values,
      bindings: args.bindings,
      requestMediaType: args.requestMediaType,
    });
    const updated = {
      ...args,
      values,
      unresolvedInputs: inspection.requirements.map(
        (item) => item.targetPointer,
      ),
    };
    if (inspection.status === 'needs-input') {
      pendingArguments.push({
        operation: pending.operation,
        arguments: updated,
      });
      requirements.push(...inspection.requirements);
    } else
      reviewMaterials.push({
        status: 'ready',
        operation: pending.operation,
        arguments: updated,
      });
  }
  return {
    pendingArguments,
    requirements,
    reviewMaterials,
    confirmedInputs: [...state.confirmedInputs, ...checked.confirmedInputs],
    inputAnswerIssues: [],
    conversationStatus: requirements.length ? 'awaiting-input' : 'working',
  };
}
