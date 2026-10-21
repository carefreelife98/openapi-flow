import type { WorkflowDraftApiInputEditResult } from '@openapi-flow/core';
import type { WorkflowDraftConversationQuestion } from '../../types/workflow-draft-conversation.js';

/** The target schema comes from Core's original OAS contract, not a host copy. */
export function describeDraftConversationApiInputEditQuestions(
  stepId: string,
  result: WorkflowDraftApiInputEditResult,
): WorkflowDraftConversationQuestion[] {
  if (result.status === 'ready') return [];
  return result.pendingTargets.map((target) => ({
    id: `${result.contractId}:${target.id}`,
    kind: 'api-input-edit',
    stepId,
    message: `${target.pointer}에 사용할 새 값을 입력해 주세요. 기존 값은 재사용하지 않습니다.`,
    apiInputEditTarget: structuredClone(target),
    apiInputEditContractId: result.contractId,
  }));
}
