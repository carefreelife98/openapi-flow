import type {
  BindingSchema,
  RequestContainerKind,
} from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';

/** Necessary type conditions only; full schema satisfiability is a runtime check. */
export function schemaAllowsContainer(
  schema: BindingSchema,
  kind: RequestContainerKind,
): boolean {
  if (typeof schema === 'boolean') return schema;
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(kind)) return false;
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = schema[key].map(
      (child) =>
        (typeof child === 'boolean' || isObject(child)) &&
        schemaAllowsContainer(child, kind),
    );
    if (key === 'allOf' ? !branches.every(Boolean) : !branches.some(Boolean))
      return false;
  }
  return true;
}
