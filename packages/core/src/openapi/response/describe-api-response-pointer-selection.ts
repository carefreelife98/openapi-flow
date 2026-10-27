import type {
  ApiResponsePointerSelectionInput,
  ApiResponsePointerSelectionDescription,
} from '../../types/api-response-pointers.js';
import { listApiResponsePointers } from './list-api-response-pointers.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';
import { projectArrayItemSchema } from '../../bindings/project-array-item-schema.js';

/** Candidate projection only; original full-response and selected-pointer validation remain authoritative. */
export function describeApiResponsePointerSelection({
  operation,
  valueKind,
}: ApiResponsePointerSelectionInput): ApiResponsePointerSelectionDescription {
  if (valueKind !== 'array' && valueKind !== 'value')
    throw new Error(
      'Response pointer selection.valueKind must be array or value',
    );
  const catalogs = listApiResponsePointers(operation);
  const pointers = new Set([
    '',
    ...catalogs.flatMap((catalog) =>
      catalog.declaredPointers.map((entry) => entry.pointer),
    ),
  ]);
  const declaredPointers: string[] = [];
  const excludedPointers: string[] = [];
  for (const pointer of pointers) {
    const schemas = responseBindingSchemas(operation, pointer);
    const eligible =
      valueKind === 'value'
        ? schemas.length > 0
        : schemas.some((schema) => projectArrayItemSchema(schema).allowsArray);
    (eligible ? declaredPointers : excludedPointers).push(pointer);
  }
  return {
    declaredPointers,
    excludedPointers,
    dynamicLocations: catalogs.flatMap((catalog) => catalog.dynamicLocations),
  };
}
