import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  captureApiInputAnswerContext,
  createApiInputAnswerExtractionRecord,
  describeApiInputEnumAnswerChoices,
  hasApiInputAnswerSourceText,
  fingerprintApiInputAnswerContext,
  resolveApiInputAnswerInterpretations,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  ApiInputAnswerAnalysis,
  ApiInputEnumAnswerSelection,
} from '@openapi-flow/core';
import type { AnalyzeApiInputAnswersInput } from '../types/api-input-answers.js';
import type { ApiArgumentEnumDecisionOutput } from '../types/argument-generation.js';
import { createApiArgumentEnumDecisionSchema } from '../schemas/api-argument-enum-decision-schema.js';
import { apiInputAnswerExplanationOptionsSchema } from '../schemas/api-input-answer-source-schema.js';
import { apiArgumentEnumsPrompt } from '../prompts/api-argument-enums-prompt.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

/** Initial OAS meaning decisions; HITL literal extraction keeps its separate protocol. */
export async function selectApiArgumentEnums(
  input: AnalyzeApiInputAnswersInput,
): Promise<ApiInputAnswerAnalysis> {
  modelSignalSchema.parse(input.signal);
  const options = apiInputAnswerExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
    selectOasEnums: input.selectOasEnums,
  });
  const capture = () =>
    captureApiInputAnswerContext({
      reply: input.reply,
      requirements: input.requirements,
      ...(input.sourceMessages === undefined
        ? {}
        : { sourceMessages: input.sourceMessages }),
      ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
      selectOasEnums: input.selectOasEnums,
    });
  const snapshot = capture();
  if (snapshot.selectOasEnums !== true)
    throw new Error('Initial API enum decisions require selectOasEnums: true');
  if (!snapshot.requirements.length || !hasApiInputAnswerSourceText(snapshot))
    return {
      status: snapshot.requirements.length
        ? 'empty-reply'
        : 'no-pending-inputs',
      answers: [],
      sources: [],
      unansweredRequirementIds: snapshot.requirements.map((item) => item.id),
    };
  const choices = describeApiInputEnumAnswerChoices(snapshot);
  if (choices.length !== snapshot.requirements.length)
    throw new Error(
      'Initial API enum decisions accept only OAS enum questions',
    );
  const messages =
    snapshot.sourceMessages === undefined
      ? [{ id: 'scenario', text: snapshot.reply }]
      : snapshot.sourceMessages;
  if (!input.model)
    throw new Error(
      'selectApiArgumentEnums.model is required for enum decisions',
    );
  const schema = createApiArgumentEnumDecisionSchema(
    choices,
    messages,
    options.includeExplanations === true,
  );
  const output = await invokeStructuredModel<ApiArgumentEnumDecisionOutput>({
    model: input.model,
    schema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
    operation: 'selectApiArgumentEnums',
    name: 'select_api_argument_enums',
    method: 'functionCalling',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(apiArgumentEnumsPrompt),
      new HumanMessage(
        JSON.stringify({
          ...(snapshot.purpose === undefined
            ? {}
            : { purpose: snapshot.purpose }),
          questions: snapshot.requirements,
          enumChoices: choices,
          sourceMessages: messages,
        }),
      ),
    ],
  });
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'selectApiArgumentEnums',
      stage: 'contract-validation',
      code: 'API_ARGUMENT_VALIDATION_FAILED',
    },
    () => {
      if (!isDeepStrictEqual(snapshot, capture()))
        throw new Error('API enum source contracts changed during planning');
      const parsed = parseStructuredOutput(
        createApiArgumentEnumDecisionSchema(
          choices,
          messages,
          options.includeExplanations === true,
          false,
        ),
        output,
        'model API enum decisions',
      );
      const enumSelections: ApiInputEnumAnswerSelection[] = [];
      for (const requirement of snapshot.requirements) {
        const decision = parsed.decisions[requirement.id];
        if (decision.status === 'not-supplied') continue;
        const source =
          messages.length === 1
            ? messages[0]
            : messages.find((item) => item.id === decision.sourceMessageId);
        if (source === undefined)
          throw new Error(
            `API enum ${requirement.id} has no original source message`,
          );
        enumSelections.push({
          requirementId: requirement.id,
          candidateId: decision.candidateId,
          sourceFingerprint: fingerprintApiInputAnswerContext(snapshot),
          intent: {
            sourceFormat: 'text',
            sourceText: source.text,
            ...(snapshot.sourceMessages === undefined
              ? {}
              : { messageId: source.id }),
          },
          ...(decision.explanation === undefined
            ? {}
            : { reason: decision.explanation.reason }),
        });
      }
      const resolved = resolveApiInputAnswerInterpretations({
        ...snapshot,
        selections: [],
        ...(enumSelections.length ? { enumSelections } : {}),
      });
      const reasons = Object.values(parsed.decisions).flatMap((decision) =>
        decision.explanation === undefined ? [] : [decision.explanation.reason],
      );
      return {
        status: 'extracted',
        ...resolved,
        ...(reasons.length
          ? {
              extraction: createApiInputAnswerExtractionRecord({
                ...snapshot,
                decision: {
                  reason: reasons.join('\n'),
                  answers: [],
                  ...(enumSelections.length ? { enumSelections } : {}),
                },
              }),
            }
          : {}),
      };
    },
  );
}
