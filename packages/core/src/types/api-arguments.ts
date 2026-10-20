import type { ApiOperationContract } from './api-operation.js';
import type { ApiLiteralGenerationRecord } from './api-literal-generation.js';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | JsonValueObject;
export interface JsonValueObject {
  [key: string]: JsonValue;
}
export type ApiArgumentValues = {
  path?: JsonValueObject;
  query?: JsonValueObject;
  header?: JsonValueObject;
  cookie?: JsonValueObject;
  querystring?: JsonValueObject;
  body?: JsonValue;
};
export interface OutputBinding {
  kind: 'node-output';
  targetPointer: string;
  sourceNodeId: string;
  sourcePointer: string;
}
export interface ApiArgumentProposal {
  values: ApiArgumentValues;
}
export interface ApiArgumentsSchemaInput {
  operation: ApiOperationContract;
  bindings: OutputBinding[];
  requestMediaType?: string;
}
export type ApiRequestSchemaInput = Omit<ApiArgumentsSchemaInput, 'bindings'>;
export interface ApiCallArguments extends ApiArgumentProposal {
  callId: string;
  requestedInputs?: string[];
  bindings: OutputBinding[];
  unresolvedInputs: string[];
  requestMediaType?: string;
  /** Optional immutable attribution of the original literal proposal, not final merged values. */
  literalGeneration?: ApiLiteralGenerationRecord;
}
export interface ValidateApiArgumentsInput extends ApiArgumentsSchemaInput {
  values: ApiArgumentValues;
}
export interface ApiArgumentValidation {
  valid: boolean;
  missingInputs: string[];
  requiresRuntimeValidation: boolean;
}
