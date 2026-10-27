import { pointerTokens } from '@openapi-flow/core';
import type { NativeOutputProjectionParameters } from '../../../types/native-output-projection.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** Select fields in the official Edit Fields expression, using only validated pointer tokens. */
export function createNativeOutputProjectionExpression(
  parameters: NativeOutputProjectionParameters,
): string {
  const entries = parameters.fields.map((field) => {
    const access = pointerTokens(field.pointer)
      .map((token) => `[${javascriptJsonLiteral(token)}]`)
      .join('');
    return `[${javascriptJsonLiteral(field.name)},$json${access}${field.measurement === undefined ? '' : '.length'}]`;
  });
  return `={{ JSON.stringify(Object.fromEntries([${entries.join(',')}])) }}`;
}
