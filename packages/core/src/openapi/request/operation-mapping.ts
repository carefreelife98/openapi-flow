import type { JsonObject, OperationMethod } from '../../types/openapi.js';
import type { Operation } from '../../types/request.js';
import { operationMetadata } from '../common/operation-metadata.js';
import { object } from '../common/parse-spec-utils.js';
import { parseOperationResponses } from './parse-operation-responses.js';
import { parseRequestBody } from './parse-request-body.js';
import { parseRequestParameters } from './parse-request-parameters.js';
import { parseOperationSecurity } from './parse-security.js';

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
  return {
    operationRef,
    source: 'paths',
    ...metadata,
    method,
    path,
    authentication: parseOperationSecurity(spec, operation, operationRef),
    parameters: parseRequestParameters(path, pathItem, operation, operationRef),
    body: parseRequestBody(operation, operationRef),
    responses: parseOperationResponses(operation, operationRef),
  };
}
