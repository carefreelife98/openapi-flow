import type { ApiSecurityRequirement } from './api-operation.js';
import type { JsonObject } from './openapi.js';

export interface ResolveOpenApiSecurityInput {
  operationRef: string;
  security: ApiSecurityRequirement[];
  securitySchemes: JsonObject;
  requirementIndex?: number;
}

export interface ResolvedSecurityScheme {
  name: string;
  scopes: string[];
  definition: JsonObject;
}

export interface ResolvedOpenApiSecurity {
  requirementIndex: number;
  schemes: ResolvedSecurityScheme[];
}
