import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import type { ApiResponsePointerCatalog } from '../../types/api-response-pointers.js';
import { isObject } from '../../utils/is-object.js';
import { normalizeOasValueSchema } from '../common/normalize-oas-value-schema.js';
import { listDeclaredSchemaPointers } from './list-declared-schema-pointers.js';

/** Describe finite schema declarations, not guaranteed runtime fields or a whitelist. */
export function listApiResponsePointers(
  operation: ApiOperationContract,
): ApiResponsePointerCatalog[] {
  const catalogs: ApiResponsePointerCatalog[] = [];
  for (const [responseKey, response] of Object.entries(
    operation.operation.responses ?? {},
  )) {
    if (!isObject(response) || !isObject(response.content)) continue;
    for (const [mediaType, media] of Object.entries(response.content)) {
      if (!isObject(media)) continue;
      const schema = media.schema;
      if (typeof schema !== 'boolean' && !isObject(schema)) continue;
      const normalized: BindingSchema = normalizeOasValueSchema(
        schema,
        operation.openapiVersion.startsWith('3.0.')
          ? 'openapi-3.0'
          : 'draft-2020-12',
      );
      const catalog: ApiResponsePointerCatalog = {
        responseKey,
        mediaType,
        declaredPointers: [],
        dynamicLocations: [],
      };
      listDeclaredSchemaPointers(normalized, catalog);
      catalogs.push(catalog);
    }
  }
  return catalogs;
}
