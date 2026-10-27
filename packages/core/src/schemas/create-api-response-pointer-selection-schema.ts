import type { z } from 'zod';
import type { ApiResponsePointerSelectionInput } from '../types/api-response-pointers.js';
import { describeApiResponsePointerSelection } from '../openapi/response/describe-api-response-pointer-selection.js';
import { createValuePointerSelectionSchema } from './create-value-pointer-selection-schema.js';

/** Finite declarations are exact choices; open dictionaries/items/references retain dynamic pointers. */
export function createApiResponsePointerSelectionSchema(
  input: ApiResponsePointerSelectionInput,
): z.ZodType<string, string> {
  const description = describeApiResponsePointerSelection(input);
  const help =
    input.valueKind === 'array'
      ? 'RFC 6901 pointer selecting an array in this exact API response. Known object/scalar containers are not arrays. Dynamic keys and nested item pointers remain subject to the original OAS contract.'
      : 'RFC 6901 pointer into this exact API response. Select a declared value or an OAS-supported dynamic location. Empty string selects the whole response body.';
  return createValuePointerSelectionSchema(description, help);
}
