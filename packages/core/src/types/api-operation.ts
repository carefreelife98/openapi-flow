import type {
  OperationObject as Operation30,
  ParameterObject as Parameter30,
  PathItemObject as PathItem30,
  ServerObject as Server30,
} from '@scalar/openapi-types/3.0';
import type {
  OperationObject as Operation31,
  ParameterObject as Parameter31,
  PathItemObject as PathItem31,
  ServerObject as Server31,
} from '@scalar/openapi-types/3.1';
import type {
  OperationObject as Operation32,
  ParameterObject as Parameter32,
  PathItemObject as PathItem32,
  ServerObject as Server32,
} from '@scalar/openapi-types/3.2';
import type { ApiOperationKey } from './api-catalog.js';
import type { JsonObject } from './openapi.js';

export type ApiOperationObject = Operation30 | Operation31 | Operation32;
export type ApiParameterObject = Parameter30 | Parameter31 | Parameter32;
export type ApiPathItemObject = PathItem30 | PathItem31 | PathItem32;
export type ApiServerObject = Server30 | Server31 | Server32;
export type ApiSecurityRequirement = Record<string, string[]>;

export interface EffectiveApiContract {
  parameters: ApiParameterObject[];
  security: ApiSecurityRequirement[];
  securitySchemes: JsonObject;
  servers?: ApiServerObject[];
}

export interface ApiOperationContract {
  key: ApiOperationKey;
  openapiVersion: string;
  source: 'paths';
  method: string;
  path: string;
  operation: ApiOperationObject;
  pathItem: ApiPathItemObject;
  effective: EffectiveApiContract;
}
