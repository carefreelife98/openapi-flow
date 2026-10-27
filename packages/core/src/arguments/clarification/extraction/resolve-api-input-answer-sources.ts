import type {
  ResolveApiInputAnswerSourcesInput,
  ResolvedApiInputAnswerSources,
} from '../../../types/api-input-answer-extraction.js';
import { apiInputAnswerSourcesSchema } from '../../../schemas/api-input-answer-extraction-schema.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { readApiInputLiteralSource } from '../../sources/read-api-input-literal-source.js';
import { createOasValueValidator } from '../../../openapi/common/create-oas-value-validator.js';
import { apiInputRequirementDialect } from '../api-input-requirement-dialect.js';
import { resolveApiInputAnswerSourceText } from '../../sources/api-input-answer-message-sources.js';

/** Model-selected source text is the only value source, never a model-generated value. */
export function resolveApiInputAnswerSources(
  input: ResolveApiInputAnswerSourcesInput,
): ResolvedApiInputAnswerSources {
  const context = captureApiInputAnswerContext({
    reply: input.reply,
    ...(input.sourceMessages === undefined
      ? {}
      : { sourceMessages: input.sourceMessages }),
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  });
  const selections = apiInputAnswerSourcesSchema.parse(input.selections);
  const answered = new Set<string>();
  const result: ResolvedApiInputAnswerSources = {
    answers: [],
    sources: [],
    unansweredRequirementIds: [],
  };
  for (const selection of selections) {
    const requirement = context.requirements.find(
      (item) => item.id === selection.requirementId,
    );
    if (!requirement || answered.has(selection.requirementId))
      throw new Error(
        `Unknown or duplicate requirementId: ${selection.requirementId}`,
      );
    const { value, occurrences } = readApiInputLiteralSource({
      ...selection,
      text: resolveApiInputAnswerSourceText(context, selection),
      label: `Answer ${requirement.id}`,
    });
    const checked = createOasValueValidator(
      requirement.schema,
      apiInputRequirementDialect(requirement),
      `answer ${requirement.targetPointer}`,
    ).validate(value);
    if (!checked.valid)
      throw new Error(
        `Answer ${requirement.id} violates its supplied OAS schema: ${checked.errors.map((error) => error.message).join('; ')}`,
      );
    answered.add(requirement.id);
    result.answers.push({ requirementId: requirement.id, value });
    result.sources.push({ ...selection, occurrences });
  }
  result.unansweredRequirementIds = context.requirements
    .filter((item) => !answered.has(item.id))
    .map((item) => item.id);
  return result;
}
