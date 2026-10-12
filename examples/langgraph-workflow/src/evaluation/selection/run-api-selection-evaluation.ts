import { performance } from 'node:perf_hooks';
import { selectApiOperations } from '@openapi-flow/langchain';
import type { ApiSelection } from '@openapi-flow/core';
import type {
  RunSelectionEvaluationInput,
  SelectionEvaluationAttempt,
  SelectionEvaluationReport,
  SelectionEvaluationError,
} from '../../types/api-selection-evaluation.js';
import { scoreApiSelection } from './score-api-selection.js';
import { summarizeApiSelectionEvaluation } from './summarize-api-selection-evaluation.js';
import { selectionEvaluationError } from './selection-evaluation-error.js';

/** Each repetition is an independent first attempt. No retries, repairs or answer hints. */
export async function runApiSelectionEvaluation(
  input: RunSelectionEvaluationInput,
): Promise<SelectionEvaluationReport> {
  if (!input.modelLabel.trim())
    throw new Error('evaluation.modelLabel is required');
  const { dataset, operations, documents, datasetSha256 } = input.prepared;
  const attempts: SelectionEvaluationAttempt[] = [];
  input.observer.take();
  outer: for (
    let repetition = 1;
    repetition <= dataset.repeats;
    repetition += 1
  ) {
    for (const entry of dataset.cases) {
      const started = performance.now();
      let selection: ApiSelection | null = null;
      let error: SelectionEvaluationError | null = null;
      try {
        selection = await selectApiOperations({
          operations,
          scenario: entry.scenario,
          model: input.model,
        });
      } catch (cause) {
        error = selectionEvaluationError(cause);
      }
      const attempt: SelectionEvaluationAttempt = {
        caseId: entry.id,
        cohort: entry.cohort,
        repetition,
        status: error === null ? 'accepted' : 'rejected',
        durationMs: performance.now() - started,
        expectedOperations: entry.expectedOperations,
        expectedGap: entry.expectedGap,
        selection,
        score: scoreApiSelection(entry, selection),
        model: input.observer.take(),
        error,
      };
      attempts.push(attempt);
      await input.onAttempt?.(attempt);
      if (error?.interrupt) break outer;
    }
  }
  const planned = dataset.cases.length * dataset.repeats;
  return {
    version: 2,
    scope: 'api-selection-only',
    modelLabel: input.modelLabel,
    modelSettings: input.modelSettings ?? null,
    datasetSha256,
    documents,
    planned,
    complete: attempts.length === planned,
    unattempted: planned - attempts.length,
    attempts,
    summary: summarizeApiSelectionEvaluation(attempts),
    cohorts: {
      development: summarizeApiSelectionEvaluation(
        attempts.filter((attempt) => attempt.cohort === 'development'),
      ),
      holdout: summarizeApiSelectionEvaluation(
        attempts.filter((attempt) => attempt.cohort === 'holdout'),
      ),
    },
  };
}
