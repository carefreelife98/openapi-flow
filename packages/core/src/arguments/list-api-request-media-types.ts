import type { ApiOperationContract } from '../types/api-operation.js';
import { object } from '../openapi/common/parse-spec-utils.js';

export function listApiRequestMediaTypes(
  operation: ApiOperationContract,
): string[] {
  if (operation.operation.requestBody === undefined) return [];
  const source = `${operation.key.operationRef}.requestBody`;
  const body = object(operation.operation.requestBody, source);
  return Object.keys(object(body.content, `${source}.content`));
}
