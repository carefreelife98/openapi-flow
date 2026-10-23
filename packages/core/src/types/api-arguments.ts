import type { ApiOperationContract } from './api-operation.js';
import type { ApiLiteralGenerationRecord } from './api-literal-generation.js';
import type { ValidateApiInputAnswerAnalysisInput } from './api-input-answer-extraction.js';
import type { VerifiedApiLiteralProposalSource } from './api-input-literal-source.js';

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
  /** Opt-in interpretation of unresolved OAS enum inputs; never verbatim literal attribution. */
  enumInterpretation?: ValidateApiInputAnswerAnalysisInput;
  /** Code-verified coverage of the original literal proposal, excluding copied OAS values. */
  literalSources?: VerifiedApiLiteralProposalSource[];
}
export interface ValidateApiArgumentsInput extends ApiArgumentsSchemaInput {
  values: ApiArgumentValues;
}
export interface ApiArgumentValidation {
  valid: boolean;
  missingInputs: string[];
  requiresRuntimeValidation: boolean;
}
