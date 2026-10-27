import type {
  ApiLiteralGenerationOutput,
  ResolvedApiLiteralGenerationOutput,
} from '../types/argument-generation.js';

/** Only an explicit absence decision produces empty values; supplied empty literals are never removed. */
export function resolveApiLiteralGenerationOutput(
  output: ApiLiteralGenerationOutput,
): ResolvedApiLiteralGenerationOutput {
  if ('literalInputs' in output) {
    const literals = output.literalInputs;
    const enumIntentInputs =
      'enumIntentInputs' in output ? output.enumIntentInputs : undefined;
    return {
      ...(literals.state === 'not-provided'
        ? { values: {}, literalSources: [] }
        : { values: literals.values, literalSources: literals.literalSources }),
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
