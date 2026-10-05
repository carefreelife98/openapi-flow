import { validateAndResolveOpenApiDocument } from '../common/validate-spec.js';
import { operationsFromDocument } from './parse-request-operations.js';
import type { CatalogSource, OperationCatalog } from '../../types/catalog.js';
import { isObject } from '../../utils/is-object.js';

export async function createOperationCatalog(
  sources: CatalogSource[],
): Promise<OperationCatalog> {
  if (!Array.isArray(sources) || sources.length === 0)
    throw new Error('sources must be a non-empty array of OAS documents');
  const catalog: OperationCatalog = { sources: new Map(), entries: [] };
  for (const source of sources) {
    if (!isObject(source) || typeof source.id !== 'string' || !source.id.trim())
      throw new Error('sources[].id must be a non-empty string');
    if (catalog.sources.has(source.id))
      throw new Error(`sources has duplicate id ${source.id}`);
    try {
      const document = await validateAndResolveOpenApiDocument(source.spec);
      const operations = operationsFromDocument(document);
      catalog.sources.set(source.id, { ...source, document, operations });
      catalog.entries.push(
        ...operations.map((candidate) => ({ id: source.id, candidate })),
      );
    } catch (error) {
      throw new Error(`sources[${source.id}] is invalid`, { cause: error });
    }
  }
  return catalog;
}
