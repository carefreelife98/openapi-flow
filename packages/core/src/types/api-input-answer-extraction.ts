import type {
  ApiInputAnswer,
  ApiInputRequirement,
} from './api-clarification.js';
import type {
  ApiInputEnumAnswerSelection,
  ResolvedApiInputAnswerInterpretations,
} from './api-input-enum-answers.js';

export interface ApiInputAnswerContext {
  reply: string;
  requirements: ApiInputRequirement[];
  /** Allow semantic selection of original OAS enum values, never arbitrary generation. */
  selectOasEnums?: boolean;
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
  enumSelections?: ApiInputEnumAnswerSelection[];
}

export interface ApiInputAnswerExtractionRecord {
  kind: 'model-extracted-api-input-answers';
  decision: ApiInputAnswerExtractionDecision;
  evidence: ApiInputAnswerContext;
  verification: ResolvedApiInputAnswerInterpretations;
}

export interface CreateApiInputAnswerExtractionRecordInput extends ApiInputAnswerContext {
  decision: ApiInputAnswerExtractionDecision;
}

export interface ValidateApiInputAnswerExtractionRecordInput extends ApiInputAnswerContext {
  record: ApiInputAnswerExtractionRecord;
}

export interface ApiInputAnswerAnalysis extends ResolvedApiInputAnswerInterpretations {
  status: 'extracted' | 'no-pending-inputs' | 'empty-reply';
  extraction?: ApiInputAnswerExtractionRecord;
}

export interface ValidateApiInputAnswerAnalysisInput extends ApiInputAnswerContext {
  analysis: ApiInputAnswerAnalysis;
}
