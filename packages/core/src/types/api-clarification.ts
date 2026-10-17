import type {
  ApiCatalog,
  ApiOperationKey,
  ApiOperationCandidate,
  ApiSelection,
} from './api-catalog.js';
import type {
  ApiArgumentsSchemaInput,
  ApiArgumentValues,
  JsonValue,
  ValidateApiArgumentsInput,
} from './api-arguments.js';
import type { JsonObject } from './openapi.js';

export interface ConfirmedApiInput {
  callId: string;
  operation: ApiOperationKey;
  targetPointer: string;
  value: JsonValue;
}

export interface ApiArgumentGenerationInput extends ApiArgumentsSchemaInput {
  callId?: string;
  confirmedInputs?: ConfirmedApiInput[];
}

export interface ApplyConfirmedApiInputsInput extends ApiArgumentGenerationInput {
  values: ApiArgumentValues;
}

export interface ApiInputRequirement {
  kind: 'missing-input';
  id: string;
  callId: string;
  operation: ApiOperationKey;
  targetPointer: string;
  schema: JsonObject | boolean;
  openapiVersion: string;
  operationSummary?: string;
  parameterDescription?: string;
  message: string;
}

export interface InspectApiArgumentRequirementsInput extends ValidateApiArgumentsInput {
  callId: string;
}

export interface ApiArgumentRequirements {
  status: 'ready' | 'needs-input';
  requirements: ApiInputRequirement[];
}

export interface ApiInputAnswer {
  requirementId: string;
  value: JsonValue;
}

export interface ApiAnswerIssue {
  requirementId: string;
  message: string;
}

export interface ValidateApiInputAnswersInput {
  requirements: ApiInputRequirement[];
  answers: ApiInputAnswer[];
  operations: ApiOperationKey[];
}

export type ApiInputAnswersResult =
  | { status: 'accepted'; confirmedInputs: ConfirmedApiInput[] }
  | { status: 'invalid-answer'; issues: ApiAnswerIssue[] };

export interface ApiOperationChoice {
  kind: 'operation-choice';
  id: string;
  message: string;
  purpose: string;
  candidates: ApiOperationCandidate[];
}

export interface ApiSelectionAnalysis {
  selection: ApiSelection;
  questions: ApiOperationChoice[];
}

export interface ApiOperationAnswer {
  questionId: string;
  operation: ApiOperationKey;
}

export interface ResolveApiSelectionAnswersInput {
  catalog: ApiCatalog;
  analysis: ApiSelectionAnalysis;
  answers: ApiOperationAnswer[];
}
