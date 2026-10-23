import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  describeApiLiteralGeneration,
  createApiLiteralGenerationRecord,
  applyConfirmedApiInputs,
  createApiRequestSchema,
  inspectApiArgumentRequirements,
  resolveApiLiteralProposalSources,
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
import { interpretApiArgumentEnums } from './interpret-api-argument-enums.js';

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
    selectOasEnums: input.selectOasEnums,
    trackRequestedInputs: input.trackRequestedInputs,
  });
  const {
    input: snapshot,
    contract,
    context,
  } = describeApiLiteralGeneration(input);
  const trackInputs =
    options.trackRequestedInputs === true || options.selectOasEnums === true;
  const schema = createApiLiteralGenerationOutputSchema(
    contract,
    options.includeExplanations === true,
    trackInputs ? createApiRequestSchema(snapshot) : undefined,
  );
  let proposed: ApiLiteralGenerationOutput = {
    values: {},
    ...(trackInputs ? { requestedInputs: [], literalSources: [] } : {}),
  };
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
        new HumanMessage(
          JSON.stringify({
            ...context,
            ...(options.selectOasEnums === true
              ? { selectOasEnums: true }
              : {}),
          }),
        ),
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
  const requestedInputs =
    'requestedInputs' in parsed ? parsed.requestedInputs : undefined;
  const literalSources =
    'literalSources' in parsed
      ? resolveApiLiteralProposalSources({
          callId: snapshot.callId,
          values: parsed.values,
          sources: parsed.literalSources.map((source) => ({
            ...source,
            messageId: 'scenario',
          })),
          messages: [{ id: 'scenario', text: snapshot.scenario }],
        })
      : undefined;
  const inspection = inspectApiArgumentRequirements({
    ...snapshot,
    values,
    requestedInputs,
  });
  const result: ApiCallArguments = {
    callId: snapshot.callId,
    values,
    bindings: structuredClone(snapshot.bindings),
    unresolvedInputs: inspection.requirements.map((item) => item.targetPointer),
    ...(literalSources === undefined ? {} : { literalSources }),
    ...(requestedInputs === undefined ? {} : { requestedInputs }),
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
  if (options.selectOasEnums === true) {
    if (literalSources === undefined)
      throw new Error(
        'generateApiArguments enum interpretation requires source-verified literalSources',
      );
    return interpretApiArgumentEnums({
      ...snapshot,
      ...options,
      arguments: result,
      proposal: { values: parsed.values },
      literalSources,
      model: input.model,
    });
  }
  return result;
}
