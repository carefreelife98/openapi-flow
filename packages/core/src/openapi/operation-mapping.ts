import type {
  JsonObject,
  Operation,
  OperationBody,
  OperationBodyMedia,
  OperationMethod,
  OperationParameter,
  OperationResponses,
  ResponseProperties,
} from '../types/openapi.js';
import { operationMetadata } from './operation-metadata.js';
import {
  dereferencedObject,
  object,
  scalarSchema,
} from './parse-spec-utils.js';
import { parseOperationSecurity } from './parse-security.js';
import { UnsupportedOperationError } from './unsupported-operation-error.js';

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
  if (parameter.content !== undefined) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef} parameter ${parameter.name} uses content-based serialization`,
    );
  }
  const schema = scalarSchema(
    parameter.schema,
    `operationRef ${operationRef} parameter ${parameter.name}.schema`,
    operationRef,
  );
  if (
    (parameter.style !== undefined &&
      parameter.style !==
        (parameter.in === 'path' || parameter.in === 'header'
          ? 'simple'
          : 'form')) ||
    parameter.allowReserved === true
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `operationRef ${operationRef} parameter ${parameter.name} has an unsupported schema/style`,
    );
  }
  return {
    name: parameter.name,
    in: parameter.in as OperationParameter['in'],
    required: parameter.required === true,
    schema,
  };
}

export function mapOperationForWorkflow(
  spec: JsonObject,
  path: string,
  method: OperationMethod,
  operationRef: string,
  pathItem: JsonObject,
  raw: unknown,
): Operation {
  const operation = object(raw, `spec.paths[${path}].${method.toLowerCase()}`);
  const metadata = operationMetadata(operation, `operationRef ${operationRef}`);
  if (!path.startsWith('/')) {
    throw new Error(`operationRef ${operationRef} path must start with /`);
  }
  const authentication = parseOperationSecurity(spec, operation, operationRef);
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

  let body: OperationBody | undefined;
  if (operation.requestBody !== undefined) {
    const requestBody = dereferencedObject(
      operation.requestBody,
      `operationRef ${operationRef}.requestBody`,
    );
    const content = object(
      requestBody.content,
      `operationRef ${operationRef}.requestBody.content`,
    );
    const mediaTypes: Record<string, OperationBodyMedia> = Object.create(null);
    for (const [mediaType, value] of Object.entries(content)) {
      const media = object(
        value,
        `operationRef ${operationRef}.requestBody.${mediaType}`,
      );
      const bodySchema =
        media.schema === undefined
          ? undefined
          : typeof media.schema === 'boolean'
            ? media.schema
            : dereferencedObject(
                media.schema,
                `operationRef ${operationRef}.requestBody.${mediaType}.schema`,
              );
      const properties =
        typeof bodySchema !== 'object' || bodySchema.properties === undefined
          ? {}
          : object(
              bodySchema.properties,
              `operationRef ${operationRef}.requestBody.${mediaType}.schema.properties`,
            );
      mediaTypes[mediaType] = {
        schema: bodySchema,
        properties,
        ...(media.encoding === undefined
          ? {}
          : {
              encoding: object(
                media.encoding,
                `operationRef ${operationRef}.requestBody.${mediaType}.encoding`,
              ),
            }),
      };
    }
    body = {
      required: requestBody.required === true,
      mediaTypes,
    };
  }

  const responses = object(
    operation.responses,
    `operationRef ${operationRef}.responses`,
  );
  const parsedResponses: OperationResponses = {};
  for (const [responseCode, rawResponse] of Object.entries(responses)) {
    const response = dereferencedObject(
      rawResponse,
      `operationRef ${operationRef}.responses.${responseCode}`,
    );
    const responseProperties: ResponseProperties = {};
    if (response.content !== undefined) {
      const content = object(
        response.content,
        `operationRef ${operationRef}.responses.${responseCode}.content`,
      );
      if (content['application/json'] !== undefined) {
        const media = object(
          content['application/json'],
          `operationRef ${operationRef}.responses.${responseCode}.application/json`,
        );
        const responseSchema =
          media.schema === undefined || typeof media.schema === 'boolean'
            ? undefined
            : dereferencedObject(
                media.schema,
                `operationRef ${operationRef}.responses.${responseCode}.schema`,
              );
        if (
          responseSchema?.type === 'object' &&
          responseSchema.properties !== undefined
        ) {
          const properties = object(
            responseSchema.properties,
            `operationRef ${operationRef}.responses.${responseCode}.schema.properties`,
          );
          for (const [name, property] of Object.entries(properties)) {
            responseProperties[name] =
              typeof property === 'boolean'
                ? property
                : dereferencedObject(
                    property,
                    `operationRef ${operationRef}.responses.${responseCode}.schema.properties.${name}`,
                  );
          }
        }
      }
    }
    parsedResponses[responseCode] = responseProperties;
  }
  return {
    operationRef,
    source: 'paths',
    ...metadata,
    method,
    path,
    authentication,
    parameters,
    body,
    responses: parsedResponses,
  };
}
