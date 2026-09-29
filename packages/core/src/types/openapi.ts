export type JsonObject = Record<string, unknown>;
export type Scalar = string | number | boolean;
export type OperationMethod = string;
export type OperationSourceKind = 'paths' | 'webhooks' | 'callbacks';

export interface OperationEntry {
  method: string;
  key: string;
  value: unknown;
}

export interface ScalarSchema {
  type: string;
  enum?: Scalar[];
}

export interface OperationMetadata {
  operationId?: string;
  summary: string;
  description: string;
  tags: string[];
}

export interface OperationCandidate extends OperationMetadata {
  source: OperationSourceKind;
  operationRef: string;
  method: OperationMethod;
  path: string;
}

export interface ParsedDocument {
  spec: JsonObject;
  paths: JsonObject;
}
