import type {
  ApiInputAnswerContext,
  ApiInputAnswerSourceLocation,
} from './api-input-answer-extraction.js';

export interface ProtectedApiInputLiteral extends ApiInputAnswerSourceLocation {
  quoted: boolean;
}

export interface ApiInputJsonSourceCandidate extends ApiInputAnswerSourceLocation {
  id: string;
  text: string;
}

export interface ApiInputTextSourceToken extends ApiInputAnswerSourceLocation {
  id: string;
  text: string;
}

export interface ApiInputTextSourceSegment {
  id: string;
  tokens: ApiInputTextSourceToken[];
}

export interface ApiInputSourceCatalog {
  json: ApiInputJsonSourceCandidate[];
  text: ApiInputTextSourceSegment[];
}

export interface ApiInputJsonSourceSelection {
  kind: 'json';
  candidateId: string;
}

export interface ApiInputTextSourceSelection {
  kind: 'text';
  startTokenId: string;
  endTokenId: string;
}

export interface ApiInputAnswerSourceSelection {
  requirementId: string;
  source: ApiInputJsonSourceSelection | ApiInputTextSourceSelection;
}

export interface ResolveApiInputSourceSelectionsInput extends ApiInputAnswerContext {
  selections: ApiInputAnswerSourceSelection[];
}
