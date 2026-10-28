import type { SchemaResourceContext } from '../../types/schema-resource.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import type {
  BindingPointerTemplate,
  BindingTemplateTraversal,
} from '../../types/api-binding-candidates.js';
import { isObject } from '../../utils/is-object.js';
import { bindingSchemaTypes } from './binding-schema-types.js';

/** Enumerate declarations without choosing runtime keys or array items. */
export function listBindingPointerTemplates(
  schema: BindingSchema,
  resources?: SchemaResourceContext,
): BindingPointerTemplate[] {
  const templates = new Map<string, BindingPointerTemplate>();
  const active = new Set<BindingSchema>();
  function visit({
    schema: current,
    segments,
  }: BindingTemplateTraversal): void {
    if (
      resources &&
      typeof current !== 'boolean' &&
      typeof current.$ref === 'string' &&
      !active.has(current)
    ) {
      active.add(current);
      try {
        visit({ schema: resources.resolve(current), segments });
      } finally {
        active.delete(current);
      }
      return;
    }
    const types = bindingSchemaTypes(current);
    if (!types.length) return;
    const key = JSON.stringify(segments);
    const previous = templates.get(key);
    templates.set(key, {
      segments,
      types: [...new Set([...(previous?.types ?? []), ...types])],
    });
    // Recursive and open schemas have an unbounded path space. Keep this explicit;
    // the original contract resolver validates the chosen concrete path afterwards.
    if (current === true || active.has(current)) {
      templates.set(key + ':descendant', {
        segments: [...segments, { kind: 'descendant' }],
        types: bindingSchemaTypes(true),
      });
      return;
    }
    if (typeof current === 'boolean') return;
    active.add(current);
    try {
      if (
        typeof current.$ref === 'string' ||
        typeof current.$dynamicRef === 'string'
      )
        templates.set(key + ':descendant', {
          segments: [...segments, { kind: 'descendant' }],
          types: bindingSchemaTypes(true),
        });
      if (types.includes('object')) {
        if (isObject(current.properties))
          for (const [name, child] of Object.entries(current.properties))
            if (typeof child === 'boolean' || isObject(child))
              visit({
                schema: child,
                segments: [...segments, { kind: 'property', value: name }],
              });
        if (isObject(current.patternProperties))
          for (const [pattern, child] of Object.entries(
            current.patternProperties,
          ))
            if (typeof child === 'boolean' || isObject(child))
              visit({
                schema: child,
                segments: [...segments, { kind: 'key', pattern }],
              });
        const additional = current.additionalProperties;
        if (
          additional === undefined ||
          typeof additional === 'boolean' ||
          isObject(additional)
        )
          visit({
            schema: additional === undefined ? true : additional,
            segments: [
              ...segments,
              {
                kind: 'key',
                excludedKeys: isObject(current.properties)
                  ? Object.keys(current.properties)
                  : [],
                excludedPatterns: isObject(current.patternProperties)
                  ? Object.keys(current.patternProperties)
                  : [],
              },
            ],
          });
      }
      if (types.includes('array')) {
        const prefix = Array.isArray(current.prefixItems)
          ? current.prefixItems
          : [];
        prefix.forEach((child, index) => {
          if (typeof child === 'boolean' || isObject(child))
            visit({
              schema: child,
              segments: [
                ...segments,
                { kind: 'property', value: String(index) },
              ],
            });
        });
        const items = current.items;
        const maximum =
          typeof current.maxItems === 'number'
            ? current.maxItems - 1
            : undefined;
        if (
          (maximum === undefined || maximum >= prefix.length) &&
          (items === undefined || typeof items === 'boolean' || isObject(items))
        )
          visit({
            schema: items === undefined ? true : items,
            segments: [
              ...segments,
              {
                kind: 'index',
                minimum: prefix.length,
                ...(maximum === undefined ? {} : { maximum }),
              },
            ],
          });
      }
      for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
        const branches = current[keyword];
        if (Array.isArray(branches))
          for (const child of branches)
            if (typeof child === 'boolean' || isObject(child))
              visit({ schema: child, segments });
      }
      for (const keyword of ['then', 'else']) {
        const child = current[keyword];
        if (typeof child === 'boolean' || isObject(child))
          visit({ schema: child, segments });
      }
      if (isObject(current.dependentSchemas))
        for (const child of Object.values(current.dependentSchemas))
          if (typeof child === 'boolean' || isObject(child))
            visit({ schema: child, segments });
    } finally {
      active.delete(current);
    }
  }
  visit({ schema, segments: [] });
  return [...templates.values()];
}
