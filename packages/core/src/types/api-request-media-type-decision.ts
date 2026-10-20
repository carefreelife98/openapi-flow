import type { ApiOperationContract } from './api-operation.js';
import type { ApiOperationKey } from './api-catalog.js';
import type { JsonObject } from './openapi.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';

export interface ApiRequestMediaTypeContextInput {
  operation: ApiOperationContract;
  scenario: string;
  purpose?: string;
}

export interface ApiRequestMediaTypeSource {
  key: ApiOperationKey;
  method: string;
  path: string;
  requestBody?: JsonObject;
}

export interface ApiRequestMediaTypeContext {
  scenario: string;
  purpose?: string;
  operation: ApiRequestMediaTypeSource;
  mediaTypes: string[];
}

export type ApiRequestMediaTypeEvidence =
  | { kind: 'scenario'; text: string; purpose?: string }
  | {
      kind: 'oas-request-body';
      operation: ApiOperationKey;
      pointer: '/requestBody';
      value: JsonObject;
    };

/** The optional reason explains the assessment, not a code-owned default choice. */
export interface ProposedApiRequestMediaTypeAssessment {
  requestMediaType: string | null;
  explanation?: { reason: string };
}

export interface ApiRequestMediaTypeAssessment extends Omit<
  ProposedApiRequestMediaTypeAssessment,
  'explanation'
> {
  explanation?: WorkflowDecisionExplanation<ApiRequestMediaTypeEvidence>;
}

export interface ApiRequestMediaTypeDecisionFields {
  operation: ApiOperationKey;
  declaredMediaTypes: string[];
}

export type ApiRequestMediaTypeDecision = ApiRequestMediaTypeDecisionFields &
  (
    | { kind: 'no-request-body'; requestMediaType?: never }
    | { kind: 'single-declared-format'; requestMediaType: string }
    | {
        kind: 'model-selection';
        requestMediaType: string;
        assessment: ApiRequestMediaTypeAssessment & {
          requestMediaType: string;
        };
      }
    | {
        kind: 'documented-default';
        requestMediaType: string;
        policy: 'json-form-concrete-wildcard-code-point';
        assessment: ApiRequestMediaTypeAssessment & {
          requestMediaType: null;
        };
      }
  );

export interface CreateApiRequestMediaTypeDecisionInput extends ApiRequestMediaTypeContextInput {
  assessment?: ProposedApiRequestMediaTypeAssessment;
}

export interface ValidateApiRequestMediaTypeDecisionInput extends ApiRequestMediaTypeContextInput {
  decision: ApiRequestMediaTypeDecision;
}
