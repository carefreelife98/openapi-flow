import type { JsonValue } from './api-arguments.js';
import type { ApiInputAnswerSourceLocation } from './api-input-answer-extraction.js';
import type { ApiArgumentValues } from './api-arguments.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export interface ApiLiteralProposalSource extends ApiInputLiteralSource {
  targetPointer: string;
  messageId: string;
}

export interface VerifiedApiLiteralProposalSource extends ApiLiteralProposalSource {
  occurrences: ApiInputAnswerSourceLocation[];
}

export interface ResolveApiLiteralProposalSourcesInput {
  callId: string;
  values: ApiArgumentValues;
  sources: ApiLiteralProposalSource[];
  messages: WorkflowSourceMessage[];
}

export interface ApiInputLiteralSource {
  sourceFormat: 'text' | 'json';
  sourceText: string;
}
export interface ApiInputMessageReference {
  /** Present in code-resolved evidence when explicit original messages were supplied. */
  messageId?: string;
}
export interface ApiInputMessageLiteralSource
  extends ApiInputLiteralSource, ApiInputMessageReference {}
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
