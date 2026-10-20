import type { z } from 'zod';
import type { ApiArgumentValues } from './api-arguments.js';
import type { JsonObject } from './openapi.js';

export type LiteralInputSchema = JsonObject | boolean;

export interface LiteralInputProjection {
  schema: LiteralInputSchema;
  hasLiteralValues: boolean;
}

export type ApiArgumentProposalSchemaShape = {
  values: z.ZodType<ApiArgumentValues>;
};

export interface ApiArgumentGenerationContract {
  schema: z.ZodObject<ApiArgumentProposalSchemaShape, z.core.$strict>;
  valuesSchema: z.ZodType<ApiArgumentValues>;
  literalInputSchema: JsonObject;
  hasLiteralInputs: boolean;
}
