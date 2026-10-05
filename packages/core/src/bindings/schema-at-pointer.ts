import type { BindingSchema } from '../types/api-bindings.js';
import { pointerTokens } from './json-pointer.js';
import { isObject } from '../utils/is-object.js';

/** Resolve declared object fields, array items and composition alternatives. */
export function schemasAtPointer(
  schema: BindingSchema,
  pointer: string,
): BindingSchema[] {
  function visit(current: BindingSchema, tokens: string[]): BindingSchema[] {
    if (current === false) return [];
    if (!tokens.length || current === true) return [current];
    const [token, ...rest] = tokens;
    const alternatives = ['allOf', 'anyOf', 'oneOf'].flatMap((key) =>
      Array.isArray(current[key])
        ? current[key].flatMap((child) =>
            typeof child === 'boolean' || isObject(child)
              ? visit(child, tokens)
              : [],
          )
        : [],
    );
    if (
      isObject(current.properties) &&
      Object.hasOwn(current.properties, token)
    ) {
      const child = current.properties[token];
      if (typeof child === 'boolean' || isObject(child))
        alternatives.push(...visit(child, rest));
    } else if (
      /^(0|[1-9][0-9]*)$/.test(token) &&
      (current.type === 'array' ||
        (Array.isArray(current.type) && current.type.includes('array')))
    ) {
      const prefix = Array.isArray(current.prefixItems)
        ? current.prefixItems
        : [];
      const child =
        Number(token) < prefix.length ? prefix[Number(token)] : current.items;
      if (typeof child === 'boolean' || isObject(child))
        alternatives.push(...visit(child, rest));
      else if (child === undefined) alternatives.push(true);
    } else if (
      typeof current.additionalProperties === 'boolean' ||
      isObject(current.additionalProperties)
    ) {
      if (current.additionalProperties !== false)
        alternatives.push(...visit(current.additionalProperties, rest));
    } else if (current.type === 'object' || current.properties !== undefined) {
      // JSON Schema leaves unspecified additionalProperties open.
      alternatives.push(true);
    }
    if (isObject(current.patternProperties))
      for (const [pattern, child] of Object.entries(current.patternProperties))
        if (
          new RegExp(pattern).test(token) &&
          (typeof child === 'boolean' || isObject(child))
        )
          alternatives.push(...visit(child, rest));
    return alternatives;
  }
  return visit(schema, pointerTokens(pointer));
}
