import type {
  BindingSchema,
  RequestContainerKind,
} from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';
import type { SchemaPointerResources } from '../types/schema-resource.js';

/** Necessary type conditions only; full schema satisfiability is a runtime check. */
export function schemaAllowsContainer(
  schema: BindingSchema,
  kind: RequestContainerKind,
  resources?: SchemaPointerResources,
  active = new Set<BindingSchema>(),
): boolean {
  if (typeof schema === 'boolean') return schema;
  if (resources && typeof schema.$ref === 'string') {
    if (active.has(schema))
      throw new Error(
        'Container inspection has a non-progressing schema reference cycle',
      );
    active.add(schema);
    const siblings = { ...schema };
    delete siblings.$ref;
    try {
      return (
        schemaAllowsContainer(
          resources.resolve(schema),
          kind,
          resources,
          active,
        ) && schemaAllowsContainer(siblings, kind, resources, active)
      );
    } finally {
      active.delete(schema);
    }
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(kind)) return false;
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = schema[key].map(
      (child) =>
        (typeof child === 'boolean' || isObject(child)) &&
        schemaAllowsContainer(child, kind, resources, active),
    );
    if (key === 'allOf' ? !branches.every(Boolean) : !branches.some(Boolean))
      return false;
  }
  return true;
}
