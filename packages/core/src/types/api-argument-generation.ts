import type { z } from 'zod';
import type { ApiArgumentProposal } from './api-arguments.js';
import type { JsonObject } from './openapi.js';

export type LiteralInputSchema = JsonObject | boolean;

export interface LiteralInputProjection {
  schema: LiteralInputSchema;
  hasLiteralValues: boolean;
}

export interface ApiArgumentGenerationContract {
  schema: z.ZodType<ApiArgumentProposal>;
  literalInputSchema: JsonObject;
  hasLiteralInputs: boolean;
}
