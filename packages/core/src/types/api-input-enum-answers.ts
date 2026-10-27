import type {
  ApiInputAnswerContext,
  ApiInputAnswerSource,
  ApiInputAnswerSourceLocation,
  ResolvedApiInputAnswerSources,
} from './api-input-answer-extraction.js';
import type { ApiInputEnumCandidate } from './api-input-enum.js';
import type { ApiInputMessageLiteralSource } from './api-input-literal-source.js';

export interface ApiInputEnumAnswerChoice {
  requirementId: string;
  candidates: ApiInputEnumCandidate[];
}

/** Intent is a human quotation, not the value copied from the OAS. */
export interface ApiInputEnumAnswerSelection {
  requirementId: string;
  candidateId: string;
  intent: ApiInputMessageLiteralSource;
  reason: string;
}

export interface VerifiedApiInputEnumAnswerSelection extends ApiInputEnumAnswerSelection {
  candidate: ApiInputEnumCandidate;
  occurrences: ApiInputAnswerSourceLocation[];
}

export interface ResolveApiInputAnswerInterpretationsInput extends ApiInputAnswerContext {
  selections: ApiInputAnswerSource[];
  enumSelections?: ApiInputEnumAnswerSelection[];
}

export interface ResolvedApiInputAnswerInterpretations extends ResolvedApiInputAnswerSources {
  enumSelections?: VerifiedApiInputEnumAnswerSelection[];
}
