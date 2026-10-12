import type { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiSelection, ApiOperationCandidate } from '@openapi-flow/core';
import type {
  apiSelectionEvaluationDatasetSchema,
  evaluationOperationSchema,
  evaluationTokenUsageSchema,
} from '../schemas/api-selection-evaluation-schema.js';
import type { SelectionEvaluationObserver } from '../evaluation/selection/selection-evaluation-observer.js';

export type ApiSelectionEvaluationDataset = z.infer<
  typeof apiSelectionEvaluationDatasetSchema
>;
export type EvaluationOperation = z.infer<typeof evaluationOperationSchema>;
export type EvaluationTokenUsage = z.infer<typeof evaluationTokenUsageSchema>;
export type ApiSelectionEvaluationCase =
  ApiSelectionEvaluationDataset['cases'][number];

export interface PreparedSelectionEvaluation {
  dataset: ApiSelectionEvaluationDataset;
  datasetSha256: string;
  operations: ApiOperationCandidate[];
  documents: EvaluationDocument[];
}
export interface EvaluationDocument {
  id: string;
  sha256: string;
  operations: number;
}
export interface SelectionEvaluationScore {
  matched: number;
  selected: number;
  expected: number;
  exactOperations: boolean;
  gapDetectionCorrect: boolean;
  exact: boolean;
}
export interface EvaluationModelResponse {
  text: string;
  usage: EvaluationTokenUsage | null;
}
export interface EvaluationModelEvidence {
  calls: number;
  responses: EvaluationModelResponse[];
}
export interface SelectionEvaluationAttempt {
  caseId: string;
  cohort: ApiSelectionEvaluationCase['cohort'];
  repetition: number;
  status: 'accepted' | 'rejected';
  durationMs: number;
  expectedOperations: EvaluationOperation[];
  expectedGap: boolean;
  selection: ApiSelection | null;
  score: SelectionEvaluationScore;
  model: EvaluationModelEvidence;
  error: SelectionEvaluationError | null;
}
export interface SelectionEvaluationError {
  name: string;
  status: number | null;
  validationIssues: EvaluationValidationIssue[] | null;
  interrupt: boolean;
}
export interface EvaluationValidationIssue {
  path: string[];
  message: string;
}
export interface EvaluationFraction {
  numerator: number;
  denominator: number;
  value: number | null;
}
export interface SelectionEvaluationSummary {
  attempted: number;
  accepted: number;
  rejected: number;
  exactMatch: EvaluationFraction;
  firstProposalValidity: EvaluationFraction;
  apiPrecision: EvaluationFraction;
  apiRecall: EvaluationFraction;
  gapDetection: EvaluationFraction;
  averageDurationMs: number | null;
  measuredModelResponses: number;
  tokenUsage: EvaluationTokenUsage | null;
}
export interface SelectionEvaluationReport {
  version: 2;
  scope: 'api-selection-only';
  modelLabel: string;
  modelSettings: EvaluationModelSettings | null;
  datasetSha256: string;
  documents: EvaluationDocument[];
  planned: number;
  complete: boolean;
  unattempted: number;
  attempts: SelectionEvaluationAttempt[];
  summary: SelectionEvaluationSummary;
  cohorts: Record<
    ApiSelectionEvaluationCase['cohort'],
    SelectionEvaluationSummary
  >;
}
export interface RunSelectionEvaluationInput {
  prepared: PreparedSelectionEvaluation;
  model: BaseChatModel;
  modelLabel: string;
  modelSettings?: EvaluationModelSettings;
  observer: SelectionEvaluationObserver;
  onAttempt?: (attempt: SelectionEvaluationAttempt) => void | Promise<void>;
}

export interface EvaluationModelSettings {
  temperature: number | null;
  maxRetries: number;
  timeoutMs: number;
}
