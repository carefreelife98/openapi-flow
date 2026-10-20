import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import uri from 'fast-uri';
import type { BindingSchema } from '../../types/api-bindings.js';
import type { JsonObject } from '../../types/openapi.js';
import type {
  SchemaResourceContext,
  SchemaResourceLocation,
  SchemaDeclaredType,
  StaticSchemaProjectionBundle,
} from '../../types/schema-resource.js';
import { isObject } from '../../utils/is-object.js';
import { cloneSchemaResource } from './clone-schema-resource.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** Keep original resources; projected values reference their original locations. */
export function createSchemaResourceContext(
  schema: BindingSchema,
): SchemaResourceContext {
  if (typeof schema === 'boolean')
    return {
      root: schema,
      reference: (value) => value,
      resolve: (value) => value,
      bundle: (value) => value,
      bundleStaticProjections: (projections) => ({
        projections,
        definitions: {},
      }),
    };
  const document = cloneSchemaResource(schema);
  if (typeof document === 'boolean')
    throw new Error('Native schema resource must be an object');
  // JSON Schema permits an implementation-assigned initial retrieval URI.
  if (document.$id !== undefined && typeof document.$id !== 'string')
    throw new Error('Native schema.$id must be a URI-reference string');
  const retrievalUri = `https://openapi-flow.invalid/schema/${createHash('sha256').update(JSON.stringify(document)).digest('hex')}`;
  const rootUri =
    typeof document.$id === 'string'
      ? uri.resolve(retrievalUri, document.$id)
      : retrievalUri;
  const root = { ...document, $id: rootUri };
  const locations = new WeakMap<JsonObject, SchemaResourceLocation>();
  function index(
    current: BindingSchema,
    pointer: string,
    baseUri: string,
  ): void {
    if (typeof current === 'boolean') return;
    const base =
      typeof current.$id === 'string'
        ? uri.resolve(baseUri, current.$id)
        : baseUri;
    locations.set(current, {
      reference: uri.resolve(
        rootUri,
        '#' + pointer.split('/').map(encodeURIComponent).join('/'),
      ),
      baseUri: base,
    });
    function child(value: unknown, suffix: string): void {
      if (typeof value === 'boolean' || isObject(value))
        index(value, pointer + suffix, base);
    }
    // Traverse schema-valued keywords, not const/enum/default/example data.
    for (const key of [
      '$defs',
      'definitions',
      'properties',
      'patternProperties',
      'dependentSchemas',
      'dependencies',
    ]) {
      const children = current[key];
      if (!isObject(children)) continue;
      for (const [name, value] of Object.entries(children))
        child(
          value,
          '/' + key + '/' + name.replaceAll('~', '~0').replaceAll('/', '~1'),
        );
    }
    for (const key of [
      'items',
      'contains',
      'additionalProperties',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
    ])
      child(current[key], '/' + key);
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      const children = current[key];
      if (Array.isArray(children))
        children.forEach((value, position) =>
          child(value, '/' + key + '/' + position),
        );
    }
  }
  index(root, '', rootUri);
  const ajv = new Ajv2020({ strict: false, discriminator: true });
  addFormats.default(ajv);
  ajv.addSchema(root);
  // Resolve/validate on the host. No remote fetch and no runtime schema compiler.
  ajv.getSchema(rootUri);
  function resolveReference(current: BindingSchema): BindingSchema {
    if (typeof current === 'boolean' || typeof current.$ref !== 'string')
      return current;
    const location = locations.get(current);
    // Generated projection references are already absolute; original references use lexical scope.
    const reference = location
      ? uri.resolve(location.baseUri, current.$ref)
      : current.$ref;
    const target = ajv.getSchema(reference);
    if (!target)
      throw new Error(`Unresolved native schema reference ${reference}`);
    const value = target.schema;
    if (typeof value !== 'boolean' && !isObject(value))
      throw new Error(
        `Native schema reference ${reference} does not identify a schema`,
      );
    return value;
  }
  function declaredType(
    current: BindingSchema,
    visited = new Set<BindingSchema>(),
  ): SchemaDeclaredType {
    if (typeof current === 'boolean' || visited.has(current)) return undefined;
    if (typeof current.type === 'string') return current.type;
    if (
      Array.isArray(current.type) &&
      current.type.every((type) => typeof type === 'string')
    )
      return current.type;
    visited.add(current);
    return typeof current.$ref === 'string'
      ? declaredType(resolveReference(current), visited)
      : undefined;
  }
  function bundleStaticProjections(
    projections: Record<string, BindingSchema>,
  ): StaticSchemaProjectionBundle {
    const definitions: Record<string, BindingSchema> = {};
    const names = new WeakMap<JsonObject, string>();
    function rewrite(current: BindingSchema): BindingSchema {
      if (typeof current === 'boolean') return current;
      if (
        current.$dynamicRef !== undefined ||
        current.$dynamicAnchor !== undefined ||
        current.$recursiveRef !== undefined ||
        current.$recursiveAnchor !== undefined
      )
        throw new Error(
          'Static schema relocation cannot change dynamic or recursive schema scope; an explicit dialect-aware bundle is required',
        );
      const result = cloneSchemaResource(current);
      if (typeof result === 'boolean')
        throw new Error('Expected a schema object');
      // Resolution annotations are replaced by canonical locations, not validation rules.
      delete result.$id;
      delete result.$anchor;
      delete result.$defs;
      delete result.definitions;
      // Only schema-valued positions are visited: const/enum/default/example data stay verbatim.
      for (const key of [
        'properties',
        'patternProperties',
        'dependentSchemas',
        'dependencies',
      ]) {
        const children = current[key];
        if (isObject(children))
          result[key] = Object.fromEntries(
            Object.entries(children).map(([name, child]) => [
              name,
              typeof child === 'boolean' || isObject(child)
                ? rewrite(child)
                : child,
            ]),
          );
      }
      for (const key of [
        'items',
        'contains',
        'additionalProperties',
        'unevaluatedProperties',
        'unevaluatedItems',
        'propertyNames',
        'not',
        'if',
        'then',
        'else',
      ]) {
        const child = current[key];
        if (typeof child === 'boolean' || isObject(child))
          result[key] = rewrite(child);
      }
      for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
        const children = current[key];
        if (Array.isArray(children))
          result[key] = children.map((child) =>
            typeof child === 'boolean' || isObject(child)
              ? rewrite(child)
              : child,
          );
      }
      if (typeof current.$ref === 'string') {
        const target = resolveReference(current);
        if (typeof target === 'boolean') {
          delete result.$ref;
          if (!target)
            result.allOf = [
              false,
              ...(Array.isArray(result.allOf) ? result.allOf : []),
            ];
        } else {
          const location = locations.get(target);
          if (!location)
            throw new Error(
              'Local schema reference target has no original resource location',
            );
          let name = names.get(target);
          if (name === undefined) {
            name =
              'schema-' +
              createHash('sha256').update(location.reference).digest('hex');
            names.set(target, name);
            definitions[name] = rewrite(target);
          }
          result.$ref = '#/$defs/' + name;
          // Projection-owned type metadata repeats the referenced declaration exactly.
          // Original schema siblings are assertions and must never be discarded.
          if (
            !locations.has(current) &&
            Object.keys(current).every(
              (key) => key === '$ref' || key === 'type',
            ) &&
            current.type !== undefined &&
            jsonValuesEqual(current.type, declaredType(target))
          )
            delete result.type;
        }
      }
      return result;
    }
    const relocated = Object.fromEntries(
      Object.entries(projections).map(([name, projection]) => [
        name,
        rewrite(projection),
      ]),
    );
    return { projections: relocated, definitions };
  }
  return {
    root,
    reference: (current) => {
      if (typeof current === 'boolean') return current;
      const location = locations.get(current);
      if (!location)
        throw new Error(
          'Schema projection requires an original resource location',
        );
      const type = declaredType(current);
      return {
        $ref: location.reference,
        ...(type === undefined ? {} : { type }),
      };
    },
    resolve: resolveReference,
    bundleStaticProjections,
    bundle: (projection) =>
      typeof projection === 'boolean'
        ? { $defs: { resource: root }, allOf: [projection] }
        : { ...projection, $defs: { resource: root } },
  };
}
