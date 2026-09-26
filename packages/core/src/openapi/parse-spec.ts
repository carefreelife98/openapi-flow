import type {
  JsonObject,
  Operation,
  OperationBody,
  OperationCandidate,
  OperationMethod,
  OperationParameter,
  ParsedDocument,
  ScalarProperties,
} from '../types/openapi.js';
import {
  dereferencedObject,
  object,
  scalarSchema,
  schemaProperties,
} from './parse-spec-utils.js';
import { operationEntries, operationReference } from './operation-reference.js';
import { validatedDocument } from './validate-spec.js';

function parseParameter(
  raw: unknown,
  operationRef: string,
  index: number,
): OperationParameter {
  const parameter = dereferencedObject(
    raw,
    `operationRef ${operationRef} parameter ${index}`,
  );
  if (
    typeof parameter.name !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_-]*$/.test(parameter.name) ||
    (parameter.in !== 'path' && parameter.in !== 'query') ||
    (parameter.in === 'path' && parameter.required !== true)
  ) {
    throw new Error(
      `operationRef ${operationRef} has an unsupported parameter`,
    );
  }
  const schema = scalarSchema(
    parameter.schema,
    `operationRef ${operationRef} parameter ${parameter.name}.schema`,
  );
  if (
    (parameter.style !== undefined &&
      parameter.style !== (parameter.in === 'query' ? 'form' : 'simple')) ||
    (parameter.explode === true && parameter.in === 'path') ||
    parameter.allowReserved === true
  ) {
    throw new Error(
      `operationRef ${operationRef} parameter ${parameter.name} has an unsupported schema/style`,
    );
  }
  return {
    name: parameter.name,
    in: parameter.in,
    required: parameter.required === true,
    schema,
  };
}

function parseOperation(
  spec: JsonObject,
  path: string,
  method: OperationMethod,
  operationRef: string,
  pathItem: JsonObject,
  raw: unknown,
): Operation {
  const operation = object(raw, `spec.paths[${path}].${method.toLowerCase()}`);
  const operationId =
    typeof operation.operationId === 'string'
      ? operation.operationId
      : undefined;
  const pathShape = path.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, 'x');
  if (
    path.length > 500 ||
    !/^\/[A-Za-z0-9/._~-]*$/.test(pathShape) ||
    path.includes('//') ||
    pathShape.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error(
      `operationRef ${operationRef} has an unsupported path template`,
    );
  }
  const security =
    operation.security === undefined ? spec.security : operation.security;
  if (
    security !== undefined &&
    (!Array.isArray(security) || security.length > 0)
  ) {
    throw new Error(
      `operationRef ${operationRef} requires credentials; workflow compilation has no credential binding`,
    );
  }
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
    const media = object(
      content['application/json'],
      `operationRef ${operationRef}.requestBody.application/json`,
    );
    const bodySchema = schemaProperties(
      media.schema,
      `operationRef ${operationRef}.requestBody.schema`,
    );
    const properties: ScalarProperties = {};
    for (const [name, property] of Object.entries(bodySchema.properties)) {
      properties[name] = scalarSchema(
        property,
        `operationRef ${operationRef}.requestBody.schema.properties.${name}`,
      );
    }
    body = {
      required: requestBody.required === true,
      requiredProperties: bodySchema.required,
      properties,
    };
  }

  const responses = object(
    operation.responses,
    `operationRef ${operationRef}.responses`,
  );
  const successes = Object.keys(responses).filter((code) =>
    /^2\d\d$/.test(code),
  );
  if (successes.length !== 1)
    throw new Error(
      `operationRef ${operationRef} must declare exactly one 2xx response`,
    );
  const status = Number(successes[0]);
  const response = dereferencedObject(
    responses[successes[0]],
    `operationRef ${operationRef}.responses.${status}`,
  );
  const responseProperties: ScalarProperties = {};
  if (response.content !== undefined) {
    const content = object(
      response.content,
      `operationRef ${operationRef}.responses.${status}.content`,
    );
    const media = object(
      content['application/json'],
      `operationRef ${operationRef}.responses.${status}.application/json`,
    );
    const responseSchema = schemaProperties(
      media.schema,
      `operationRef ${operationRef}.responses.${status}.schema`,
    );
    for (const [name, property] of Object.entries(responseSchema.properties)) {
      responseProperties[name] = scalarSchema(
        property,
        `operationRef ${operationRef}.responses.${status}.schema.properties.${name}`,
      );
    }
  }

  const effect = operation['x-openapi-flow-effect'];
  if (effect !== undefined && effect !== 'read' && effect !== 'write') {
    throw new Error(
      `operationRef ${operationRef}.x-openapi-flow-effect must be read or write`,
    );
  }
  return {
    operationRef,
    operationId,
    method,
    path,
    summary: typeof operation.summary === 'string' ? operation.summary : '',
    effect: effect ?? 'unknown',
    status,
    parameters,
    body,
    responseProperties,
  };
}

export function operationsFromDocument({
  paths,
}: ParsedDocument): OperationCandidate[] {
  const operations: OperationCandidate[] = [];
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathItem = dereferencedObject(pathValue, `spec.paths[${path}]`);
    for (const { method, key, value } of operationEntries(pathItem)) {
      const operation = object(value, `spec.paths[${path}].${key}`);
      operations.push({
        operationRef: operationReference(path, key),
        operationId:
          typeof operation.operationId === 'string'
            ? operation.operationId
            : undefined,
        method,
        path,
        summary: typeof operation.summary === 'string' ? operation.summary : '',
      });
    }
  }
  const ids = operations.flatMap(({ operationId }) =>
    operationId === undefined ? [] : [operationId],
  );
  if (new Set(ids).size !== ids.length)
    throw new Error('spec.paths has duplicate operationId values');
  return operations;
}

export async function operationsFromSpec(
  input: unknown,
): Promise<OperationCandidate[]> {
  return operationsFromDocument(await validatedDocument(input));
}

export async function operationFromSpec(
  input: unknown,
  operationRef: string,
): Promise<Operation> {
  return operationFromDocument(await validatedDocument(input), operationRef);
}

export function operationFromDocument(
  parsed: ParsedDocument,
  operationRef: string,
): Operation {
  const candidates = operationsFromDocument(parsed);
  const matches = candidates.filter(
    (item) =>
      item.operationRef === operationRef || item.operationId === operationRef,
  );
  if (matches.length > 1)
    throw new Error(
      'plan.operationRef identifies multiple operations: ' + operationRef,
    );
  const candidate = matches[0];
  if (!candidate)
    throw new Error('plan.operationRef is not in spec.paths: ' + operationRef);
  const pathItem = dereferencedObject(
    parsed.paths[candidate.path],
    `spec.paths[${candidate.path}]`,
  );
  const operationEntry = operationEntries(pathItem).find(
    ({ key }) =>
      operationReference(candidate.path, key) === candidate.operationRef,
  );
  if (!operationEntry)
    throw new Error(
      'spec.paths is missing operation: ' + candidate.operationRef,
    );
  return parseOperation(
    parsed.spec,
    candidate.path,
    candidate.method,
    candidate.operationRef,
    pathItem,
    operationEntry.value,
  );
}
