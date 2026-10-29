import uri from 'fast-uri';
import type { BindingSchema } from '../../types/api-bindings.js';
import { cloneSchemaResource } from './clone-schema-resource.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { mapSchemaResourceChildren } from './map-schema-resource-children.js';

/** Keep each identified resource once; consumers retain their canonical URI refs. */
export function deduplicateCanonicalSchemaResources(
  schema: BindingSchema,
): BindingSchema {
  const original = cloneSchemaResource(schema);
  const resources = new Map<string, BindingSchema>();
  function visit(current: BindingSchema, parentBase?: string): BindingSchema {
    if (typeof current === 'boolean') return current;
    let base = parentBase;
    if (current.$id !== undefined) {
      if (typeof current.$id !== 'string')
        throw new Error('Schema resource.$id must be a URI-reference string');
      const identifier =
        parentBase === undefined
          ? current.$id
          : uri.resolve(parentBase, current.$id);
      const parsed = uri.parse(identifier);
      if (!parsed.scheme || parsed.error)
        throw new Error(
          'Schema resource.$id requires an absolute URI or an identified parent resource',
        );
      base = identifier;
      const existing = resources.get(identifier);
      if (existing !== undefined) {
        if (!jsonValuesEqual(existing, current))
          throw new Error(
            `Conflicting schema resources declare the same $id ${identifier}`,
          );
        return { $ref: identifier };
      }
      // Save the untouched declaration, not a version with rewritten descendants.
      resources.set(identifier, current);
    }
    return mapSchemaResourceChildren(current, (child) => visit(child, base));
  }
  return visit(original);
}
