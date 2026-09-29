import type { RequiredFields } from '../../types/request-node.js';
import type { ExpectedBody } from '../../types/request-workflow.js';

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
