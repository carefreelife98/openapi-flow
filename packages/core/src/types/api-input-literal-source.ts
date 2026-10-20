import type { JsonValue } from './api-arguments.js';
import type { ApiInputAnswerSourceLocation } from './api-input-answer-extraction.js';

export interface ApiInputLiteralSource {
  sourceFormat: 'text' | 'json';
  sourceText: string;
}
export interface ReadApiInputLiteralSourceInput extends ApiInputLiteralSource {
  text: string;
  label: string;
}
export interface ReadApiInputLiteralSourceResult {
  value: JsonValue;
  occurrences: ApiInputAnswerSourceLocation[];
}

export interface VerifyApiInputLiteralSourceInput extends ReadApiInputLiteralSourceInput {
  value: JsonValue;
}
