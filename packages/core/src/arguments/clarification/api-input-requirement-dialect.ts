import type { ApiInputRequirement } from '../../types/api-clarification.js';
import type { SchemaDialect } from '../../types/schema-dialect.js';

/** A compiled projection declares its actual dialect; the source OAS version remains unchanged. */
export function apiInputRequirementDialect(
  requirement: ApiInputRequirement,
): SchemaDialect {
  if (requirement.schemaDialect === 'draft-2020-12') return 'draft-2020-12';
  return requirement.openapiVersion.startsWith('3.0.')
    ? 'openapi-3.0'
    : 'draft-2020-12';
}
