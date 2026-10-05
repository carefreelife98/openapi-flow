import type {
  LiteralInputProjection,
  LiteralInputSchema,
} from '../types/api-argument-generation.js';
import type { JsonObject } from '../types/openapi.js';
import { isObject } from '../utils/is-object.js';
import { projectLiteralInputSchema } from './project-literal-input-schema.js';

/** Project specific array positions, never every item because one index is bound. */
export function projectLiteralArraySchema(
  schema: JsonObject,
  targets: string[][],
  source: string,
): LiteralInputProjection {
  const prefix: LiteralInputSchema[] = [];
  const original = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : [];
  for (const child of original) {
    if (typeof child !== 'boolean' && !isObject(child))
      throw new Error(`${source}.prefixItems must contain schemas`);
    prefix.push(child);
  }
  const rawRest = Array.isArray(schema.items)
    ? schema.additionalItems
    : schema.items;
  if (
    rawRest !== undefined &&
    typeof rawRest !== 'boolean' &&
    !isObject(rawRest)
  )
    throw new Error(`${source}.items must be a schema`);
  const rest: LiteralInputSchema = rawRest === undefined ? true : rawRest;
  const availability = prefix.map((child) => child !== false);
  let limit = typeof schema.maxItems === 'number' ? schema.maxItems : Infinity;
  for (const token of new Set(targets.map(([index]) => index))) {
    if (
      !/^(0|[1-9][0-9]*)$/.test(token) ||
      !Number.isSafeInteger(Number(token))
    )
      throw new Error(`${source}/${token}: binding requires an array index`);
    const index = Number(token);
    while (prefix.length <= index) {
      prefix.push(structuredClone(rest));
      availability.push(rest !== false);
    }
    const projected = projectLiteralInputSchema(
      prefix[index],
      targets.filter(([key]) => key === token).map((tokens) => tokens.slice(1)),
      `${source}/${token}`,
    );
    prefix[index] = projected.schema;
    availability[index] = projected.hasLiteralValues;
    // JSON literals cannot leave a hole for a fully bound element.
    if (projected.schema === false) limit = Math.min(limit, index);
  }
  schema.prefixItems = prefix;
  schema.items = rest;
  delete schema.additionalItems;
  if (Number.isFinite(limit)) schema.maxItems = limit;
  if (
    typeof schema.minItems === 'number' &&
    targets.some(([index]) => Number(index) + 1 >= Number(schema.minItems))
  )
    schema.minItems = 0;
  return {
    schema,
    hasLiteralValues:
      availability.slice(0, limit).some(Boolean) ||
      (rest !== false && prefix.length < limit),
  };
}
