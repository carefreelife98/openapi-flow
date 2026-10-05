import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createApiArgumentGenerationContract,
  validateApiArguments,
} from '@openapi-flow/core';
import type { ApiArgumentProposal, ApiCallArguments } from '@openapi-flow/core';
import type { GenerateApiArgumentsInput } from '../types/argument-generation.js';
import { apiArgumentsPrompt } from '../prompts/api-arguments-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function generateApiArguments(
  input: GenerateApiArgumentsInput,
): Promise<ApiCallArguments> {
  assertSelectionInput(input.scenario, input.model);
  if (typeof input.callId !== 'string' || !input.callId.trim())
    throw new Error('callId must be non-empty');
  const contract = createApiArgumentGenerationContract(input);
  const schema = contract.schema;
  const proposed: ApiArgumentProposal = contract.hasLiteralInputs
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
              },
              literalInputSchema: contract.literalInputSchema,
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
