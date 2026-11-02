import { resolveApiLiteralValues } from '@openapi-flow/core';
import type { ResolveApiLiteralValuesInput } from '@openapi-flow/core';
import { attributeApiLiteralGenerationSources } from './attribute-api-literal-generation-sources.js';
import type {
  ApiLiteralGenerationOutput,
  ResolvedApiLiteralGenerationOutput,
} from '../types/argument-generation.js';

/** Only an explicit absence decision produces empty values; supplied empty literals are never removed. */
export function resolveApiLiteralGenerationOutput(
  output: ApiLiteralGenerationOutput,
  input: Omit<ResolveApiLiteralValuesInput, 'selections'>,
): ResolvedApiLiteralGenerationOutput {
  if ('literalInputs' in output) {
    const literals = output.literalInputs;
    const enumIntentInputs =
      'enumIntentInputs' in output ? output.enumIntentInputs : undefined;
    return {
      ...(literals.state === 'not-provided'
        ? { values: {}, literalSources: [] }
        : resolveApiLiteralValues({
            ...input,
            selections: attributeApiLiteralGenerationSources(
              { literalSourceMessages: input.messages },
              literals.literalSources,
            ),
          })),
      requestedInputs:
        enumIntentInputs === undefined
          ? output.requestedInputs
          : [...new Set([...output.requestedInputs, ...enumIntentInputs])],
      ...(enumIntentInputs === undefined ? {} : { enumIntentInputs }),
      ...('explanation' in output ? { explanation: output.explanation } : {}),
    };
  }
  return output;
}
