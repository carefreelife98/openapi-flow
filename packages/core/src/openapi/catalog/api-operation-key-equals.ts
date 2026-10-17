import type { ApiOperationKey } from '../../types/api-catalog.js';

export function apiOperationKeyEquals(
  left: ApiOperationKey,
  right: ApiOperationKey,
): boolean {
  return (
    left.documentId === right.documentId &&
    left.snapshotId === right.snapshotId &&
    left.operationRef === right.operationRef
  );
}
