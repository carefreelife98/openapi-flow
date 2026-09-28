export type JsonObject = Record<string, unknown>;
export type Scalar = string | number | boolean;
export type OperationMethod = string;

export interface OperationEntry {
  method: string;
  key: string;
  value: unknown;
}

export interface OperationSource {
  candidate: OperationCandidate;
  pathItem: JsonObject;
  entry: OperationEntry;
}

export interface ScalarSchema {
  type: string;
  enum?: Scalar[];
}

export type ResponseProperties = Record<string, JsonObject | boolean>;
export type OperationResponses = Record<string, ResponseProperties>;

export interface OperationParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: ScalarSchema;
}

export interface OperationBody {
  required: boolean;
  schema?: JsonObject;
  properties: JsonObject;
}

export interface OperationAuthentication {
  schemeName: string;
  credentialType: 'httpBearerAuth';
}

export interface OperationMetadata {
  operationId?: string;
  summary: string;
  description: string;
  tags: string[];
}

export interface Operation extends OperationMetadata {
  operationRef: string;
  method: OperationMethod;
  path: string;
  authentication?: OperationAuthentication;
  parameters: OperationParameter[];
  body?: OperationBody;
  responses: OperationResponses;
}

export type OperationCandidate = Pick<
  Operation,
  | 'operationRef'
  | 'operationId'
  | 'method'
  | 'path'
  | 'summary'
  | 'description'
  | 'tags'
>;

export interface ParsedDocument {
  spec: JsonObject;
  paths: JsonObject;
}
