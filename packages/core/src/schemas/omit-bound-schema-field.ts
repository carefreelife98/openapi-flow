import type { JsonObject } from '../types/openapi.js';
import { isObject } from '../utils/is-object.js';

/** Bound fields do not belong in the model's literal-value output schema. */
export function omitBoundSchemaField(
  schema: JsonObject | boolean,
  tokens: string[],
  source: string,
): void {
  if (typeof schema === 'boolean' || !tokens.length) return;
  for (const key of ['allOf', 'anyOf', 'oneOf'])
    if (Array.isArray(schema[key]))
      for (const child of schema[key])
        if (typeof child === 'boolean' || isObject(child))
          omitBoundSchemaField(child, tokens, source);
  const [token, ...rest] = tokens;
  if (isObject(schema.properties) && Object.hasOwn(schema.properties, token)) {
    if (!rest.length) delete schema.properties[token];
    else {
      const child = schema.properties[token];
      if (typeof child === 'boolean' || isObject(child))
        omitBoundSchemaField(child, rest, source);
    }
  } else if (schema.type === 'array' && /^(0|[1-9][0-9]*)$/.test(token)) {
    const child =
      Array.isArray(schema.prefixItems) &&
      Number(token) < schema.prefixItems.length
        ? schema.prefixItems[Number(token)]
        : schema.items;
    if (typeof child === 'boolean' || isObject(child))
      omitBoundSchemaField(child, rest, source);
  } else if (
    typeof schema.additionalProperties === 'boolean' ||
    isObject(schema.additionalProperties)
  ) {
    omitBoundSchemaField(schema.additionalProperties, rest, source);
  }
}
