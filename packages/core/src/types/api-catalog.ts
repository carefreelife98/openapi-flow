import type { OpenApiDocument, OperationCandidate } from './openapi.js';

export interface ApiSource {
  id: string;
  spec: OpenApiDocument;
}

export interface ApiOperationKey {
  documentId: string;
  snapshotId: string;
  operationRef: string;
}

export interface ApiOperationCandidate extends OperationCandidate {
  key: ApiOperationKey;
}

export interface ApiCatalogDocument extends ApiSource {
  snapshotId: string;
}

export interface ApiCatalog {
  documents: ApiCatalogDocument[];
  operations: ApiOperationCandidate[];
}

export interface SelectedApiOperation {
  key: ApiOperationKey;
  purpose: string;
}

export interface ApiCapabilityGap {
  kind: 'missing_operation' | 'insufficient_contract';
  description: string;
  operation?: ApiOperationKey;
}

export interface ApiSelection {
  operations: SelectedApiOperation[];
  gaps: ApiCapabilityGap[];
}
