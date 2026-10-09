import type { BindingSchema } from '../types/api-bindings.js';

/** Boolean identities belong to the schema algebra, not to runtime data defaults. */
export function intersectBindingSchemas(
  schemas: BindingSchema[],
): BindingSchema {
  if (schemas.includes(false)) return false;
  const assertions = schemas.filter((schema) => schema !== true);
  if (!assertions.length) return true;
  return assertions.length === 1 ? assertions[0] : { allOf: assertions };
}

export function unionBindingSchemas(schemas: BindingSchema[]): BindingSchema {
  if (schemas.includes(true)) return true;
  const alternatives = schemas.filter((schema) => schema !== false);
  if (!alternatives.length) return false;
  return alternatives.length === 1 ? alternatives[0] : { anyOf: alternatives };
}
