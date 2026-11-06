import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveApiValueAnswersInput,
  ApiValueAnswerAnalysis,
} from '../../../types/api-value-answers.js';
import type { ApiInputAnswerSource } from '../../../types/api-input-answer-extraction.js';
import type { ApiInputEnumAnswerSelection } from '../../../types/api-input-enum-answers.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { createApiInputAnswersSchema } from '../../../schemas/create-api-input-answers-schema.js';
import { createOriginalApiValueSourceResolver } from '../../sources/create-original-api-value-source-resolver.js';
import { describeApiInputEnumAnswerChoices } from '../../enum/describe-api-input-enum-answer-choices.js';
import { resolveApiInputAnswerInterpretations } from './resolve-api-input-answer-interpretations.js';

/** Pending OAS answers carry values; exact literals and enum receipts are resolved in code. */
export function resolveApiValueAnswers(
  input: ResolveApiValueAnswersInput,
): ApiValueAnswerAnalysis {
  if (Object.hasOwn(input, 'sourceMessages'))
    throw new Error(
      'API value answers require one original reply, not sourceMessages',
    );
  const context = captureApiInputAnswerContext({
    reply: input.reply,
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
  });
  const resolveSource = createOriginalApiValueSourceResolver([
    { id: 'reply', text: context.reply },
  ]);
  const choices = describeApiInputEnumAnswerChoices(context);
  const proposal = createApiInputAnswersSchema(context.requirements).parse(
    input.proposal,
  );
  const selections: ApiInputAnswerSource[] = [];
  const enumSelections: ApiInputEnumAnswerSelection[] = [];
  for (const answer of proposal.answers) {
    const source = resolveSource(answer.value);
    if (source !== undefined) {
      selections.push({
        requirementId: answer.requirementId,
        sourceFormat: source.sourceFormat,
        sourceText: source.sourceText,
      });
      continue;
    }
    const candidate = choices
      .find((choice) => choice.requirementId === answer.requirementId)
      ?.candidates.find((candidate) =>
        isDeepStrictEqual(candidate.value, answer.value),
      );
    if (candidate === undefined)
      throw new Error(
        `API answer ${answer.requirementId} has no exact original reply value or permitted OAS enum`,
      );
    enumSelections.push({
      requirementId: answer.requirementId,
      candidateId: candidate.id,
      intent: { sourceFormat: 'text', sourceText: context.reply },
    });
  }
  return {
    status: 'extracted',
    ...resolveApiInputAnswerInterpretations({
      ...context,
      selections,
      ...(enumSelections.length ? { enumSelections } : {}),
    }),
  };
}
