import type { JsonObject } from '../../types/openapi.js';
import type { OperationParameter } from '../../types/request.js';
import { dereferencedObject, object } from '../common/parse-spec-utils.js';
import { UnsupportedOperationError } from '../common/unsupported-operation-error.js';

function parseParameter(
  raw: unknown,
  operationRef: string,
  index: number,
): OperationParameter | undefined {
  const parameter = dereferencedObject(
    raw,
    `operationRef ${operationRef} parameter ${index}`,
  );
  if (
    typeof parameter.name !== 'string' ||
    !parameter.name ||
    (parameter.in === 'path' && parameter.required !== true)
  ) {
    throw new Error(`operationRef ${operationRef} has an invalid parameter`);
  }
  if (!['path', 'query', 'header', 'cookie'].includes(String(parameter.in))) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef} has an unsupported parameter`,
    );
  }
  if (
    parameter.in === 'header' &&
    ['accept', 'content-type', 'authorization'].includes(
      parameter.name.toLowerCase(),
    )
  ) {
    return undefined;
  }
  let schema: JsonObject | boolean;
  let contentMediaType: string | undefined;
  if (parameter.content !== undefined) {
    const content = object(
      parameter.content,
      `operationRef ${operationRef} parameter ${parameter.name}.content`,
    );
    const types = Object.keys(content);
    if (types.length !== 1 || types[0] !== 'application/json')
      throw new UnsupportedOperationError(
        operationRef,
        `operationRef ${operationRef} parameter ${parameter.name} content media type is not mapped`,
      );
    contentMediaType = types[0];
    const media = dereferencedObject(
      content[contentMediaType],
      `operationRef ${operationRef} parameter ${parameter.name}.content.${contentMediaType}`,
    );
    schema =
      media.schema === undefined
        ? true
        : typeof media.schema === 'boolean'
          ? media.schema
          : dereferencedObject(
              media.schema,
              `operationRef ${operationRef} parameter ${parameter.name}.content.${contentMediaType}.schema`,
            );
  } else {
    schema =
      typeof parameter.schema === 'boolean'
        ? parameter.schema
        : dereferencedObject(
            parameter.schema,
            `operationRef ${operationRef} parameter ${parameter.name}.schema`,
          );
  }
  const style =
    typeof parameter.style === 'string'
      ? parameter.style
      : parameter.in === 'path' || parameter.in === 'header'
        ? 'simple'
        : 'form';
  const explode =
    typeof parameter.explode === 'boolean'
      ? parameter.explode
      : style === 'form' || style === 'cookie';
  return {
    name: parameter.name,
    in: parameter.in as OperationParameter['in'],
    required: parameter.required === true,
    schema,
    style,
    explode,
    allowReserved: parameter.allowReserved === true,
    ...(contentMediaType === undefined ? {} : { contentMediaType }),
  };
}

export function parseRequestParameters(
  path: string,
  pathItem: JsonObject,
  operation: JsonObject,
  operationRef: string,
): OperationParameter[] {
  if (
    (pathItem.parameters !== undefined &&
      !Array.isArray(pathItem.parameters)) ||
    (operation.parameters !== undefined && !Array.isArray(operation.parameters))
  ) {
    throw new Error(`operationRef ${operationRef} parameters must be arrays`);
  }
  const pathParameters = Array.isArray(pathItem.parameters)
    ? pathItem.parameters
    : [];
  const operationParameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];
  const parametersByName = new Map<string, OperationParameter>();
  for (const rawParameters of [pathParameters, operationParameters]) {
    const namesAtLevel = new Set<string>();
    for (const [index, rawParameter] of rawParameters.entries()) {
      const parameter = parseParameter(rawParameter, operationRef, index);
      if (parameter === undefined) continue;
      const name = `${parameter.in}.${parameter.name}`;
      if (namesAtLevel.has(name))
        throw new Error(
          `operationRef ${operationRef} has duplicate parameters`,
        );
      namesAtLevel.add(name);
      parametersByName.set(name, parameter);
    }
  }
  const parameters = [...parametersByName.values()];
  for (const name of path
    .match(/\{([^}]+)\}/g)
    ?.map((token) => token.slice(1, -1)) ?? []) {
    if (
      !parameters.some(
        (parameter) => parameter.in === 'path' && parameter.name === name,
      )
    ) {
      throw new Error(
        `operationRef ${operationRef} is missing path parameter ${name}`,
      );
    }
  }
  return parameters;
}
