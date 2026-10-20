import type { ApiOperationKey } from './api-catalog.js';
import type { ApiArgumentGenerationInput } from './api-clarification.js';
import type { ApiArgumentGenerationContract } from './api-argument-generation.js';
import type {
  ApiArgumentProposal,
  ApiArgumentValues,
} from './api-arguments.js';
import type { JsonObject } from './openapi.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';

export interface ApiLiteralGenerationInput extends ApiArgumentGenerationInput {
  callId: string;
  scenario: string;
  /** Supplied call-instance role; never inferred from its array position or API path. */
  purpose?: string;
}

export interface ApiLiteralGenerationOperation {
  key: ApiOperationKey;
  method: string;
  path: string;
  summary?: string;
  description?: string;
}

export interface ApiLiteralGenerationContext {
  scenario: string;
  purpose?: string;
  operation: ApiLiteralGenerationOperation;
  literalInputSchema: JsonObject;
  requestMediaType?: string;
}

export interface ApiLiteralGenerationDescription {
  input: ApiLiteralGenerationInput;
  contract: ApiArgumentGenerationContract;
  context: ApiLiteralGenerationContext;
}

export type ApiLiteralGenerationEvidence =
  | { kind: 'scenario'; text: string; purpose?: string }
  | {
      kind: 'literal-input-contract';
      operation: ApiLiteralGenerationOperation;
      schema: JsonObject;
      requestMediaType?: string;
    };

export type ApiLiteralGenerationRecord =
  | { kind: 'not-needed'; callId: string; operation: ApiOperationKey }
  | {
      kind: 'proposed-literals';
      callId: string;
      operation: ApiOperationKey;
      proposedValues: ApiArgumentValues;
      explanation: WorkflowDecisionExplanation<ApiLiteralGenerationEvidence>;
    };

export interface CreateApiLiteralGenerationRecordInput extends ApiLiteralGenerationInput {
  proposal?: ApiArgumentProposal;
  reason?: string;
}

export interface ValidateApiLiteralGenerationRecordInput extends ApiLiteralGenerationInput {
  record: ApiLiteralGenerationRecord;
}
