import type { BindingSchema } from '../types/api-bindings.js';
import { schemasAtPointer } from './schema-at-pointer.js';
import { schemaReferenceContext } from './resources/schema-reference-context.js';

/** A projected value carries the resource definitions needed by all of its references. */
export function projectSchemaPointer(
  schema: BindingSchema,
  pointer: string,
): BindingSchema[] {
  const resources = schemaReferenceContext(schema);
  const values = schemasAtPointer(
    resources ? resources.root : schema,
    pointer,
    resources,
  );
  return resources ? values.map(resources.bundle) : values;
}
