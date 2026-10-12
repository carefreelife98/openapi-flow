import type { ApiSelection } from '@openapi-flow/core';
import type {
  ApiSelectionEvaluationCase,
  EvaluationOperation,
  SelectionEvaluationScore,
} from '../../types/api-selection-evaluation.js';

export function evaluationOperationIdentity(
  operation: EvaluationOperation,
): string {
  return JSON.stringify([operation.documentId, operation.operationRef]);
}

/** Order is not execution order. Count distinct call instances, including repeated APIs. */
export function scoreApiSelection(
  entry: ApiSelectionEvaluationCase,
  selection: ApiSelection | null,
): SelectionEvaluationScore {
  const remaining = new Map<string, number>();
  for (const operation of entry.expectedOperations) {
    const key = evaluationOperationIdentity(operation);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  let matched = 0;
  for (const operation of selection?.operations ?? []) {
    const key = evaluationOperationIdentity(operation.key);
    const count = remaining.get(key);
    if (count !== undefined && count > 0) {
      matched += 1;
      remaining.set(key, count - 1);
    }
  }
  const selected = selection?.operations.length ?? 0;
  const expected = entry.expectedOperations.length;
  const exactOperations =
    selection !== null && matched === selected && matched === expected;
  const gapDetectionCorrect =
    selection !== null && selection.gaps.length > 0 === entry.expectedGap;
  return {
    matched,
    selected,
    expected,
    exactOperations,
    gapDetectionCorrect,
    exact: exactOperations && gapDetectionCorrect,
  };
}
