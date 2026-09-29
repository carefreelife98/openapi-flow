import { validate as resolveAndValidate } from '@scalar/openapi-parser';
import { validate } from '@scalar/openapi-validator';
import type {
  JsonObject,
  OpenApiDocument,
  ParsedDocument,
} from '../../types/openapi.js';
import { object } from './parse-spec-utils.js';

export function validateOpenApi(input: unknown): JsonObject {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new Error('spec must be JSON-serializable');
  }
  if (!serialized) throw new Error('spec must be a JSON document');
  const spec = object(JSON.parse(serialized), 'spec');
  const result = validate(spec);
  if (!result.valid) {
    throw new Error(
      'spec OpenAPI validation failed: ' +
        result.errors.map((error) => error.message).join('; '),
    );
  }
  return spec;
}

export async function validateAndResolveOpenApiDocument(
  input: OpenApiDocument,
): Promise<ParsedDocument> {
  const spec = validateOpenApi(input);
  const result = await resolveAndValidate(spec);
  if (!result.valid) {
    throw new Error(
      'spec OpenAPI reference resolution failed: ' +
        result.errors.map((error) => error.message).join('; '),
    );
  }
  const resolved = object(result.schema, 'spec validated schema');
  return {
    spec: resolved,
    paths:
      resolved.paths === undefined ? {} : object(resolved.paths, 'spec.paths'),
  };
}
