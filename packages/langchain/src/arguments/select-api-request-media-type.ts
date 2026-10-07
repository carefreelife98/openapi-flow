import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  listApiRequestMediaTypes,
  selectDefaultApiRequestMediaType,
} from '@openapi-flow/core';
import type {
  ApiRequestMediaTypeOutput,
  SelectApiRequestMediaTypeInput,
} from '../types/request-media-selection.js';
import { createApiRequestMediaTypeSchema } from '../schemas/api-request-media-type-schema.js';
import { apiRequestMediaTypePrompt } from '../prompts/api-request-media-type-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function selectApiRequestMediaType(
  input: SelectApiRequestMediaTypeInput,
): Promise<string | undefined> {
  assertSelectionInput(input.scenario, input.model);
  const mediaTypes = listApiRequestMediaTypes(input.operation);
  if (input.operation.operation.requestBody === undefined) return undefined;
  if (mediaTypes.length === 0)
    throw new Error(
      `${input.operation.key.operationRef}.requestBody.content has no request media type`,
    );
  if (mediaTypes.length === 1) return mediaTypes[0];
  const schema = createApiRequestMediaTypeSchema(mediaTypes);
  const output = await input.model
    .withStructuredOutput<ApiRequestMediaTypeOutput>(schema, {
      name: 'select_api_request_media_type',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(apiRequestMediaTypePrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          operation: {
            key: input.operation.key,
            method: input.operation.method,
            path: input.operation.path,
            requestBody: input.operation.operation.requestBody,
          },
        }),
      ),
    ]);
  const selected = parseStructuredOutput(
    schema,
    output,
    'model API request media type',
  );
  if (selected.requestMediaType === null)
    return selectDefaultApiRequestMediaType(input.operation);
  return selected.requestMediaType;
}
