import type { ApiCallArguments } from '../../../types/api-arguments.js';
import type { WorkflowConnectionArgumentValues } from '../../../types/workflow-connection-material-repair.js';
import { selectWorkflowConnectionArgumentValues } from './select-workflow-connection-argument-values.js';

/** Comparison only. Binding declarations are unordered; literal arrays retain their exact order. */
export function createComparableConnectionArgumentValues(
  input: ApiCallArguments,
): WorkflowConnectionArgumentValues {
  const values = selectWorkflowConnectionArgumentValues(input);
  return {
    ...values,
    bindings: [...values.bindings].sort((a, b) =>
      a.targetPointer.localeCompare(b.targetPointer),
    ),
    unresolvedInputs: [...values.unresolvedInputs].sort(),
    // Optional absence and an explicitly empty request list impose the same execution obligations.
    // This comparison does not rewrite either original argument record or its source fingerprint.
    requestedInputs:
      values.requestedInputs === undefined
        ? []
        : [...values.requestedInputs].sort(),
  };
}
