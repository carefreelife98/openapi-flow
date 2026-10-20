import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiLiteralGenerationRecordInput } from '../../types/api-literal-generation.js';
import { createApiLiteralGenerationRecordSchema } from '../../schemas/api-literal-generation-schema.js';
import { describeApiLiteralGeneration } from './describe-api-literal-generation.js';
import { createApiLiteralGenerationRecord } from './create-api-literal-generation-record.js';

/** Use the original generation snapshot, not later confirmed-input state. */
export function validateApiLiteralGenerationRecord(
  input: ValidateApiLiteralGenerationRecordInput,
): void {
  const { input: snapshot, contract } = describeApiLiteralGeneration(input);
  const record = createApiLiteralGenerationRecordSchema(
    contract.valuesSchema,
  ).parse(input.record);
  const expected = createApiLiteralGenerationRecord({
    ...snapshot,
    ...(record.kind === 'not-needed'
      ? {}
      : {
          proposal: { values: record.proposedValues },
          reason: record.explanation.reason,
        }),
  });
  if (!isDeepStrictEqual(record, expected))
    throw new Error(
      'Literal generation record differs from its original scenario, role, OAS projection or input ownership',
    );
}
