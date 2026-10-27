import type {
  ApiInputAnswerContext,
  ApiInputAnswerSourceLocation,
} from './api-input-answer-extraction.js';
import type { ApiInputMessageReference } from './api-input-literal-source.js';

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

export interface ApiInputMessageSourceCatalog {
  messageId: string;
  sources: ApiInputSourceCatalog;
}

export interface ApiInputJsonSourceSelection extends ApiInputMessageReference {
  kind: 'json';
  candidateId: string;
}

export interface ApiInputTextSourceSelection extends ApiInputMessageReference {
  kind: 'text';
  startTokenId: string;
  endTokenId: string;
}

export interface ApiInputAnswerSourceSelection {
  requirementId: string;
  source: ApiInputSourceSelection;
}

export type ApiInputSourceSelection =
  ApiInputJsonSourceSelection | ApiInputTextSourceSelection;

export interface ResolveApiInputSourceSelectionsInput extends ApiInputAnswerContext {
  selections: ApiInputAnswerSourceSelection[];
}
