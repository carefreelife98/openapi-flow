import type { BindingSchema } from '../../types/api-bindings.js';
import type { SchemaPointerResources } from '../../types/schema-resource.js';
import { isObject } from '../../utils/is-object.js';
import { pointerValue } from '../json-pointer.js';

/** Resolve declared static schema references without a compiler, network access or Node APIs. */
export function createClosedSchemaPointerResolver(
  root: BindingSchema,
): SchemaPointerResources {
  if (typeof root === 'boolean')
    return { resolve: (value) => value, reference: (value) => value };
  // API contracts arrive with closed, canonical references from the OAS intake.
  // Inline schemas do not need URI interpretation or generated resource identities.
  function hasReference(schema: BindingSchema): boolean {
    if (typeof schema === 'boolean') return false;
    if (typeof schema.$ref === 'string') return true;
    for (const key of [
      '$defs',
      'definitions',
      'properties',
      'patternProperties',
      'dependentSchemas',
      'dependencies',
    ])
      if (
        isObject(schema[key]) &&
        Object.values(schema[key]).some(
          (value) =>
            (typeof value === 'boolean' || isObject(value)) &&
            hasReference(value),
        )
      )
        return true;
    for (const key of [
      'items',
      'contains',
      'additionalProperties',
      'additionalItems',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
      'allOf',
      'anyOf',
      'oneOf',
      'prefixItems',
    ]) {
      const child = schema[key];
      if (
        Array.isArray(child)
          ? child.some(
              (value) =>
                (typeof value === 'boolean' || isObject(value)) &&
                hasReference(value),
            )
          : (typeof child === 'boolean' || isObject(child)) &&
            hasReference(child)
      )
        return true;
    }
    return false;
  }
  if (!hasReference(root))
    return { resolve: (value) => value, reference: (value) => value };
  function canonicalReference(reference: string, base: string): string {
    if (reference.startsWith('#')) return base.split('#')[0] + reference;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(reference)) return reference;
    throw new Error(
      `API schema reference ${reference} is not closed; resolve its document and URI scope at OAS intake`,
    );
  }
  const initial = 'urn:openapi-flow:pointer-resource';
  const rootUri =
    typeof root.$id === 'string'
      ? canonicalReference(root.$id, initial)
      : initial;
  const resources = new Map<string, BindingSchema>([[rootUri, root]]);
  const bases = new WeakMap<object, string>();
  const locations = new WeakMap<object, string>();
  function index(schema: BindingSchema, path: string, inherited: string): void {
    if (typeof schema === 'boolean') return;
    const base =
      typeof schema.$id === 'string'
        ? canonicalReference(schema.$id, inherited)
        : inherited;
    if (typeof schema.$id === 'string') {
      const previous = resources.get(base);
      if (previous !== undefined && previous !== schema)
        throw new Error(`Duplicate schema resource ${base}`);
      resources.set(base, schema);
    }
    if (typeof schema.$anchor === 'string')
      resources.set(base + '#' + schema.$anchor, schema);
    bases.set(schema, base);
    locations.set(schema, rootUri + '#' + path);
    function child(value: unknown, suffix: string): void {
      if (typeof value === 'boolean' || isObject(value))
        index(value, path + suffix, base);
    }
    for (const key of [
      '$defs',
      'definitions',
      'properties',
      'patternProperties',
      'dependentSchemas',
      'dependencies',
    ])
      if (isObject(schema[key]))
        for (const [name, value] of Object.entries(schema[key]))
          child(
            value,
            '/' + key + '/' + name.replaceAll('~', '~0').replaceAll('/', '~1'),
          );
    for (const key of [
      'items',
      'contains',
      'additionalProperties',
      'additionalItems',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
    ])
      child(schema[key], '/' + key);
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'])
      if (Array.isArray(schema[key]))
        schema[key].forEach((value, i) => child(value, '/' + key + '/' + i));
  }
  index(root, '', rootUri);
  function resolve(schema: BindingSchema): BindingSchema {
    if (typeof schema === 'boolean' || typeof schema.$ref !== 'string')
      return schema;
    const reference = canonicalReference(
      schema.$ref,
      bases.get(schema) ?? rootUri,
    );
    const exact = resources.get(reference);
    if (exact !== undefined) return exact;
    const hash = reference.indexOf('#');
    const resource = resources.get(
      hash < 0 ? reference : reference.slice(0, hash),
    );
    if (resource === undefined)
      throw new Error(`Unresolved schema reference ${reference}`);
    const fragment =
      hash < 0 ? '' : decodeURIComponent(reference.slice(hash + 1));
    const target =
      fragment === ''
        ? resource
        : fragment.startsWith('/')
          ? pointerValue(resource, fragment)
          : undefined;
    if (typeof target !== 'boolean' && !isObject(target))
      throw new Error(
        `Schema reference ${reference} does not identify a schema`,
      );
    return target;
  }
  function declaredType(
    schema: BindingSchema,
    seen = new Set<BindingSchema>(),
  ): unknown {
    if (typeof schema === 'boolean' || seen.has(schema)) return undefined;
    if (schema.type !== undefined) return schema.type;
    seen.add(schema);
    return typeof schema.$ref === 'string'
      ? declaredType(resolve(schema), seen)
      : undefined;
  }
  return {
    resolve,
    reference: (schema) => {
      if (typeof schema === 'boolean') return schema;
      const location = locations.get(schema);
      if (location === undefined)
        throw new Error(
          'Schema pointer projection requires an original resource location',
        );
      const type = declaredType(schema);
      return { $ref: location, ...(type === undefined ? {} : { type }) };
    },
  };
}
