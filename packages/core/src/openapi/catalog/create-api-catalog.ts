import { createHash } from 'node:crypto';
import type { ApiCatalog, ApiSource } from '../../types/api-catalog.js';
import type { OpenApiDocument } from '../../types/openapi.js';
import {
  validateOpenApi,
  validateAndResolveOpenApiDocument,
} from '../common/validate-spec.js';
import { operationsFromDocument } from '../request/parse-request-operations.js';

export async function createApiCatalog(
  sources: ApiSource[],
): Promise<ApiCatalog> {
  if (!Array.isArray(sources) || sources.length === 0)
    throw new Error('sources must contain at least one OpenAPI document');
  const catalog: ApiCatalog = { documents: [], operations: [] };
  for (const [index, source] of sources.entries()) {
    if (!source || typeof source.id !== 'string' || !source.id.trim())
      throw new Error(`sources[${index}].id must be non-empty`);
    if (catalog.documents.some((item) => item.id === source.id))
      throw new Error(`sources[${index}].id duplicates ${source.id}`);
    try {
      const spec = validateOpenApi(source.spec) as unknown as OpenApiDocument;
      const snapshotId = createHash('sha256')
        .update(JSON.stringify(spec))
        .digest('hex');
      const parsed = await validateAndResolveOpenApiDocument(spec);
      catalog.documents.push({ id: source.id, snapshotId, spec });
      catalog.operations.push(
        ...operationsFromDocument(parsed).map((operation) => ({
          ...operation,
          key: {
            documentId: source.id,
            snapshotId,
            operationRef: operation.operationRef,
          },
        })),
      );
    } catch (cause) {
      throw new Error(`sources[${source.id}].spec is invalid`, { cause });
    }
  }
  return catalog;
}
