import type {
  ApiInputAnswerContext,
  ApiInputAnswerAnalysis,
} from './api-input-answer-extraction.js';
import type { ApiInputAnswer } from './api-clarification.js';

/** One actual user reply; formatted or joined multi-message contexts are not quote sources. */
export type ApiValueAnswerContext = Omit<
  ApiInputAnswerContext,
  'sourceMessages'
>;
export interface ApiValueAnswerProposal {
  answers: ApiInputAnswer[];
}
export interface ResolveApiValueAnswersInput extends ApiValueAnswerContext {
  proposal: ApiValueAnswerProposal;
}
export type ApiValueAnswerAnalysis = ApiInputAnswerAnalysis;
