export type JsonObject = Record<string, unknown>;
export type Scalar = string | number | boolean;
export type OperationMethod = string;

export interface OperationEntry {
  method: string;
  key: string;
  value: unknown;
}

export interface ScalarSchema {
  type: string;
  enum?: Scalar[];
}

export type ScalarProperties = Record<string, ScalarSchema>;

export interface OperationParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: ScalarSchema;
}

export interface OperationBody {
  required: boolean;
  requiredProperties: string[];
  properties: ScalarProperties;
}

export interface Operation {
  operationRef: string;
  operationId?: string;
  method: OperationMethod;
  path: string;
  summary: string;
  effect: 'read' | 'write' | 'unknown';
  status: number;
  parameters: OperationParameter[];
  body?: OperationBody;
  responseProperties: ScalarProperties;
}

export type OperationCandidate = Pick<
  Operation,
  'operationRef' | 'operationId' | 'method' | 'path' | 'summary'
>;

export interface ObjectSchemaProperties {
  properties: JsonObject;
  required: string[];
}

export interface ParsedDocument {
  spec: JsonObject;
  paths: JsonObject;
}
