import type {
  BindingSchema,
  RequestContainerKind,
} from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import { isObject } from '../utils/is-object.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from './combine-binding-schemas.js';
import { schemaAllowsContainer } from './schema-allows-container.js';

/** Resolve declared object fields, array items and composition alternatives. */
export function schemasAtPointer(
  schema: BindingSchema,
  pointer: string,
): BindingSchema[] {
  function visit(
    current: BindingSchema,
    tokens: string[],
    inheritedKinds: RequestContainerKind[] = ['object', 'array'],
  ): BindingSchema {
    if (!tokens.length || typeof current === 'boolean') return current;
    const [token, ...rest] = tokens;
    const kinds = inheritedKinds.filter((kind) =>
      schemaAllowsContainer(current, kind),
    );
    const containers: BindingSchema[] = [];
    if (kinds.includes('object')) {
      const children: BindingSchema[] = [];
      if (
        isObject(current.properties) &&
        Object.hasOwn(current.properties, token)
      ) {
        const child = current.properties[token];
        if (typeof child === 'boolean' || isObject(child))
          children.push(visit(child, rest));
      }
      if (isObject(current.patternProperties))
        for (const [pattern, child] of Object.entries(
          current.patternProperties,
        ))
          if (
            new RegExp(pattern).test(token) &&
            (typeof child === 'boolean' || isObject(child))
          )
            children.push(visit(child, rest));
      if (!children.length) {
        // JSON Schema leaves unspecified additionalProperties open.
        const child = current.additionalProperties;
        children.push(
          child === undefined
            ? true
            : typeof child === 'boolean' || isObject(child)
              ? visit(child, rest)
              : false,
        );
      }
      containers.push(intersectBindingSchemas(children));
    }
    if (kinds.includes('array') && /^(0|[1-9][0-9]*)$/.test(token)) {
      const index = Number(token);
      const prefix = Array.isArray(current.prefixItems)
        ? current.prefixItems
        : [];
      const child = index < prefix.length ? prefix[index] : current.items;
      containers.push(
        typeof current.maxItems === 'number' && index >= current.maxItems
          ? false
          : child === undefined
            ? true
            : typeof child === 'boolean' || isObject(child)
              ? visit(child, rest)
              : false,
      );
    }
    const constraints = [unionBindingSchemas(containers)];
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (!Array.isArray(current[key])) continue;
      const children = current[key].map((child) =>
        typeof child === 'boolean' || isObject(child)
          ? visit(child, tokens, kinds)
          : false,
      );
      // Parent oneOf branches can share child values once their discriminators disappear.
      constraints.push(
        key === 'allOf'
          ? intersectBindingSchemas(children)
          : unionBindingSchemas(children),
      );
    }
    return intersectBindingSchemas(constraints);
  }
  const projected = visit(schema, pointerTokens(pointer));
  return projected === false ? [] : [projected];
}
