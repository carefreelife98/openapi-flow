import { z } from 'zod';
import type { JsonObject } from '@openapi-flow/core';
import type {
  StructuredOutputSchemaDialect,
  StructuredOutputSchemaDirection,
  StructuredOutputSchemaReuse,
} from '../types/structured-output-schema.js';

/** Send JSON data, not Zod's non-enumerable Standard Schema re-serialization hook. */
export function serializeStructuredOutputSchema(
  schema: z.ZodType,
  target: StructuredOutputSchemaDialect,
  io: StructuredOutputSchemaDirection = 'output',
  reused: StructuredOutputSchemaReuse = 'inline',
): JsonObject {
  return JSON.parse(
    JSON.stringify(
      z.toJSONSchema(schema, {
        target,
        io,
        reused,
        cycles: 'ref',
      }),
    ),
  ) as JsonObject;
}
