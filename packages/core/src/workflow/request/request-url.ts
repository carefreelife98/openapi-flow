import { checkSchemaValue } from '../../openapi/common/check-schema-value.js';
import {
  serializePathParameter,
  serializeQueryParameter,
} from '../../openapi/request/serialize-parameter.js';
import type { Operation } from '../../types/request.js';
import type { InputValues } from '../../types/request-workflow.js';

export function absoluteOperationPath(baseUrl: URL, path: string): string {
  return baseUrl.origin + baseUrl.pathname.replace(/\/$/, '') + path;
}

export function makeUrl(
  operation: Operation,
  origin: URL,
  inputs: InputValues,
  missing: string[],
): string {
  let path = operation.path;
  for (const parameter of operation.parameters) {
    if (parameter.in !== 'path' && parameter.in !== 'query') continue;
    const key = parameter.in + '.' + parameter.name;
    const value = inputs[key];
    if (value === undefined) {
      if (parameter.required) missing.push(key);
      continue;
    }
    checkSchemaValue(value, parameter.schema, 'plan.inputs.' + key);
    if (parameter.in === 'path')
      path = path.replace(
        '{' + parameter.name + '}',
        serializePathParameter(parameter, operation.operationRef, value),
      );
  }
  const url = new URL(absoluteOperationPath(origin, path));
  const query: string[] = [];
  for (const parameter of operation.parameters) {
    if (parameter.in !== 'query') continue;
    const key = 'query.' + parameter.name;
    if (inputs[key] !== undefined)
      query.push(
        ...serializeQueryParameter(
          parameter,
          operation.operationRef,
          inputs[key],
        ),
      );
  }
  if (query.length) url.search = query.join('&');
  return url.href;
}
