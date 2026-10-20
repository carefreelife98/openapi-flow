import type {
  ApiInputAnswer,
  ApiInputRequirement,
} from './api-clarification.js';

export interface ApiInputAnswerContext {
  reply: string;
  requirements: ApiInputRequirement[];
}

export interface ApiInputAnswerSource {
  requirementId: string;
  sourceFormat: 'text' | 'json';
  sourceText: string;
}

export interface ExplainedApiInputAnswerSource extends ApiInputAnswerSource {
  reason: string;
}

export interface ApiInputAnswerSourceLocation {
  offset: number;
  length: number;
}

export interface LocatedApiInputAnswerSource extends ApiInputAnswerSource {
  /** All exact, complete occurrences; offsets count JavaScript UTF-16 code units. */
  occurrences: ApiInputAnswerSourceLocation[];
}

export interface ResolveApiInputAnswerSourcesInput extends ApiInputAnswerContext {
  selections: ApiInputAnswerSource[];
}

export interface ResolvedApiInputAnswerSources {
  answers: ApiInputAnswer[];
  sources: LocatedApiInputAnswerSource[];
  unansweredRequirementIds: string[];
}

export interface ApiInputAnswerExtractionDecision {
  reason: string;
  answers: ExplainedApiInputAnswerSource[];
}

export interface ApiInputAnswerExtractionRecord {
  kind: 'model-extracted-api-input-answers';
  decision: ApiInputAnswerExtractionDecision;
  evidence: ApiInputAnswerContext;
  verification: ResolvedApiInputAnswerSources;
}

export interface CreateApiInputAnswerExtractionRecordInput extends ApiInputAnswerContext {
  decision: ApiInputAnswerExtractionDecision;
}

export interface ValidateApiInputAnswerExtractionRecordInput extends ApiInputAnswerContext {
  record: ApiInputAnswerExtractionRecord;
}

export interface ApiInputAnswerAnalysis extends ResolvedApiInputAnswerSources {
  status: 'extracted' | 'no-pending-inputs' | 'empty-reply';
  extraction?: ApiInputAnswerExtractionRecord;
}
