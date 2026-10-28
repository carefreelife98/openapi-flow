import type { BindingSchema } from '../../types/api-bindings.js';
import { isObject } from '../../utils/is-object.js';

const jsonTypes = [
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'integer',
  'string',
];

/** Conservative type algebra. Unknown is represented explicitly by all JSON types. */
export function bindingSchemaTypes(schema: BindingSchema): string[] {
  if (schema === false) return [];
  if (schema === true) return [...jsonTypes];
  let types =
    typeof schema.type === 'string'
      ? [schema.type]
      : Array.isArray(schema.type)
        ? schema.type.filter((type): type is string => typeof type === 'string')
        : [...jsonTypes];
  if (schema.nullable === true && !types.includes('null')) types.push('null');
  if (types.includes('number') && !types.includes('integer'))
    types.push('integer');
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const children = branches
      .filter(
        (value): value is BindingSchema =>
          typeof value === 'boolean' || isObject(value),
      )
      .map(bindingSchemaTypes);
    types = types.filter((type) =>
      keyword === 'allOf'
        ? children.every((child) => child.includes(type))
        : children.some((child) => child.includes(type)),
    );
  }
  return types;
}
