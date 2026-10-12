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
