import type {
  ApiLiteralGenerationInput,
  ApiLiteralGenerationDescription,
} from '../../types/api-literal-generation.js';
import {
  apiLiteralGenerationContextSchema,
  apiLiteralGenerationIdentitySchema,
} from '../../schemas/api-literal-generation-schema.js';
import { createApiArgumentGenerationContract } from '../../schemas/create-api-argument-generation-contract.js';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';

/** Snapshot only declared data fields, never the caller's model or unrelated stage metadata. */
export function describeApiLiteralGeneration(
  input: ApiLiteralGenerationInput,
): ApiLiteralGenerationDescription {
  const { callId, scenario, purpose, literalSourceMessages } =
    apiLiteralGenerationIdentitySchema.parse({
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
  const snapshot: ApiLiteralGenerationInput = {
    callId,
    scenario,
    ...(literalSourceMessages === undefined
      ? {}
      : { literalSourceMessages: structuredClone(literalSourceMessages) }),
    operation: structuredClone(input.operation),
    bindings: structuredClone(input.bindings),
    ...(purpose === undefined ? {} : { purpose }),
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
    ...(input.confirmedInputs === undefined
      ? {}
      : { confirmedInputs: structuredClone(input.confirmedInputs) }),
  };
  const contract = createApiArgumentGenerationContract(snapshot);
  const context = apiLiteralGenerationContextSchema.parse({
    scenario,
    ...(snapshot.literalSourceMessages === undefined
      ? {}
      : { literalSourceMessages: snapshot.literalSourceMessages }),
    ...(snapshot.purpose === undefined ? {} : { purpose: snapshot.purpose }),
    operation: {
      key: snapshot.operation.key,
      method: snapshot.operation.method,
      path: snapshot.operation.path,
      ...(snapshot.operation.operation.summary === undefined
        ? {}
        : { summary: snapshot.operation.operation.summary }),
      ...(snapshot.operation.operation.description === undefined
        ? {}
        : { description: snapshot.operation.operation.description }),
    },
    literalInputSchema: contract.literalInputSchema,
    ...(snapshot.requestMediaType === undefined
      ? {}
      : { requestMediaType: snapshot.requestMediaType }),
  });
  return { input: snapshot, contract, context: structuredClone(context) };
}
