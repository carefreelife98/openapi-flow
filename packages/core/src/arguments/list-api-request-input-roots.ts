import type { JsonObject } from '../types/openapi.js';
import { object } from '../openapi/common/parse-spec-utils.js';

/** Roots of the existing full request schema; dynamic descendants remain legal and are checked against the original OAS. */
export function listApiRequestInputRoots(schema: JsonObject): string[] {
  return Object.entries(
    object(schema.properties, 'requestSchema.properties'),
  ).flatMap(([location, schema]) => {
    if (location === 'body') return ['/body'];
    return Object.keys(
      object(
        object(schema, `requestSchema.${location}`).properties,
        `requestSchema.${location}.properties`,
      ),
    ).map(
      (name) =>
        `/${location}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`,
    );
  });
}
