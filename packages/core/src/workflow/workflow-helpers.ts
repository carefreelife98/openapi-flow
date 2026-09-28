import type { Operation } from '../types/openapi.js';
import type {
  ExpectedBody,
  InputValues,
  RequiredFields,
} from '../types/workflow.js';
import { checkSchemaValue } from '../openapi/check-schema-value.js';
import {
  checkPrimitive,
  isObject,
  looksLikeCredential,
} from '../utils/validation.js';

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
    const key = parameter.in + '.' + parameter.name;
    const value = inputs[key];
    if (value === undefined) {
      if (parameter.required) missing.push(key);
      continue;
    }
    checkPrimitive(value, parameter.schema, 'plan.inputs.' + key);
    if (parameter.in === 'path')
      path = path.replace(
        '{' + parameter.name + '}',
        encodeURIComponent(String(value)),
      );
  }
  const url = new URL(absoluteOperationPath(origin, path));
  for (const parameter of operation.parameters) {
    if (parameter.in !== 'query') continue;
    const key = 'query.' + parameter.name;
    if (inputs[key] !== undefined)
      url.searchParams.set(parameter.name, String(inputs[key]));
  }
  return url.href;
}

export function makeBody(
  operation: Operation,
  inputs: InputValues,
  missing: string[],
): string | undefined {
  if (!operation.body) return undefined;
  const value = inputs.body;
  if (value === undefined) {
    if (operation.body.required) missing.push('body');
    return undefined;
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
    if (Array.isArray(operation.body.schema?.required)) {
      for (const name of operation.body.schema.required) {
        if (typeof name === 'string' && !Object.hasOwn(value, name)) {
          missing.push('body.' + name);
        }
      }
    }
  }
  if (missing.some((key) => key.startsWith('body.'))) return undefined;
  if (operation.body.schema !== undefined)
    checkSchemaValue(value, operation.body.schema, 'plan.inputs.body');
  return JSON.stringify(value);
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
