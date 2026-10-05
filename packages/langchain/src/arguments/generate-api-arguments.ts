import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createApiArgumentsSchema,
  validateApiArguments,
} from '@openapi-flow/core';
import type { ApiArgumentProposal, ApiCallArguments } from '@openapi-flow/core';
import type { GenerateApiArgumentsInput } from '../types/argument-generation.js';
import { apiArgumentsPrompt } from '../prompts/api-arguments-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { hasLiteralArgumentFields } from './has-literal-argument-fields.js';

export async function generateApiArguments(
  input: GenerateApiArgumentsInput,
): Promise<ApiCallArguments> {
  assertSelectionInput(input.scenario, input.model);
  if (typeof input.callId !== 'string' || !input.callId.trim())
    throw new Error('callId must be non-empty');
  const schema = createApiArgumentsSchema(input);
  const proposed: ApiArgumentProposal = hasLiteralArgumentFields(schema)
    ? await input.model
        .withStructuredOutput<ApiArgumentProposal>(schema, {
          name: 'generate_api_arguments',
          method: 'functionCalling',
        })
        .invoke([
          new SystemMessage(apiArgumentsPrompt),
          new HumanMessage(
            JSON.stringify({
              scenario: input.scenario,
              operation: {
                key: input.operation.key,
                method: input.operation.method,
                path: input.operation.path,
                summary: input.operation.operation.summary,
                description: input.operation.operation.description,
                parameters: input.operation.effective.parameters,
                requestBody: input.operation.operation.requestBody,
              },
              bindings: input.bindings,
              requestMediaType: input.requestMediaType,
            }),
          ),
        ])
    : { values: {} };
  const parsed = parseStructuredOutput(
    schema,
    proposed,
    `model arguments for ${input.callId}`,
  );
  const validation = validateApiArguments({ ...input, values: parsed.values });
  return {
    callId: input.callId,
    values: parsed.values,
    bindings: structuredClone(input.bindings),
    unresolvedInputs: validation.missingInputs,
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
  };
}
