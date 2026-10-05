import type {
  OpenApiDocument,
  OperationCandidate,
  ParsedDocument,
} from './openapi.js';
import type { CredentialBindings, EffectPolicy } from './request-workflow.js';

export interface CatalogSource {
  id: string;
  spec: OpenApiDocument;
  baseUrl: string;
  effectPolicy: EffectPolicy;
  credentialBindings: CredentialBindings;
}

export interface CatalogEntry {
  id: string;
  candidate: OperationCandidate;
}

export interface ParsedCatalogSource extends CatalogSource {
  document: ParsedDocument;
  operations: OperationCandidate[];
}

export interface OperationCatalog {
  sources: Map<string, ParsedCatalogSource>;
  entries: CatalogEntry[];
}
