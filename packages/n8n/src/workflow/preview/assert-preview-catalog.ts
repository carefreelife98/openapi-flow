import { createApiCatalog } from '@openapi-flow/core';
import type { ApiCatalog, ApiOperationKey } from '@openapi-flow/core';
import { workflowPreviewOperationKeySchema } from '../../schemas/workflow-preview-schema.js';

function operationIdentity(key: ApiOperationKey): string {
  return JSON.stringify([key.documentId, key.snapshotId, key.operationRef]);
}

export async function assertPreviewCatalog(catalog: ApiCatalog): Promise<void> {
  if (
    !catalog ||
    !Array.isArray(catalog.documents) ||
    !Array.isArray(catalog.operations)
  )
    throw new Error('preview.catalog requires documents and operations arrays');
  const checked = await createApiCatalog(catalog.documents);
  for (const document of catalog.documents) {
    if (
      document.snapshotId !==
      checked.documents.find((item) => item.id === document.id)?.snapshotId
    )
      throw new Error(
        `preview.catalog.documents[${document.id}].snapshotId does not match its OAS`,
      );
  }
  const expected = checked.operations
    .map((item) => operationIdentity(item.key))
    .sort();
  const supplied = catalog.operations
    .map((item) => {
      if (!item?.key)
        throw new Error('preview.catalog.operations entry is missing key');
      return operationIdentity(
        workflowPreviewOperationKeySchema.parse(item.key),
      );
    })
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(supplied))
    throw new Error(
      'preview.catalog.operations does not match its OAS documents',
    );
}
