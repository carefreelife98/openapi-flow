import type { JsonObject, OperationMethod } from '../../types/openapi.js';
import type { Operation } from '../../types/request.js';
import { object } from '../common/parse-spec-utils.js';
import { parseOperationSecurity } from './parse-security.js';
import { mapHttpOperationContract } from './map-http-operation-contract.js';

export function mapOperationForWorkflow(
  spec: JsonObject,
  path: string,
  method: OperationMethod,
  operationRef: string,
  pathItem: JsonObject,
  raw: unknown,
): Operation {
  const operation = object(raw, `spec.paths[${path}].${method.toLowerCase()}`);
  return {
    ...mapHttpOperationContract(
      path,
      method,
      operationRef,
      pathItem,
      operation,
    ),
    authentication: parseOperationSecurity(spec, operation, operationRef),
  };
}
