import type { WorkflowRequirementsPromptInput } from '../../types/workflow-clarification.js';

/** A readable projection of structured facts, never a second source of truth. */
export function formatWorkflowRequirementsPrompt(
  input: WorkflowRequirementsPromptInput,
): string {
  return [
    '사용자 원문',
    ...input.sourceMessages.map(
      (message) => `- [${message.id}] ${message.text}`,
    ),
    '확인된 요구사항',
    ...input.facts.map((fact) => `- ${fact.text}`),
    ...(input.pendingQuestions.length
      ? [
          '미답변 질문',
          ...input.pendingQuestions.map((question) => `- ${question.message}`),
        ]
      : []),
    ...(input.deferredQuestions.length
      ? [
          '보류한 질문',
          ...input.deferredQuestions.map((question) => `- ${question.message}`),
        ]
      : []),
  ].join('\n');
}
