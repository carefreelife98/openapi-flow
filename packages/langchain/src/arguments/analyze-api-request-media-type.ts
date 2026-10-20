import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createApiRequestMediaTypeDecision,
  describeApiRequestMediaTypeContext,
} from '@openapi-flow/core';
import type { ApiRequestMediaTypeDecision } from '@openapi-flow/core';
import type {
  ApiRequestMediaTypeOutput,
  AnalyzeApiRequestMediaTypeInput,
} from '../types/request-media-selection.js';
import { createApiRequestMediaTypeSchema } from '../schemas/api-request-media-type-schema.js';
import { requestMediaSelectionOptionsSchema } from '../schemas/request-media-selection-options-schema.js';
import { apiRequestMediaTypePrompt } from '../prompts/api-request-media-type-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

/** One assessment call only for multiple formats; code owns resolution and sources. */
export async function analyzeApiRequestMediaType(
  input: AnalyzeApiRequestMediaTypeInput,
): Promise<ApiRequestMediaTypeDecision> {
  assertSelectionInput(input.scenario, input.model);
  const options = requestMediaSelectionOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  const operation = structuredClone(input.operation);
  const context = describeApiRequestMediaTypeContext({
    operation,
    scenario: input.scenario,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  });
  if (context.mediaTypes.length < 2)
    return createApiRequestMediaTypeDecision({
      operation,
      scenario: context.scenario,
      ...(context.purpose === undefined ? {} : { purpose: context.purpose }),
    });
  const schema = createApiRequestMediaTypeSchema(
    context.mediaTypes,
    options.includeExplanations === true,
  );
  const proposed = await input.model
    .withStructuredOutput<ApiRequestMediaTypeOutput>(schema, {
      name: 'select_api_request_media_type',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(apiRequestMediaTypePrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: context.scenario,
          ...(context.purpose === undefined
            ? {}
            : { purpose: context.purpose }),
          operation: context.operation,
        }),
      ),
    ]);
  const assessment = parseStructuredOutput(
    schema,
    proposed,
    'model API request media type',
  );
  return createApiRequestMediaTypeDecision({
    operation,
    scenario: context.scenario,
    ...(context.purpose === undefined ? {} : { purpose: context.purpose }),
    assessment,
  });
}
