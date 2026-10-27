import type { ApiOperationContract } from './api-operation.js';

export type ApiResponsePointerType = string | string[];

export interface ApiResponsePointer {
  pointer: string;
  schemaLocation: string;
  type?: ApiResponsePointerType;
  description?: string;
}

export type ApiResponsePointerBoundaryKind =
  | 'additional-properties'
  | 'pattern-properties'
  | 'array-items'
  | 'reference'
  | 'recursive-schema'
  | 'unconstrained';

export interface ApiResponsePointerBoundary {
  pointer: string;
  schemaLocation: string;
  kind: ApiResponsePointerBoundaryKind;
  constraint?: string;
}

export interface ApiResponsePointerCatalog {
  responseKey: string;
  mediaType: string;
  declaredPointers: ApiResponsePointer[];
  dynamicLocations: ApiResponsePointerBoundary[];
}
export interface ApiResponsePointerSelectionInput {
  operation: ApiOperationContract;
  valueKind: 'array' | 'value';
}

export interface ApiResponsePointerSelectionDescription {
  declaredPointers: string[];
  excludedPointers: string[];
  dynamicLocations: ApiResponsePointerBoundary[];
}
