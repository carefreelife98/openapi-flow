import type { OpenApiDocument, OperationCandidate } from './openapi.js';
import type { ApiSelectionExplanation } from './api-selection-evidence.js';

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

/** One scenario call instance; separate roles may reference the same operation key. */
export interface SelectedApiOperation {
  key: ApiOperationKey;
  purpose: string;
  explanation?: ApiSelectionExplanation;
}

export interface ApiCapabilityGap {
  kind: 'missing_operation' | 'insufficient_contract';
  description: string;
  operation?: ApiOperationKey;
  explanation?: ApiSelectionExplanation;
}

export interface ApiSelection {
  operations: SelectedApiOperation[];
  gaps: ApiCapabilityGap[];
}
