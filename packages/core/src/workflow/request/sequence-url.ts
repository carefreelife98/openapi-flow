import type { Operation } from '../../types/request.js';
import {
  responseFieldSchemas,
  responseFieldType,
} from '../../openapi/request/response-contract.js';
import { checkSchemaValue } from '../../openapi/common/check-schema-value.js';
import {
  serializePathParameter,
  serializeQueryParameter,
} from '../../openapi/request/serialize-parameter.js';
import { UnsupportedOperationError } from '../../openapi/common/unsupported-operation-error.js';
import type { InputValues } from '../../types/request-workflow.js';
import type {
  PreviousOperations,
  RequiredOutputs,
} from '../../types/sequence-workflow.js';
import { isObject } from '../../utils/is-object.js';
import { looksLikeCredential } from './credential-binding.js';
import { absoluteOperationPath, makeUrl } from './request-url.js';

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
    if (parameter.in !== 'path' && parameter.in !== 'query') continue;
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
      if (!source || responseFieldSchemas(source, value.field).length === 0) {
        throw new Error(
          'plan.inputs.' + key + ' must reference a prior response field',
        );
      }
      const sourceType = responseFieldType(source, value.field);
      const targetType =
        typeof parameter.schema === 'object'
          ? parameter.schema.type
          : undefined;
      if (
        (parameter.in === 'path' && parameter.style !== 'simple') ||
        (parameter.in === 'query' && parameter.style !== 'form') ||
        parameter.contentMediaType !== undefined ||
        parameter.allowReserved ||
        !['string', 'number', 'integer', 'boolean'].includes(String(targetType))
      )
        throw new UnsupportedOperationError(
          operation.operationRef,
          `operationRef ${operation.operationRef} parameter ${key} cannot serialize a sequence response reference`,
        );
      if (
        sourceType !== targetType &&
        !(sourceType === 'integer' && targetType === 'number')
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
      checkSchemaValue(value, parameter.schema, 'plan.inputs.' + key);
      if (parameter.in === 'path')
        path = path.replace(
          '{' + parameter.name + '}',
          serializePathParameter(parameter, operation.operationRef, value),
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
    if (reference) {
      expression +=
        ' + ' +
        JSON.stringify(
          (firstQuery ? '?' : '&') + encodeURIComponent(parameter.name) + '=',
        ) +
        ' + encodeURIComponent(' +
        reference +
        ')';
    } else {
      expression +=
        ' + ' +
        JSON.stringify(
          (firstQuery ? '?' : '&') +
            serializeQueryParameter(
              parameter,
              operation.operationRef,
              inputs[key],
            ).join('&'),
        );
    }
    firstQuery = false;
  }
  return '={{ ' + expression + ' }}';
}
