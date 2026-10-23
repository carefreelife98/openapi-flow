import type { ApiLiteralGenerationInput } from './api-literal-generation.js';
import type {
  ApiArgumentValues,
  ApiArgumentProposal,
} from './api-arguments.js';
import type {
  ApiInputAnswerAnalysis,
  ValidateApiInputAnswerAnalysisInput,
} from './api-input-answer-extraction.js';
import type { ApiLiteralProposalSource } from './api-input-literal-source.js';
import type { ApiInputRequirement } from './api-clarification.js';

export interface ApiArgumentEnumRequirementsInput extends ApiArgumentEnumContextInput {
  requirements: ApiInputRequirement[];
  values: ApiArgumentValues;
}

export interface ApiArgumentEnumContextInput extends ApiLiteralGenerationInput {
  /** Original literal proposal, before confirmed inputs or semantic OAS values are merged. */
  proposal: ApiArgumentProposal;
  literalSources: ApiLiteralProposalSource[];
  requestedInputs?: string[];
}

export interface ResolveApiArgumentEnumInterpretationInput extends ApiArgumentEnumContextInput {
  analysis: ApiInputAnswerAnalysis;
}

export interface ApiArgumentEnumResolution {
  values: ApiArgumentValues;
  unresolvedInputs: string[];
  interpretation: ValidateApiInputAnswerAnalysisInput;
}
