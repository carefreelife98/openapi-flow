import { checkSchemaValue } from '../../openapi/common/check-schema-value.js';
import {
  serializeCookieParameter,
  serializeHeaderParameter,
} from '../../openapi/request/serialize-parameter.js';
import type { Operation } from '../../types/request.js';
import type { RequestHeader } from '../../types/request-node.js';
import type { InputValues } from '../../types/request-workflow.js';

export function makeHeaders(
  operation: Operation,
  inputs: InputValues,
  missing: string[],
): RequestHeader[] {
  const headers: RequestHeader[] = [];
  const cookies: string[] = [];
  for (const parameter of operation.parameters) {
    if (parameter.in !== 'header' && parameter.in !== 'cookie') continue;
    const key = parameter.in + '.' + parameter.name;
    const value = inputs[key];
    if (value === undefined) {
      if (parameter.required) missing.push(key);
      continue;
    }
    checkSchemaValue(value, parameter.schema, 'plan.inputs.' + key);
    if (parameter.in === 'header') {
      headers.push({
        name: parameter.name,
        value: serializeHeaderParameter(
          parameter,
          operation.operationRef,
          value,
        ),
      });
    } else {
      cookies.push(
        ...serializeCookieParameter(parameter, operation.operationRef, value),
      );
    }
  }
  if (cookies.length)
    headers.push({ name: 'Cookie', value: cookies.join('; ') });
  return headers;
}
