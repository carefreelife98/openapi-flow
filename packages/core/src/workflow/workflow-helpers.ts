import type { Operation } from '../types/openapi.js';
import type {
  ExpectedBody,
  InputValues,
  RequiredFields,
} from '../types/workflow.js';
import {
  checkPrimitive,
  isObject,
  looksLikeCredential,
} from '../utils/validation.js';

export function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'QUERY'].includes(method);
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
  const url = new URL(path, origin);
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
  if (!isObject(value)) throw new Error('plan.inputs.body must be an object');
  for (const [name, field] of Object.entries(value)) {
    const schema = operation.body.properties[name];
    if (!schema)
      throw new Error(
        'plan.inputs.body.' + name + ' is not declared in the OAS schema',
      );
    if (looksLikeCredential(name)) {
      throw new Error(
        'plan.inputs.body.' +
          name +
          ' looks like a credential; v1 has no credential binding',
      );
    }
    checkPrimitive(field, schema, 'plan.inputs.body.' + name);
  }
  for (const name of operation.body.requiredProperties) {
    if (!Object.hasOwn(value, name)) missing.push('body.' + name);
  }
  return JSON.stringify(value);
}

export function assertionCode(
  status: number,
  expectedBody: ExpectedBody,
  requiredFields: RequiredFields = {},
): string {
  const expected = JSON.stringify(expectedBody);
  const required = JSON.stringify(requiredFields);
  return [
    'const items = $input.all();',
    "if (items.length !== 1) throw new Error('Expected one response item');",
    'const response = items[0].json;',
    'if (response.statusCode !== ' +
      status +
      ') throw new Error("Expected HTTP ' +
      status +
      ', got " + response.statusCode);',
    'const expected = ' + expected + ';',
    'const required = ' + required + ';',
    'for (const [key, type] of Object.entries(required)) {',
    '  const value = response.body?.[key];',
    '  const valid = type === "integer" ? Number.isSafeInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type;',
    '  if (!valid) throw new Error("Missing or invalid response body field: " + key);',
    '}',
    'for (const [key, value] of Object.entries(expected)) {',
    '  if (response.body?.[key] !== value) throw new Error("Unexpected response body field: " + key);',
    '}',
    'return items;',
  ].join('\n');
}
