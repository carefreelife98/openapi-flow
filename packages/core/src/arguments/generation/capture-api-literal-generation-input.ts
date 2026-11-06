import type { ApiLiteralGenerationInput } from '../../types/api-literal-generation.js';
import { apiLiteralGenerationIdentitySchema } from '../../schemas/api-literal-generation-schema.js';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';

/** Capture source identity without constructing validation or model contracts. */
export function captureApiLiteralGenerationInput(
  input: ApiLiteralGenerationInput,
): ApiLiteralGenerationInput {
  const identity = apiLiteralGenerationIdentitySchema.parse({
    callId: input.callId,
    scenario: input.scenario,
    literalSourceMessages: input.literalSourceMessages,
    purpose: input.purpose,
  });
  if (
    !input.operation ||
    !apiOperationKeySchema.safeParse(input.operation.key).success
  )
    throw new Error('literal generation operation.key is missing or invalid');
  if (!Array.isArray(input.bindings))
    throw new Error('arguments.bindings must be an array');
  return {
    callId: identity.callId,
    scenario: identity.scenario,
    ...(identity.literalSourceMessages === undefined
      ? {}
      : {
          literalSourceMessages: structuredClone(
            identity.literalSourceMessages,
          ),
        }),
    operation: structuredClone(input.operation),
    bindings: structuredClone(input.bindings),
    ...(identity.purpose === undefined ? {} : { purpose: identity.purpose }),
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
    ...(input.confirmedInputs === undefined
      ? {}
      : { confirmedInputs: structuredClone(input.confirmedInputs) }),
  };
}
