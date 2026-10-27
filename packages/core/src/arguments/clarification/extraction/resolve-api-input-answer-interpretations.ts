import type {
  ResolveApiInputAnswerInterpretationsInput,
  ResolvedApiInputAnswerInterpretations,
} from '../../../types/api-input-enum-answers.js';
import { apiInputEnumAnswerSelectionsSchema } from '../../../schemas/api-input-enum-answer-selection-schema.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { resolveApiInputAnswerSources } from './resolve-api-input-answer-sources.js';
import { describeApiInputEnumAnswerChoices } from '../../enum/describe-api-input-enum-answer-choices.js';
import { readApiInputLiteralSource } from '../../sources/read-api-input-literal-source.js';
import { resolveApiInputAnswerSourceText } from '../../sources/api-input-answer-message-sources.js';

/** Literal values and semantic intent have different sources and must never be conflated. */
export function resolveApiInputAnswerInterpretations(
  input: ResolveApiInputAnswerInterpretationsInput,
): ResolvedApiInputAnswerInterpretations {
  const context = captureApiInputAnswerContext({
    reply: input.reply,
    ...(input.sourceMessages === undefined
      ? {}
      : { sourceMessages: input.sourceMessages }),
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
  });
  const result: ResolvedApiInputAnswerInterpretations =
    resolveApiInputAnswerSources({
      ...context,
      selections: input.selections,
    });
  if (input.enumSelections === undefined) return result;
  const selections = apiInputEnumAnswerSelectionsSchema.parse(
    input.enumSelections,
  );
  if (context.selectOasEnums !== true)
    throw new Error(
      'API enum answer selection requires selectOasEnums: true in the original context',
    );
  const choices = describeApiInputEnumAnswerChoices(context);
  const answered = new Set(
    result.answers.map((answer) => answer.requirementId),
  );
  result.enumSelections = selections.map((selection) => {
    if (answered.has(selection.requirementId))
      throw new Error(`Duplicate requirementId: ${selection.requirementId}`);
    const candidate = choices
      .find((choice) => choice.requirementId === selection.requirementId)
      ?.candidates.find((item) => item.id === selection.candidateId);
    if (!candidate)
      throw new Error(
        `API enum answer ${selection.requirementId} has an unknown or stale OAS candidate: ${selection.candidateId}`,
      );
    const { occurrences } = readApiInputLiteralSource({
      ...selection.intent,
      text: resolveApiInputAnswerSourceText(context, selection.intent),
      label: `Enum answer intent ${selection.requirementId}`,
    });
    answered.add(selection.requirementId);
    result.answers.push({
      requirementId: selection.requirementId,
      value: structuredClone(candidate.value),
    });
    return { ...selection, candidate: structuredClone(candidate), occurrences };
  });
  result.unansweredRequirementIds = context.requirements
    .filter((item) => !answered.has(item.id))
    .map((item) => item.id);
  return result;
}
