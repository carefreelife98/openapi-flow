import { z } from 'zod';
import type { ApiResponsePointerSelectionDescription } from '../types/api-response-pointers.js';
import { escapeRegExpLiteral } from '../utils/escape-regexp-literal.js';

/** Shared finite/dynamic JSON pointer encoding; source-specific contracts remain with the caller. */
export function createValuePointerSelectionSchema(
  description: ApiResponsePointerSelectionDescription,
  help: string,
): z.ZodType<string, string> {
  if (!description.dynamicLocations.length)
    return (
      description.declaredPointers.length
        ? z.enum(description.declaredPointers)
        : z.never()
    ).describe(help);
  const token = '(?:[^~/]|~[01])*';
  const descendants = `(?:/${token})*`;
  const choices = [
    ...description.declaredPointers.map(escapeRegExpLiteral),
    ...description.dynamicLocations.map((location) => {
      const prefix = escapeRegExpLiteral(location.pointer);
      if (location.kind === 'array-items')
        return `${prefix}/(?:0|[1-9][0-9]*)${descendants}`;
      if (
        location.kind === 'additional-properties' ||
        location.kind === 'pattern-properties'
      )
        return `${prefix}/${token}${descendants}`;
      return `${prefix}${descendants}`;
    }),
  ];
  const pattern = new RegExp(`^(?:${[...new Set(choices)].join('|')})$`);
  const excluded = new Set(description.excludedPointers);
  return (
    z
      .string()
      .regex(pattern)
      // Portable wire patterns describe candidates. The code-only refinement
      // excludes known non-array locations and enforces an exact string match.
      // Full OAS reference validation still checks each chosen dynamic pointer.
      .refine(
        (value) => !excluded.has(value) && pattern.exec(value)?.[0] === value,
        'Response pointer does not select an eligible declared value',
      )
      .describe(help)
  );
}
