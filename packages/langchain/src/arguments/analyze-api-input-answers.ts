import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  captureApiInputAnswerContext,
  createApiInputAnswerExtractionRecord,
  resolveApiInputAnswerInterpretations,
  describeApiInputEnumAnswerChoices,
  describeApiInputSources,
  describeApiInputMessageSources,
  hasApiInputAnswerSourceText,
  resolveApiInputSourceSelections,
  runOpenApiFlowOperation,
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
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';

export async function analyzeApiInputAnswers(
  input: AnalyzeApiInputAnswersInput,
): Promise<ApiInputAnswerAnalysis> {
  const { options, snapshot } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'analyzeApiInputAnswers',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      const options = apiInputAnswerExplanationOptionsSchema.parse({
        includeExplanations: input.includeExplanations,
        selectOasEnums: input.selectOasEnums,
      });
      const snapshot = captureApiInputAnswerContext({
        reply: input.reply,
        ...(input.sourceMessages === undefined
          ? {}
          : { sourceMessages: input.sourceMessages }),
        requirements: input.requirements,
        ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
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
      return { options, snapshot };
    },
  );
  if (!snapshot.requirements.length || !hasApiInputAnswerSourceText(snapshot))
    return {
      status: snapshot.requirements.length
        ? 'empty-reply'
        : 'no-pending-inputs',
      answers: [],
      sources: [],
      unansweredRequirementIds: snapshot.requirements.map((item) => item.id),
    };
  const catalog =
    snapshot.sourceMessages === undefined
      ? describeApiInputSources(snapshot.reply)
      : undefined;
  const messageSources =
    snapshot.sourceMessages === undefined
      ? undefined
      : describeApiInputMessageSources(snapshot.sourceMessages);
  let hasSources: boolean;
  if (messageSources !== undefined)
    hasSources = messageSources.some(
      ({ sources }) => sources.json.length > 0 || sources.text.length > 0,
    );
  else {
    if (catalog === undefined)
      throw new Error('API input answer sources are missing');
    hasSources = catalog.json.length > 0 || catalog.text.length > 0;
  }
  if (!hasSources)
    return {
      status: 'extracted',
      answers: [],
      sources: [],
      unansweredRequirementIds: snapshot.requirements.map((item) => item.id),
    };
  const { model, schema, wireSchema, enumChoices } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'analyzeApiInputAnswers',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
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
        messageSources,
      );
      return {
        model: input.model,
        schema,
        enumChoices,
        wireSchema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      };
    },
  );
  const output = await invokeStructuredModel<ApiInputAnswersOutput>({
    model,
    schema: wireSchema,
    operation: 'analyzeApiInputAnswers',
    name: 'extract_api_input_answers',
    method: 'functionCalling',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(apiInputAnswersPrompt),
      new HumanMessage(
        JSON.stringify({
          reply: snapshot.reply,
          questions: snapshot.requirements,
          ...(snapshot.purpose === undefined
            ? {}
            : { purpose: snapshot.purpose }),
          ...(catalog === undefined
            ? { messageSources }
            : { sources: catalog }),
          ...(enumChoices.length ? { enumChoices } : {}),
        }),
      ),
    ],
  });
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'analyzeApiInputAnswers',
      stage: 'contract-validation',
      code: 'API_ARGUMENT_VALIDATION_FAILED',
    },
    () => {
      if (
        snapshot.sourceMessages !== undefined &&
        !isDeepStrictEqual(snapshot.sourceMessages, input.sourceMessages)
      )
        throw new Error(
          'sourceMessages changed during API input answer analysis',
        );
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
      const enumSelections: ApiInputEnumAnswerSelection[] =
        parsed.answers.flatMap((answer) => {
          if (answer.source.kind !== 'oas-enum') return [];
          if (typeof answer.reason !== 'string')
            throw new Error(
              `Enum answer ${answer.requirementId} requires an explanation`,
            );
          const [intent] = resolveApiInputSourceSelections({
            ...snapshot,
            selections: [
              {
                requirementId: answer.requirementId,
                source: answer.source.intent,
              },
            ],
          });
          return [
            {
              requirementId: answer.requirementId,
              candidateId: answer.source.candidateId,
              intent: {
                sourceFormat: intent.sourceFormat,
                sourceText: intent.sourceText,
                ...(intent.messageId === undefined
                  ? {}
                  : { messageId: intent.messageId }),
              },
              reason: answer.reason,
            },
          ];
        });
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
    },
  );
}
