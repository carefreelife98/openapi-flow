import type { JsonObject, OperationMethod } from '../../types/openapi.js';
import type { Operation } from '../../types/request.js';
import { operationMetadata } from '../common/operation-metadata.js';
import { object } from '../common/parse-spec-utils.js';
import { parseOperationResponses } from './parse-operation-responses.js';
import { parseRequestBody } from './parse-request-body.js';
import { parseRequestParameters } from './parse-request-parameters.js';

/** HTTP contracts only. Authentication is resolved separately by the engine adapter. */
export function mapHttpOperationContract(
  path: string,
  method: OperationMethod,
  operationRef: string,
  pathItem: JsonObject,
  raw: unknown,
): Operation {
  const operation = object(raw, `spec.paths[${path}].${method.toLowerCase()}`);
  if (!path.startsWith('/'))
    throw new Error(`operationRef ${operationRef} path must start with /`);
  return {
    operationRef,
    source: 'paths',
    ...operationMetadata(operation, `operationRef ${operationRef}`),
    method,
    path,
    parameters: parseRequestParameters(path, pathItem, operation, operationRef),
    body: parseRequestBody(operation, operationRef),
    responses: parseOperationResponses(operation, operationRef),
  };
}
