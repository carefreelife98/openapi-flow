import type { ApiOperationKey } from './api-catalog.js';
import type { JsonValue } from './api-arguments.js';
import type { ApiBindingMaterial, BindingSchema } from './api-bindings.js';
import type { ApiInputRequirement } from './api-clarification.js';
import type { SchemaResourceContext } from './schema-resource.js';

export interface ApiInputEnumCandidate {
  id: string;
  callId: string;
  operation: ApiOperationKey;
  targetPointer: string;
  /** Location in the original target schema, never a human quotation. */
  schemaPointer: string;
  value: JsonValue;
}

export type ApiInputEnumSource =
  | (ApiBindingMaterial & { kind: 'operation'; targetPointer: string })
  | { kind: 'requirement'; requirement: ApiInputRequirement };

export interface ApiInputEnumCandidatesInput {
  source: ApiInputEnumSource;
  schemas: BindingSchema[];
  resources: SchemaResourceContext;
}
