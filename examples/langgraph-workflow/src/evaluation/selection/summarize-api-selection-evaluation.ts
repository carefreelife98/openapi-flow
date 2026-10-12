import type {
  EvaluationFraction,
  SelectionEvaluationAttempt,
  SelectionEvaluationSummary,
} from '../../types/api-selection-evaluation.js';

function fraction(numerator: number, denominator: number): EvaluationFraction {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

export function summarizeApiSelectionEvaluation(
  attempts: SelectionEvaluationAttempt[],
): SelectionEvaluationSummary {
  const proposals = attempts.filter((attempt) => attempt.model.calls > 0);
  const responses = attempts.flatMap((attempt) => attempt.model.responses);
  const measured = responses.filter((response) => response.usage !== null);
  const accepted = attempts.filter(
    (attempt) => attempt.status === 'accepted',
  ).length;
  return {
    attempted: attempts.length,
    accepted,
    rejected: attempts.length - accepted,
    exactMatch: fraction(
      attempts.filter((attempt) => attempt.score.exact).length,
      attempts.length,
    ),
    firstProposalValidity: fraction(
      proposals.filter((attempt) => attempt.status === 'accepted').length,
      proposals.length,
    ),
    apiPrecision: fraction(
      attempts.reduce((n, attempt) => n + attempt.score.matched, 0),
      attempts.reduce((n, attempt) => n + attempt.score.selected, 0),
    ),
    apiRecall: fraction(
      attempts.reduce((n, attempt) => n + attempt.score.matched, 0),
      attempts.reduce((n, attempt) => n + attempt.score.expected, 0),
    ),
    gapDetection: fraction(
      attempts.filter((attempt) => attempt.score.gapDetectionCorrect).length,
      attempts.length,
    ),
    averageDurationMs:
      attempts.length === 0
        ? null
        : attempts.reduce((n, attempt) => n + attempt.durationMs, 0) /
          attempts.length,
    measuredModelResponses: measured.length,
    tokenUsage:
      responses.length === 0 ||
      measured.length !== responses.length ||
      proposals.some((attempt) => attempt.model.responses.length === 0)
        ? null
        : measured.reduce(
            (total, response) => {
              if (response.usage === null)
                throw new Error('measured response has no usage');
              return {
                input_tokens: total.input_tokens + response.usage.input_tokens,
                output_tokens:
                  total.output_tokens + response.usage.output_tokens,
                total_tokens: total.total_tokens + response.usage.total_tokens,
              };
            },
            { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          ),
  };
}
