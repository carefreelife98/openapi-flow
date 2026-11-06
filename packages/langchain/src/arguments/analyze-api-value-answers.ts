import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  captureApiInputAnswerContext,
  createApiInputAnswersSchema,
  resolveApiValueAnswers,
} from '@openapi-flow/core';
import type {
  ApiValueAnswerProposal,
  ApiValueAnswerAnalysis,
} from '@openapi-flow/core';
import type { AnalyzeApiValueAnswersInput } from '../types/api-value-answers.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { apiValueAnswersPrompt } from '../prompts/api-value-answers-prompt.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';

export async function analyzeApiValueAnswers(
  input: AnalyzeApiValueAnswersInput,
): Promise<ApiValueAnswerAnalysis> {
  modelSignalSchema.parse(input.signal);
  input.signal?.throwIfAborted();
  if (Object.hasOwn(input, 'sourceMessages'))
    throw new Error(
      'analyzeApiValueAnswers requires one original reply, not sourceMessages',
    );
  const capture = () =>
    captureApiInputAnswerContext({
      reply: input.reply,
      requirements: input.requirements,
      ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
      ...(input.selectOasEnums === undefined
        ? {}
        : { selectOasEnums: input.selectOasEnums }),
    });
  const context = capture();
  if (!context.requirements.length || !context.reply.length)
    return {
      status: context.requirements.length ? 'empty-reply' : 'no-pending-inputs',
      answers: [],
      sources: [],
      unansweredRequirementIds: context.requirements.map(
        (requirement) => requirement.id,
      ),
    };
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'analyzeApiValueAnswers.model is required for pending answers',
    );
  const schema = createApiInputAnswersSchema(context.requirements);
  const proposal = await invokeStructuredModel<ApiValueAnswerProposal>({
    model: input.model,
    schema: serializeStructuredOutputSchema(
      schema,
      'draft-2020-12',
      'output',
      'ref',
    ),
    operation: 'analyzeApiValueAnswers',
    name: 'analyze_api_value_answers',
    method: 'functionCalling',
    strict: false,
    signal: input.signal,
    messages: [
      new SystemMessage(apiValueAnswersPrompt),
      new HumanMessage(JSON.stringify(context)),
    ],
  });
  input.signal?.throwIfAborted();
  if (!isDeepStrictEqual(context, capture()))
    throw new Error(
      'API value answer reply or OAS questions changed while planning',
    );
  return resolveApiValueAnswers({ ...context, proposal });
}
