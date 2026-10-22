import type { createValidator } from '@scalar/json-schema-validator';
import type { JsonObject } from './openapi.js';
import type { SchemaDialect } from './schema-dialect.js';

export type OasValueSchema = JsonObject | boolean;
export type OasValueValidation = ReturnType<typeof createValidator>;

export interface OasValueValidator {
  schema: JsonObject;
  validate: OasValueValidation;
}

export interface OasValueValidationCacheOptions {
  maximumEntries: number;
  maximumRetainedSchemaBytes: number;
}

export interface OasValueValidationCacheEntry {
  schema: JsonObject;
  validate: OasValueValidation;
  bytes: number;
}

export interface OasValueValidationCache {
  getOrCreate(
    schema: JsonObject,
    dialect: SchemaDialect,
    compile: (schema: JsonObject) => OasValueValidation,
  ): OasValueValidation;
}
