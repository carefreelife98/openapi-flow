import { z } from 'zod';
import type { ApiArgumentProposal } from '@openapi-flow/core';

/** The OAS-derived schema decides whether the model has any values to propose. */
export function hasLiteralArgumentFields(
  schema: z.ZodType<ApiArgumentProposal>,
): boolean {
  if (
    !(schema instanceof z.ZodObject) ||
    !(schema.shape.values instanceof z.ZodObject)
  )
    throw new Error(
      'API argument schema must declare an object of literal values',
    );
  return Object.keys(schema.shape.values.shape).length > 0;
}
