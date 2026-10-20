import type { ResolveWorkflowDraftApiMaterialsInput } from '../types/workflow-draft.js';
import type { DeferredApiInputMaterial } from '../types/deferred-api-inputs.js';
import { apiOperationKeyEquals } from '../openapi/catalog/api-operation-key-equals.js';

/** Resolve content without fabricating canonical revision/approval metadata. */
export function resolveWorkflowDraftApiMaterials(
  input: ResolveWorkflowDraftApiMaterialsInput,
): DeferredApiInputMaterial[] {
  return input.content.apiCalls.map((call) => {
    const matches = input.context.operations.filter((operation) =>
      apiOperationKeyEquals(operation.key, call.operation),
    );
    if (matches.length !== 1)
      throw new Error(
        `Draft API ${call.id} requires exactly one original OAS contract for its operation and snapshot`,
      );
    return {
      operation: matches[0],
      callId: call.id,
      values: call.values,
      bindings: call.bindings,
      ...(call.requestedInputs === undefined
        ? {}
        : { requestedInputs: call.requestedInputs }),
      ...(call.requestMediaType === undefined
        ? {}
        : { requestMediaType: call.requestMediaType }),
    };
  });
}
