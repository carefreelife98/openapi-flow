import type { createValidator } from '@scalar/json-schema-validator';
import type { JsonObject } from './openapi.js';

export type OasValueSchema = JsonObject | boolean;
export type OasValueValidation = ReturnType<typeof createValidator>;

export interface OasValueValidator {
  schema: JsonObject;
  validate: OasValueValidation;
}
