import type { ApiOperationContract } from '../types/api-operation.js';
import { listApiRequestMediaTypes } from './list-api-request-media-types.js';
import { requestMediaTypePriority } from './request-media-type-priority.js';

/** Select only an OAS-declared key; never synthesize a request media type. */
export function selectDefaultApiRequestMediaType(
  operation: ApiOperationContract,
): string | undefined {
  if (operation.operation.requestBody === undefined) return undefined;
  const mediaTypes = listApiRequestMediaTypes(operation);
  const [selected] = mediaTypes.sort((left, right) => {
    const priority =
      requestMediaTypePriority(left) - requestMediaTypePriority(right);
    if (priority !== 0) return priority;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (selected === undefined)
    throw new Error(
      `${operation.key.operationRef}.requestBody.content has no request media type`,
    );
  return selected;
}
