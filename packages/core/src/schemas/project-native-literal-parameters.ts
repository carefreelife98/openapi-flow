import type { BindingSchema } from '../types/api-bindings.js';
import type { LiteralInputProjection } from '../types/api-argument-generation.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';
import { pointerTokens } from '../bindings/json-pointer.js';
import { projectLiteralInputSchema } from './project-literal-input-schema.js';
import { isObject } from '../utils/is-object.js';

/** Expand only finite selected paths; unselected recursive contracts retain static refs. */
export function projectNativeLiteralParameters(
  schema: BindingSchema,
  pointers: string[],
  source: string,
): LiteralInputProjection {
  const original = createSchemaResourceContext(schema);
  const bundle = original.bundleStaticProjections({
    parameters: original.root,
  });
  const projection = bundle.projections.parameters;
  if (typeof projection === 'boolean')
    return projectLiteralInputSchema(
      projection,
      pointers.map(pointerTokens),
      source,
    );
  const root = { ...projection, $defs: bundle.definitions };
  const resources = createSchemaResourceContext(root);
  function expand(
    current: BindingSchema,
    paths: string[][],
    visited = new Set<string>(),
  ): BindingSchema {
    if (
      typeof current === 'boolean' ||
      !paths.length ||
      paths.some((path) => !path.length)
    )
      return current;
    if (typeof current.$ref === 'string') {
      const identity = JSON.stringify([current.$ref, paths]);
      if (visited.has(identity))
        throw new Error(
          `${source}: recursive alias cannot resolve a selected parameter path`,
        );
      const next = new Set([...visited, identity]);
      const siblings = { ...current };
      delete siblings.$ref;
      delete siblings.$id;
      delete siblings.$defs;
      return {
        allOf: [
          expand(resources.resolve(current), paths, next),
          expand(siblings, paths, next),
        ],
      };
    }
    const result = { ...current };
    delete result.$id;
    delete result.$defs;
    if (isObject(current.properties))
      result.properties = Object.fromEntries(
        Object.entries(current.properties).map(([name, child]) => {
          if (typeof child !== 'boolean' && !isObject(child))
            throw new Error(`${source}: invalid property schema ${name}`);
          return [
            name,
            expand(
              child,
              paths
                .filter(([token]) => token === name)
                .map((path) => path.slice(1)),
              visited,
            ),
          ];
        }),
      );
    if (isObject(current.patternProperties))
      result.patternProperties = Object.fromEntries(
        Object.entries(current.patternProperties).map(([pattern, child]) => {
          if (typeof child !== 'boolean' && !isObject(child))
            throw new Error(`${source}: invalid pattern schema ${pattern}`);
          return [
            pattern,
            expand(
              child,
              paths
                .filter(([name]) => new RegExp(pattern).test(name))
                .map((path) => path.slice(1)),
              visited,
            ),
          ];
        }),
      );
    if (
      typeof current.additionalProperties === 'boolean' ||
      isObject(current.additionalProperties)
    )
      result.additionalProperties = expand(
        current.additionalProperties,
        paths.map((path) => path.slice(1)),
        visited,
      );
    if (typeof current.items === 'boolean' || isObject(current.items))
      result.items = expand(
        current.items,
        paths.map((path) => path.slice(1)),
        visited,
      );
    if (Array.isArray(current.prefixItems))
      result.prefixItems = current.prefixItems.map((child, index) => {
        if (typeof child !== 'boolean' && !isObject(child))
          throw new Error(`${source}: invalid tuple schema`);
        return expand(
          child,
          paths
            .filter(([token]) => token === String(index))
            .map((path) => path.slice(1)),
          visited,
        );
      });
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      const children = current[keyword];
      if (!Array.isArray(children)) continue;
      result[keyword] = children.map((child) => {
        if (typeof child !== 'boolean' && !isObject(child))
          throw new Error(`${source}: invalid composition schema`);
        return expand(child, paths, visited);
      });
    }
    return result;
  }
  const literal = projectLiteralInputSchema(
    expand(resources.root, pointers.map(pointerTokens)),
    pointers.map(pointerTokens),
    source,
  );
  // In a closed object, an unmatched false property is already forbidden by
  // additionalProperties:false. Omit only that redundant declaration; patterns
  // and open objects must keep the explicit prohibition. Entirely owned empty
  // object containers have no literal decision and are materialized by code.
  // Never visit const/enum/example data as schemas.
  function omitRedundantForbiddenProperties(
    current: BindingSchema,
    location: string[] | undefined,
  ): BindingSchema {
    if (typeof current === 'boolean') return current;
    const result = { ...current };
    for (const keyword of [
      'properties',
      'patternProperties',
      '$defs',
      'definitions',
      'dependentSchemas',
    ]) {
      const entries = current[keyword];
      if (!isObject(entries)) continue;
      result[keyword] = Object.fromEntries(
        Object.entries(entries)
          .filter(
            ([name, child]) =>
              !(
                keyword === 'properties' &&
                child === false &&
                current.additionalProperties === false &&
                (!isObject(current.patternProperties) ||
                  !Object.keys(current.patternProperties).some((pattern) =>
                    new RegExp(pattern).test(name),
                  ))
              ),
          )
          .map(([name, child]) => {
            if (typeof child !== 'boolean' && !isObject(child))
              throw new Error(`${source}: invalid ${keyword} schema`);
            return [
              name,
              omitRedundantForbiddenProperties(
                child,
                keyword === 'properties' && location !== undefined
                  ? [...location, name]
                  : undefined,
              ),
            ] as const;
          })
          .filter(([name, child]) => {
            if (
              keyword !== 'properties' ||
              location === undefined ||
              current.additionalProperties !== false ||
              (Array.isArray(current.required) &&
                current.required.includes(name)) ||
              (isObject(current.patternProperties) &&
                Object.keys(current.patternProperties).some((pattern) =>
                  new RegExp(pattern).test(name),
                )) ||
              typeof child === 'boolean' ||
              child.type !== 'object' ||
              child.additionalProperties !== false ||
              !isObject(child.properties) ||
              Object.keys(child.properties).length ||
              (Array.isArray(child.required) && child.required.length) ||
              Object.keys(child).some(
                (key) =>
                  ![
                    'type',
                    'properties',
                    'required',
                    'additionalProperties',
                    'description',
                    'title',
                    '$schema',
                    'minProperties',
                    'maxProperties',
                  ].includes(key),
              ) ||
              (typeof child.minProperties === 'number' &&
                child.minProperties > 0) ||
              (typeof child.maxProperties === 'number' &&
                child.maxProperties < 0)
            )
              return true;
            const path = [...location, name];
            // An entirely runtime-owned, unambiguous object container is created
            // from its original schema by the materializer, not chosen by an LLM.
            return !pointers
              .map(pointerTokens)
              .some(
                (target) =>
                  target.length > path.length &&
                  path.every((token, index) => target[index] === token),
              );
          }),
      );
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      const children = current[keyword];
      if (!Array.isArray(children)) continue;
      result[keyword] = children.map((child, index) => {
        if (typeof child !== 'boolean' && !isObject(child))
          throw new Error(`${source}: invalid ${keyword} schema`);
        return omitRedundantForbiddenProperties(
          child,
          keyword === 'prefixItems' && location !== undefined
            ? [...location, String(index)]
            : location,
        );
      });
    }
    for (const keyword of [
      'items',
      'additionalProperties',
      'not',
      'if',
      'then',
      'else',
      'contains',
      'unevaluatedProperties',
      'unevaluatedItems',
    ]) {
      const child = current[keyword];
      if (typeof child === 'boolean' || isObject(child))
        result[keyword] = omitRedundantForbiddenProperties(
          child,
          ['items', 'contains'].includes(keyword) ? undefined : location,
        );
    }
    return result;
  }
  return {
    ...literal,
    schema:
      typeof literal.schema === 'boolean'
        ? literal.schema
        : omitRedundantForbiddenProperties(
            {
              ...literal.schema,
              $defs: bundle.definitions,
            },
            [],
          ),
  };
}
