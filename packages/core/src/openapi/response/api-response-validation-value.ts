import type {
  ApiResponseEnvelope,
  ApiResponseValidationValue,
} from '../../types/api-response.js';

/** Project transport metadata for validation without rewriting response data. */
export function apiResponseValidationValue(
  response: ApiResponseEnvelope,
): ApiResponseValidationValue {
  if (!response || !Number.isInteger(response.statusCode))
    throw new Error('API response.statusCode is required');
  if (
    !response.headers ||
    typeof response.headers !== 'object' ||
    Array.isArray(response.headers)
  )
    throw new Error('API response.headers is required');
  const headers = Object.entries(response.headers).filter(
    ([name]) => name.toLowerCase() === 'content-type',
  );
  if (headers.length > 1)
    throw new Error('API response.headers has ambiguous Content-Type');
  const value: ApiResponseValidationValue = { statusCode: response.statusCode };
  if (headers.length) {
    if (typeof headers[0][1] !== 'string')
      throw new Error('API response Content-Type must be a string');
    value.mediaType = headers[0][1].split(';')[0].trim().toLowerCase();
  }
  if (Object.hasOwn(response, 'body')) value.body = response.body;
  return value;
}
