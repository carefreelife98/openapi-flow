import type {
  ApiCatalog,
  ApiOperationCandidate,
} from '../../types/api-catalog.js';

export function listApiOperations(
  catalog: ApiCatalog,
): ApiOperationCandidate[] {
  return structuredClone(catalog.operations);
}
