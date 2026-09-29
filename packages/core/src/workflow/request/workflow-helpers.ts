import type { Operation } from '../../types/request.js';
import type {
  ExpectedBody,
  InputValues,
  PreparedRequestBody,
  RequestHeader,
  RequiredFields,
} from '../../types/request-workflow.js';
import { checkSchemaValue } from '../../openapi/common/check-schema-value.js';
import { serializeFormBody } from '../../openapi/request/serialize-form-body.js';
import {
  serializeCookieParameter,
  serializeHeaderParameter,
  serializePathParameter,
  serializeQueryParameter,
} from '../../openapi/request/serialize-parameter.js';
import { UnsupportedOperationError } from '../../openapi/common/unsupported-operation-error.js';
import { isObject, looksLikeCredential } from '../../utils/validation.js';

export function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'QUERY'].includes(method);
}

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

export function makeBody(
  operation: Operation,
  inputs: InputValues,
  missing: string[],
  requestMediaType?: string,
): PreparedRequestBody | undefined {
  if (!operation.body) {
    if (requestMediaType !== undefined)
      throw new Error(
        'plan.requestMediaType is not declared by the OAS operation',
      );
    return undefined;
  }
  if (
    requestMediaType !== undefined &&
    !Object.hasOwn(operation.body.mediaTypes, requestMediaType)
  ) {
    throw new Error(
      'plan.requestMediaType is not declared by the OAS operation',
    );
  }
  const value = inputs.body;
  if (value === undefined) {
    if (operation.body.required) missing.push('body');
    return undefined;
  }
  const declared = Object.keys(operation.body.mediaTypes);
  const mediaType =
    requestMediaType ?? (declared.length === 1 ? declared[0] : undefined);
  if (mediaType === undefined) {
    missing.push('requestMediaType');
    return undefined;
  }
  const media = operation.body.mediaTypes[mediaType];
  if (
    mediaType !== 'application/json' &&
    mediaType !== 'application/x-www-form-urlencoded'
  ) {
    throw new UnsupportedOperationError(
      operation.operationRef,
      `operationRef ${operation.operationRef}.requestBody media type ${mediaType} has no n8n mapping`,
    );
  }
  if (isObject(value)) {
    for (const name of Object.keys(value)) {
      if (looksLikeCredential(name)) {
        throw new Error(
          'plan.inputs.body.' +
            name +
            ' looks like a credential; bind an existing n8n credential through credentialBindings instead',
        );
      }
    }
    if (
      typeof media.schema === 'object' &&
      Array.isArray(media.schema.required)
    ) {
      for (const name of media.schema.required) {
        if (typeof name === 'string' && !Object.hasOwn(value, name)) {
          missing.push('body.' + name);
        }
      }
    }
  }
  if (missing.some((key) => key.startsWith('body.'))) return undefined;
  if (media.schema !== undefined)
    checkSchemaValue(value, media.schema, 'plan.inputs.body');
  if (mediaType === 'application/json') {
    return { contentType: 'json', value: JSON.stringify(value) };
  }
  if (!isObject(value)) {
    throw new Error(
      'plan.inputs.body must be an object for application/x-www-form-urlencoded',
    );
  }
  return {
    contentType: 'form-urlencoded',
    value: serializeFormBody(operation.operationRef, media, value),
  };
}

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

export function assertionCode(
  expectedBody: ExpectedBody,
  requiredFields: RequiredFields = {},
): string {
  const expected = JSON.stringify(expectedBody);
  const required = JSON.stringify(requiredFields);
  return [
    'const items = $input.all();',
    "if (items.length !== 1) throw new Error('Expected one response item');",
    'const response = items[0].json;',
    'const expected = ' + expected + ';',
    'const required = ' + required + ';',
    'function equal(actual, expectedValue) {',
    '  if (Object.is(actual, expectedValue)) return true;',
    '  if (actual === null || expectedValue === null || typeof actual !== "object" || typeof expectedValue !== "object") return false;',
    '  if (Array.isArray(actual) !== Array.isArray(expectedValue)) return false;',
    '  const keys = Object.keys(expectedValue);',
    '  if (Object.keys(actual).length !== keys.length) return false;',
    '  return keys.every((key) => Object.prototype.hasOwnProperty.call(actual, key) && equal(actual[key], expectedValue[key]));',
    '}',
    'for (const [key, type] of Object.entries(required)) {',
    '  const value = response.body?.[key];',
    '  const valid = type === "integer" ? Number.isSafeInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type;',
    '  if (!valid) throw new Error("Missing or invalid response body field: " + key);',
    '}',
    'for (const [key, value] of Object.entries(expected)) {',
    '  if (!equal(response.body?.[key], value)) throw new Error("Unexpected response body field: " + key);',
    '}',
    'return items;',
  ].join('\n');
}
