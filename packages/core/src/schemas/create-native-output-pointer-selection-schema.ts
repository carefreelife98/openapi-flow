import type { z } from 'zod';
import type { NativeOutputContract } from '../types/node-output.js';
import type { ApiResponsePointerCatalog } from '../types/api-response-pointers.js';
import { validateNativeOutputContracts } from '../bindings/validate-native-output-contracts.js';
import { listDeclaredSchemaPointers } from '../bindings/list-declared-schema-pointers.js';
import { createValuePointerSelectionSchema } from './create-value-pointer-selection-schema.js';

export function createNativeOutputPointerSelectionSchema(
  output: NativeOutputContract,
): z.ZodType<string, string> {
  validateNativeOutputContracts([output]);
  const catalog: Pick<
    ApiResponsePointerCatalog,
    'declaredPointers' | 'dynamicLocations'
  > = {
    declaredPointers: [],
    dynamicLocations: [],
  };
  listDeclaredSchemaPointers(output.schema, catalog);
  return createValuePointerSelectionSchema(
    {
      declaredPointers: [
        ...new Set(catalog.declaredPointers.map((value) => value.pointer)),
      ],
      dynamicLocations: catalog.dynamicLocations,
      excludedPointers: [],
    },
    'RFC 6901 pointer into this exact declared native JSON output. Choose an unchanged value, including a whole object or array. Empty string selects the whole output. Dynamic keys remain subject to the original source schema.',
  );
}
