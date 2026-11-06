import type {
  ApiLiteralGenerationInput,
  ApiLiteralGenerationDescription,
} from '../../types/api-literal-generation.js';
import { apiLiteralGenerationContextSchema } from '../../schemas/api-literal-generation-schema.js';
import { createApiArgumentGenerationContract } from '../../schemas/create-api-argument-generation-contract.js';
import { captureApiLiteralGenerationInput } from './capture-api-literal-generation-input.js';

/** Snapshot only declared data fields, never the caller's model or unrelated stage metadata. */
export function describeApiLiteralGeneration(
  input: ApiLiteralGenerationInput,
): ApiLiteralGenerationDescription {
  const snapshot = captureApiLiteralGenerationInput(input);
  const { scenario } = snapshot;
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
