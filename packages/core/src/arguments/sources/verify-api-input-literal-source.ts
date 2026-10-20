import type {
  VerifyApiInputLiteralSourceInput,
  ReadApiInputLiteralSourceResult,
} from '../../types/api-input-literal-source.js';
import { readApiInputLiteralSource } from './read-api-input-literal-source.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** A source token must be complete and equal the proposed JSON value, without conversion. */
export function verifyApiInputLiteralSource(
  input: VerifyApiInputLiteralSourceInput,
): ReadApiInputLiteralSourceResult {
  const parsed = readApiInputLiteralSource(input);
  if (!jsonValuesEqual(parsed.value, input.value))
    throw new Error(
      `${input.label} does not equal its exact user source without conversion`,
    );
  return parsed;
}
