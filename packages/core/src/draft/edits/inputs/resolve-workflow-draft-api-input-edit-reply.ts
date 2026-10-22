import type {
  ResolveWorkflowDraftApiInputEditReplyInput,
  WorkflowDraftApiInputEditAnswers,
} from '../../../types/workflow-draft-api-input-edit.js';
import { describeWorkflowDraftApiInputEditAnswerRequirements } from './describe-workflow-draft-api-input-edit-answer-requirements.js';
import { validateApiInputAnswerAnalysis } from '../../../arguments/clarification/extraction/validate-api-input-answer-analysis.js';
import { createWorkflowDraftApiInputEditAnswersSchema } from '../../../schemas/create-workflow-draft-api-input-edit-answers-schema.js';

/** Interpretations become validated answer values, never a replacement model proposal. */
export function resolveWorkflowDraftApiInputEditReply(
  input: ResolveWorkflowDraftApiInputEditReplyInput,
): WorkflowDraftApiInputEditAnswers {
  const requirements =
    describeWorkflowDraftApiInputEditAnswerRequirements(input);
  validateApiInputAnswerAnalysis({
    reply: input.reply,
    requirements,
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
    analysis: input.analysis,
  });
  return createWorkflowDraftApiInputEditAnswersSchema(input).parse({
    contractId: input.contract.id,
    answers: input.analysis.answers.map((answer) => {
      const target = input.contract.targets.find(
        (target) =>
          `${input.contract.id}:${target.id}` === answer.requirementId,
      );
      if (!target)
        throw new Error(
          `API edit reply references an unavailable target ${answer.requirementId}`,
        );
      return { targetId: target.id, value: structuredClone(answer.value) };
    }),
  });
}
