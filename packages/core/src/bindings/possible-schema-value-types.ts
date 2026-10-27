import type { BindingSchema } from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';

const valueTypes = [
  'null',
  'boolean',
  'object',
  'array',
  'string',
  'number',
  'integer',
];

/** Necessary declared type conditions only. References and other assertions are not erased or evaluated. */
export function possibleSchemaValueTypes(schema: BindingSchema): Set<string> {
  if (typeof schema === 'boolean') return new Set(schema ? valueTypes : []);
  let possible = new Set(valueTypes);
  if (schema.type !== undefined) {
    const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
    const selected = new Set<string>();
    for (const type of declared) {
      if (typeof type !== 'string' || !valueTypes.includes(type))
        throw new Error(
          'Schema type analysis requires standard JSON Schema type names',
        );
      selected.add(type);
      if (type === 'number') selected.add('integer');
    }
    possible = selected;
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const children = schema[keyword];
    if (!Array.isArray(children)) continue;
    const branches = children.map((child) => {
      if (typeof child !== 'boolean' && !isObject(child))
        throw new Error(
          `Schema type analysis ${keyword} requires schema objects or booleans`,
        );
      return possibleSchemaValueTypes(child);
    });
    const permitted =
      keyword === 'allOf'
        ? branches.reduce(
            (types, branch) =>
              new Set([...types].filter((type) => branch.has(type))),
            new Set(valueTypes),
          )
        : new Set(branches.flatMap((branch) => [...branch]));
    possible = new Set([...possible].filter((type) => permitted.has(type)));
  }
  return possible;
}
