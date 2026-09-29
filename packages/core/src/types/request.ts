import type {
  JsonObject,
  OperationCandidate,
  OperationEntry,
  OperationMetadata,
  OperationMethod,
} from './openapi.js';

export interface OperationSource {
  candidate: OperationCandidate;
  pathItem: JsonObject;
  entry: OperationEntry;
}

export type ResponseProperties = Record<string, JsonObject | boolean>;
export type OperationResponses = Record<string, ResponseProperties>;

export interface OperationParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: JsonObject | boolean;
  style: string;
  explode: boolean;
  allowReserved: boolean;
  contentMediaType?: string;
}

export interface OperationBody {
  required: boolean;
  mediaTypes: Record<string, OperationBodyMedia>;
}

export interface OperationBodyMedia {
  schema?: JsonObject | boolean;
  properties: JsonObject;
  encoding?: JsonObject;
}

export interface OperationAuthentication {
  schemeName: string;
  credentialType: 'httpBearerAuth';
}

export interface Operation extends OperationMetadata {
  source: 'paths';
  operationRef: string;
  method: OperationMethod;
  path: string;
  authentication?: OperationAuthentication;
  parameters: OperationParameter[];
  body?: OperationBody;
  responses: OperationResponses;
}
