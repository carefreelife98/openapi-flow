import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  describeApiLiteralGeneration,
  createApiLiteralGenerationRecord,
  validateApiArguments,
  applyConfirmedApiInputs,
} from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import type {
  GenerateApiArgumentsInput,
  ApiLiteralGenerationOutput,
} from '../types/argument-generation.js';
import {
  apiLiteralGenerationOptionsSchema,
  createApiLiteralGenerationOutputSchema,
} from '../schemas/api-literal-generation-output-schema.js';
import { apiArgumentsPrompt } from '../prompts/api-arguments-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function generateApiArguments(
  input: GenerateApiArgumentsInput,
): Promise<ApiCallArguments> {
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'generateApiArguments.model must support structured output when supplied',
    );
  if (typeof input.callId !== 'string' || !input.callId.trim())
    throw new Error('callId must be non-empty');
  const options = apiLiteralGenerationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  const {
    input: snapshot,
    contract,
    context,
  } = describeApiLiteralGeneration(input);
  const schema = createApiLiteralGenerationOutputSchema(
    contract,
    options.includeExplanations === true,
  );
  let proposed: ApiLiteralGenerationOutput = { values: {} };
  if (contract.hasLiteralInputs) {
    const model = input.model;
    if (!model || typeof model.withStructuredOutput !== 'function')
      throw new Error(
        'generateApiArguments.model must support structured output when literal inputs remain',
      );
    proposed = await model
      .withStructuredOutput<ApiLiteralGenerationOutput>(schema, {
        name: 'generate_api_arguments',
        method: 'functionCalling',
      })
      .invoke([
        new SystemMessage(apiArgumentsPrompt),
        new HumanMessage(JSON.stringify(context)),
      ]);
  }
  const parsed = parseStructuredOutput<ApiLiteralGenerationOutput>(
    schema,
    proposed,
    `model arguments for ${snapshot.callId}`,
  );
  const values = applyConfirmedApiInputs({
    ...snapshot,
    values: parsed.values,
  });
  const validation = validateApiArguments({ ...snapshot, values });
  return {
    callId: snapshot.callId,
    values,
    bindings: structuredClone(snapshot.bindings),
    unresolvedInputs: validation.missingInputs,
    ...(snapshot.requestMediaType === undefined
      ? {}
      : { requestMediaType: snapshot.requestMediaType }),
    ...(options.includeExplanations === true
      ? {
          literalGeneration: createApiLiteralGenerationRecord({
            ...snapshot,
            ...('explanation' in parsed
              ? {
                  proposal: { values: parsed.values },
                  reason: parsed.explanation.reason,
                }
              : {}),
          }),
        }
      : {}),
  };
}
