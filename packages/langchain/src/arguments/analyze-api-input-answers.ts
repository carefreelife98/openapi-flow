import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  captureApiInputAnswerContext,
  createApiInputAnswerExtractionRecord,
  resolveApiInputAnswerSources,
  describeApiInputSources,
  resolveApiInputSourceSelections,
} from '@openapi-flow/core';
import type {
  ApiInputAnswerAnalysis,
  ApiInputAnswerExtractionRecord,
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
  });
  const snapshot = captureApiInputAnswerContext({
    reply: input.reply,
    requirements: input.requirements,
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
  const schema = createApiInputAnswerSourceSchema(
    snapshot.requirements,
    catalog,
    options.includeExplanations === true,
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
    selections: parsed.answers.map(({ requirementId, source }) => ({
      requirementId,
      source,
    })),
  });
  const resolved = resolveApiInputAnswerSources({
    ...snapshot,
    selections,
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
        answers: parsed.answers.map((source, index) => {
          if (typeof source.reason !== 'string')
            throw new Error(
              `model answer ${source.requirementId} requires an explanation`,
            );
          return { ...selections[index], reason: source.reason };
        }),
      },
    });
  }
  return {
    status: 'extracted',
    answers: resolved.answers,
    sources: resolved.sources,
    unansweredRequirementIds: resolved.unansweredRequirementIds,
    ...(extraction === undefined ? {} : { extraction }),
  };
}
