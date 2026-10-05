import type {
  ApiArgumentValidation,
  ValidateApiArgumentsInput,
} from '../types/api-arguments.js';
import type { JsonObject } from '../types/openapi.js';
import {
  hasPointer,
  pointerTokens,
  pointerValue,
} from '../bindings/json-pointer.js';
import { checkSchemaValue } from '../openapi/common/check-schema-value.js';
import { object } from '../openapi/common/parse-spec-utils.js';
import { optionalRequestProperties } from '../schemas/operation-plan-schema.js';
import { bodyMediaSchema, parameterSchema } from './request-contract.js';

function requiredPointers(
  schema: JsonObject | boolean,
  value: unknown,
  pointer: string,
  missing: string[],
  bound: string[],
): void {
  if (bound.includes(pointer) || typeof schema === 'boolean') return;
  if (Array.isArray(schema.allOf))
    for (const item of schema.allOf)
      requiredPointers(
        object(item, `${pointer}.allOf`),
        value,
        pointer,
        missing,
        bound,
      );
  if (Array.isArray(schema.required))
    for (const name of schema.required) {
      const child = `${pointer}/${String(name).replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (
        (value === null ||
          typeof value !== 'object' ||
          !Object.hasOwn(value, String(name))) &&
        !bound.includes(child)
      )
        if (!bound.some((target) => target.startsWith(child + '/')))
          missing.push(child);
    }
  if (
    (value === undefined ||
      (value !== null && typeof value === 'object' && !Array.isArray(value))) &&
    schema.properties !== undefined
  ) {
    for (const [name, child] of Object.entries(
      object(schema.properties, `${pointer}.properties`),
    )) {
      const childPointer = `${pointer}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      const suppliedChild = value !== undefined && Object.hasOwn(value, name);
      if (
        !suppliedChild &&
        !bound.some((target) => target.startsWith(childPointer + '/'))
      )
        continue;
      requiredPointers(
        typeof child === 'boolean'
          ? child
          : object(child, `${pointer}.${name}`),
        suppliedChild ? Reflect.get(value as object, name) : undefined,
        childPointer,
        missing,
        bound,
      );
    }
  }
  if (
    Array.isArray(value) &&
    schema.items !== undefined &&
    !Array.isArray(schema.items)
  )
    for (const [index, item] of value.entries()) {
      requiredPointers(
        typeof schema.items === 'boolean'
          ? schema.items
          : object(schema.items, `${pointer}.items`),
        item,
        `${pointer}/${index}`,
        missing,
        bound,
      );
    }
}

export function validateApiArguments({
  operation,
  values,
  bindings,
  requestMediaType,
}: ValidateApiArgumentsInput): ApiArgumentValidation {
  if (!Array.isArray(bindings))
    throw new Error('arguments.bindings must be an array');
  const supplied = object(values, 'arguments.values');
  const allowed = new Set<string>(
    operation.effective.parameters.map((parameter) => parameter.in),
  );
  if (operation.operation.requestBody !== undefined) allowed.add('body');
  for (const group of Object.keys(supplied))
    if (!allowed.has(group))
      throw new Error(
        `arguments.values.${group} is not declared by ${operation.key.operationRef}`,
      );
  const targets: string[] = [];
  for (const binding of bindings) {
    if (
      binding.kind !== 'node-output' ||
      typeof binding.sourceNodeId !== 'string' ||
      !binding.sourceNodeId.trim()
    )
      throw new Error('bindings require kind and non-empty sourceNodeId');
    const tokens = pointerTokens(binding.targetPointer);
    pointerTokens(binding.sourcePointer);
    if (tokens.length === 0)
      throw new Error('bindings.targetPointer must identify a request field');
    if (
      targets.some(
        (target) =>
          target === binding.targetPointer ||
          target.startsWith(binding.targetPointer + '/') ||
          binding.targetPointer.startsWith(target + '/'),
      )
    )
      throw new Error(`bindings overlap at ${binding.targetPointer}`);
    if (hasPointer(values, binding.targetPointer))
      throw new Error(
        `arguments supply both a literal and binding at ${binding.targetPointer}`,
      );
    if (
      tokens[0] !== 'body' &&
      !operation.effective.parameters.some(
        (parameter) =>
          parameter.in === tokens[0] && parameter.name === tokens[1],
      )
    )
      throw new Error(
        `binding ${binding.targetPointer} is not declared by ${operation.key.operationRef}`,
      );
    if (tokens[0] === 'body' && operation.operation.requestBody === undefined)
      throw new Error(
        `${operation.key.operationRef} has no body for ${binding.targetPointer}`,
      );
    targets.push(binding.targetPointer);
  }
  const missing: string[] = [];
  for (const raw of operation.effective.parameters) {
    const parameter = object(raw, `${operation.key.operationRef}.parameters`);
    if (
      parameter.in === 'header' &&
      ['accept', 'content-type', 'authorization'].includes(
        String(parameter.name).toLowerCase(),
      )
    )
      continue;
    const location = String(parameter.in);
    const name = String(parameter.name);
    const group = supplied[location];
    if (group !== undefined) {
      for (const key of Object.keys(
        object(group, `arguments.values.${location}`),
      ))
        if (
          !operation.effective.parameters.some(
            (item) => item.in === location && item.name === key,
          )
        )
          throw new Error(
            `arguments.values.${location}.${key} is not declared by ${operation.key.operationRef}`,
          );
    }
    const pointer = `/${location}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    const value = pointerValue(values, pointer);
    const schema = parameterSchema(parameter, pointer);
    if (value === undefined) {
      if (targets.some((target) => target.startsWith(pointer + '/')))
        requiredPointers(schema, undefined, pointer, missing, targets);
      else if (parameter.required === true && !targets.includes(pointer))
        missing.push(pointer);
      continue;
    }
    requiredPointers(schema, value, pointer, missing, targets);
    checkSchemaValue(
      value,
      targets.some((item) => item.startsWith(pointer + '/')) ||
        missing.some((item) => item.startsWith(pointer + '/'))
        ? (optionalRequestProperties(schema) as JsonObject | boolean)
        : schema,
      pointer,
    );
  }
  const bodySchema = bodyMediaSchema(operation, requestMediaType);
  if (bodySchema !== undefined) {
    const requestBody = object(
      operation.operation.requestBody,
      `${operation.key.operationRef}.requestBody`,
    );
    if (
      values.body === undefined &&
      requestBody.required === true &&
      !targets.some(
        (pointer) => pointer === '/body' || pointer.startsWith('/body/'),
      )
    )
      missing.push('/body');
    if (
      values.body !== undefined ||
      targets.some((pointer) => pointer.startsWith('/body/'))
    ) {
      requiredPointers(bodySchema, values.body, '/body', missing, targets);
    }
    if (values.body !== undefined) {
      const incomplete =
        targets.some((pointer) => pointer.startsWith('/body/')) ||
        missing.some((pointer) => pointer.startsWith('/body/'));
      checkSchemaValue(
        values.body,
        incomplete
          ? (optionalRequestProperties(bodySchema) as JsonObject | boolean)
          : bodySchema,
        '/body',
      );
    }
  }
  return {
    valid: missing.length === 0,
    missingInputs: [...new Set(missing)],
    requiresRuntimeValidation: bindings.length > 0,
  };
}
