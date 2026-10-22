import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  captureApiInputAnswerContext,
  createApiInputAnswerExtractionRecord,
  resolveApiInputAnswerInterpretations,
  describeApiInputEnumAnswerChoices,
  describeApiInputSources,
  resolveApiInputSourceSelections,
} from '@openapi-flow/core';
import type {
  ApiInputAnswerAnalysis,
  ApiInputAnswerExtractionRecord,
  ApiInputEnumAnswerSelection,
} from '@openapi-flow/core';
import type {
  AnalyzeApiInputAnswersInput,
  ApiInputAnswersOutput,
} from '../types/api-input-answers.js';
import {
  createApiInputAnswerSourceSchema,
  apiInputAnswerExplanationOptionsSchema,
} from '../schemas/api-input-answer-source-schema.js';
import { apiInputAnswersPrompt } from '../prompts/api-input-answers-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function analyzeApiInputAnswers(
  input: AnalyzeApiInputAnswersInput,
): Promise<ApiInputAnswerAnalysis> {
  const options = apiInputAnswerExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
    selectOasEnums: input.selectOasEnums,
  });
  const snapshot = captureApiInputAnswerContext({
    reply: input.reply,
    requirements: input.requirements,
    ...(options.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: options.selectOasEnums }),
  });
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'analyzeApiInputAnswers.model must support structured output when supplied',
    );
  if (!snapshot.requirements.length || snapshot.reply === '')
    return {
      status: snapshot.requirements.length
        ? 'empty-reply'
        : 'no-pending-inputs',
      answers: [],
      sources: [],
      unansweredRequirementIds: snapshot.requirements.map((item) => item.id),
    };
  const catalog = describeApiInputSources(snapshot.reply);
  if (!catalog.json.length && !catalog.text.length)
    return {
      status: 'extracted',
      answers: [],
      sources: [],
      unansweredRequirementIds: snapshot.requirements.map((item) => item.id),
    };
  if (!input.model)
    throw new Error(
      'analyzeApiInputAnswers.model is required for a nonempty reply with pending inputs',
    );
  const enumChoices = describeApiInputEnumAnswerChoices(snapshot);
  const schema = createApiInputAnswerSourceSchema(
    snapshot.requirements,
    catalog,
    options.includeExplanations === true,
    enumChoices,
  );
  const output = await input.model
    .withStructuredOutput<ApiInputAnswersOutput>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'extract_api_input_answers',
        method: 'functionCalling',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(apiInputAnswersPrompt),
      new HumanMessage(
        JSON.stringify({
          reply: snapshot.reply,
          questions: snapshot.requirements,
          sources: catalog,
          ...(enumChoices.length ? { enumChoices } : {}),
        }),
      ),
    ]);
  const parsed = parseStructuredOutput(
    schema,
    output,
    'model clarification answer sources',
  );
  const selections = resolveApiInputSourceSelections({
    ...snapshot,
    selections: parsed.answers.flatMap(({ requirementId, source }) =>
      source.kind === 'oas-enum' ? [] : [{ requirementId, source }],
    ),
  });
  const enumSelections: ApiInputEnumAnswerSelection[] = parsed.answers.flatMap(
    (answer) => {
      if (answer.source.kind !== 'oas-enum') return [];
      if (typeof answer.reason !== 'string')
        throw new Error(
          `Enum answer ${answer.requirementId} requires an explanation`,
        );
      const [intent] = resolveApiInputSourceSelections({
        ...snapshot,
        selections: [
          { requirementId: answer.requirementId, source: answer.source.intent },
        ],
      });
      return [
        {
          requirementId: answer.requirementId,
          candidateId: answer.source.candidateId,
          intent: {
            sourceFormat: intent.sourceFormat,
            sourceText: intent.sourceText,
          },
          reason: answer.reason,
        },
      ];
    },
  );
  const resolved = resolveApiInputAnswerInterpretations({
    ...snapshot,
    selections,
    ...(enumSelections.length ? { enumSelections } : {}),
  });
  let extraction: ApiInputAnswerExtractionRecord | undefined;
  if (options.includeExplanations === true) {
    if (typeof parsed.reason !== 'string')
      throw new Error(
        'model clarification answer sources require an explanation',
      );
    extraction = createApiInputAnswerExtractionRecord({
      ...snapshot,
      decision: {
        reason: parsed.reason,
        answers: selections.map((selection) => {
          const source = parsed.answers.find(
            (answer) => answer.requirementId === selection.requirementId,
          );
          if (typeof source?.reason !== 'string')
            throw new Error(
              `model answer ${selection.requirementId} requires an explanation`,
            );
          return { ...selection, reason: source.reason };
        }),
        ...(enumSelections.length ? { enumSelections } : {}),
      },
    });
  }
  return {
    status: 'extracted',
    ...resolved,
    ...(extraction === undefined ? {} : { extraction }),
  };
}
