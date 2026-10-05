import type {
  LiteralInputProjection,
  LiteralInputSchema,
} from '../types/api-argument-generation.js';
import { isObject } from '../utils/is-object.js';
import { projectLiteralArraySchema } from './project-literal-array-schema.js';

/** Bound fields do not belong in the model's literal-value output schema. */
export function projectLiteralInputSchema(
  input: LiteralInputSchema,
  targets: string[][],
  source: string,
): LiteralInputProjection {
  if (targets.some((tokens) => tokens.length === 0))
    return { schema: false, hasLiteralValues: false };
  if (!targets.length || input === false)
    return {
      schema: structuredClone(input),
      hasLiteralValues: input !== false,
    };
  if (input === true) return projectLiteralInputSchema({}, targets, source);
  const schema = structuredClone(input);
  if (Array.isArray(schema.type)) {
    const variants = schema.type.map((type) =>
      projectLiteralInputSchema({ ...schema, type }, targets, source),
    );
    return {
      schema: { anyOf: variants.map((variant) => variant.schema) },
      hasLiteralValues: variants.some((variant) => variant.hasLiteralValues),
    };
  }
  if (
    typeof schema.type === 'string' &&
    !['object', 'array'].includes(schema.type)
  )
    return { schema: false, hasLiteralValues: false };
  const combinations = new Map<string, LiteralInputProjection[]>();
  const conjuncts: LiteralInputSchema[] = [];
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const projected = schema[key].map((child) => {
      if (typeof child !== 'boolean' && !isObject(child))
        throw new Error(`${source}.${key} must contain schemas`);
      return projectLiteralInputSchema(child, targets, source);
    });
    const alternatives = projected.map((child) => child.schema);
    delete schema[key];
    // Bound discriminators distinguish completed values, not partial literals.
    // Preserve simultaneous composition constraints in one conjunction; exact-one
    // validation belongs to the untouched OAS after materialization.
    if (key === 'allOf') conjuncts.push(...alternatives);
    else conjuncts.push({ anyOf: alternatives });
    combinations.set(key, projected);
  }
  if (combinations.size) schema.allOf = conjuncts;
  const combinationAllowsLiterals = [...combinations].every(
    ([kind, children]) =>
      kind === 'allOf'
        ? children.every((child) => child.hasLiteralValues)
        : children.some((child) => child.hasLiteralValues),
  );
  if (schema.type === 'array')
    return projectLiteralArraySchema(schema, targets, source);
  if (
    schema.type === 'object' ||
    isObject(schema.properties) ||
    isObject(schema.patternProperties) ||
    schema.additionalProperties !== undefined
  ) {
    const properties: Record<string, LiteralInputSchema> = Object.create(null);
    const availability = new Map<string, boolean>();
    for (const [name, child] of Object.entries(
      isObject(schema.properties) ? schema.properties : {},
    )) {
      if (typeof child !== 'boolean' && !isObject(child))
        throw new Error(`${source}.properties.${name} must be a schema`);
      properties[name] = child;
      availability.set(name, child !== false);
    }
    const names = new Set(targets.map(([name]) => name));
    for (const name of names) {
      const children = targets
        .filter(([token]) => token === name)
        .map((tokens) => tokens.slice(1));
      let child: LiteralInputSchema;
      if (Object.hasOwn(properties, name)) child = properties[name];
      else {
        const patterns = Object.entries(
          isObject(schema.patternProperties) ? schema.patternProperties : {},
        )
          .filter(([pattern]) => new RegExp(pattern).test(name))
          .map(([, value]) => value);
        if (patterns.length) child = { allOf: patterns };
        else {
          // OAS/JSON Schema permits additional properties unless explicitly closed.
          const additional = schema.additionalProperties;
          if (additional === false)
            return { schema: false, hasLiteralValues: false };
          if (
            additional !== undefined &&
            additional !== true &&
            !isObject(additional)
          )
            throw new Error(`${source}.additionalProperties must be a schema`);
          child = additional === undefined ? true : additional;
        }
      }
      const projected = projectLiteralInputSchema(
        child,
        children,
        `${source}/${name}`,
      );
      // A false property blocks re-entry through additionalProperties and patterns.
      properties[name] = projected.schema;
      availability.set(name, projected.hasLiteralValues);
    }
    schema.properties = properties;
    // Counts describe the completed request; preceding nodes contribute keys too.
    if (typeof schema.minProperties === 'number')
      schema.minProperties = Math.max(0, schema.minProperties - names.size);
    if (typeof schema.maxProperties === 'number')
      schema.maxProperties = Math.max(
        0,
        schema.maxProperties -
          targets.filter((tokens) => tokens.length === 1).length,
      );
    const open = schema.additionalProperties !== false;
    const patterns = isObject(schema.patternProperties)
      ? Object.values(schema.patternProperties).some((child) => child !== false)
      : false;
    return {
      schema,
      hasLiteralValues:
        combinationAllowsLiterals &&
        (open || patterns || [...availability.values()].some(Boolean)),
    };
  }
  if (combinations.size)
    return {
      schema,
      hasLiteralValues: combinationAllowsLiterals,
    };
  // An unconstrained OAS schema permits both containers. Keep every container
  // compatible with the pointer instead of guessing whether numeric keys are arrays.
  return projectLiteralInputSchema(
    {
      ...schema,
      anyOf: [
        { type: 'object' },
        ...(targets.every(([token]) => /^(0|[1-9][0-9]*)$/.test(token))
          ? [{ type: 'array' }]
          : []),
      ],
    },
    targets,
    source,
  );
}
