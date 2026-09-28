import type { Operation } from '../types/openapi.js';
import { scalarSchema } from '../openapi/parse-spec-utils.js';
import type {
  InputValues,
  PreviousOperations,
  RequiredOutputs,
} from '../types/workflow.js';
import {
  checkPrimitive,
  isObject,
  looksLikeCredential,
} from '../utils/validation.js';
import { absoluteOperationPath, makeUrl } from './workflow-helpers.js';

export function sequenceUrl(
  operation: Operation,
  origin: URL,
  inputs: InputValues,
  previous: PreviousOperations,
  requiredOutputs: RequiredOutputs,
  missing: string[],
): string {
  let path = operation.path;
  const references = new Map<string, string>();
  for (const parameter of operation.parameters) {
    const key = parameter.in + '.' + parameter.name;
    const value = inputs[key];
    if (value === undefined) {
      if (parameter.required) missing.push(key);
      continue;
    }
    if (isObject(value)) {
      if (
        typeof value.fromStep !== 'string' ||
        typeof value.field !== 'string' ||
        Object.keys(value).length !== 2
      ) {
        throw new Error('plan.inputs.' + key + ' must have fromStep and field');
      }
      if (looksLikeCredential(value.field)) {
        throw new Error(
          'plan.inputs.' + key + ' references a credential-like response field',
        );
      }
      const source = previous.get(value.fromStep);
      if (!source || !Object.hasOwn(source.responseProperties, value.field)) {
        throw new Error(
          'plan.inputs.' + key + ' must reference a prior response field',
        );
      }
      const sourceType = scalarSchema(
        source.responseProperties[value.field],
        'operationRef ' +
          source.operationRef +
          '.responses.' +
          source.status +
          '.schema.properties.' +
          value.field,
      ).type;
      if (
        sourceType !== parameter.schema.type &&
        !(sourceType === 'integer' && parameter.schema.type === 'number')
      ) {
        throw new Error('plan.inputs.' + key + ' has a response type mismatch');
      }
      const required = requiredOutputs.get(value.fromStep) ?? new Set<string>();
      required.add(value.field);
      requiredOutputs.set(value.fromStep, required);
      references.set(
        key,
        '$node[' +
          JSON.stringify('Request ' + value.fromStep) +
          '].json.body[' +
          JSON.stringify(value.field) +
          ']',
      );
    } else {
      checkPrimitive(value, parameter.schema, 'plan.inputs.' + key);
      if (parameter.in === 'path')
        path = path.replace(
          '{' + parameter.name + '}',
          encodeURIComponent(String(value)),
        );
    }
  }
  if (missing.length) return '';
  if (references.size === 0) return makeUrl(operation, origin, inputs, []);
  const absolute = absoluteOperationPath(origin, path);
  const parts: string[] = [];
  let offset = 0;
  for (const match of absolute.matchAll(/\{([^}]+)\}/g)) {
    const key = 'path.' + match[1];
    const reference = references.get(key);
    if (!reference) throw new Error('plan.inputs.' + key + ' is required');
    parts.push(
      JSON.stringify(absolute.slice(offset, match.index)),
      'encodeURIComponent(' + reference + ')',
    );
    offset = match.index + match[0].length;
  }
  parts.push(JSON.stringify(absolute.slice(offset)));
  let expression = parts.join(' + ');
  let firstQuery = true;
  for (const parameter of operation.parameters) {
    if (
      parameter.in !== 'query' ||
      inputs['query.' + parameter.name] === undefined
    )
      continue;
    const key = 'query.' + parameter.name;
    const reference = references.get(key);
    expression +=
      ' + ' +
      JSON.stringify(
        (firstQuery ? '?' : '&') + encodeURIComponent(parameter.name) + '=',
      ) +
      ' + ' +
      (reference
        ? 'encodeURIComponent(' + reference + ')'
        : JSON.stringify(encodeURIComponent(String(inputs[key]))));
    firstQuery = false;
  }
  return '={{ ' + expression + ' }}';
}
