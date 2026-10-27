import type { ApiCallArguments } from '../../../types/api-arguments.js';
import type { WorkflowConnectionArgumentValues } from '../../../types/workflow-connection-material-repair.js';

/** Project declared execution values only; audit records are not value sources or model instructions. */
export function selectWorkflowConnectionArgumentValues(
  input: ApiCallArguments,
): WorkflowConnectionArgumentValues {
  return structuredClone({
    values: input.values,
    bindings: input.bindings,
    unresolvedInputs: input.unresolvedInputs,
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
    ...(input.requestedInputs === undefined
      ? {}
      : { requestedInputs: input.requestedInputs }),
  });
}
