import type {
  CollectDeferredApiInputSlotsInput,
  DeferredApiInputSlot,
} from '../types/deferred-api-inputs.js';
import { inspectApiArgumentRequirements } from '../arguments/clarification/inspect-api-argument-requirements.js';
import { apiOperationKeySchema } from '../schemas/api-operation-key-schema.js';

/** Derive slots from the original OAS and current literal/binding ownership. */
export function collectDeferredApiInputSlots(
  input: CollectDeferredApiInputSlotsInput,
): DeferredApiInputSlot[] {
  if (!Array.isArray(input.materials))
    throw new Error('collectDeferredApiInputSlots.materials must be an array');
  const ids = new Set<string>();
  return input.materials.flatMap((material) => {
    if (
      typeof material.callId !== 'string' ||
      !material.callId.trim() ||
      ids.has(material.callId)
    )
      throw new Error('Input materials require distinct non-empty callIds');
    ids.add(material.callId);
    apiOperationKeySchema.parse(material.operation.key);
    return inspectApiArgumentRequirements(material).requirements.map(
      (requirement): DeferredApiInputSlot => ({
        kind: 'api-request-input',
        state: 'deferred',
        id: `input:${requirement.id}`,
        callId: requirement.callId,
        operation: requirement.operation,
        targetPointer: requirement.targetPointer,
        ...(requirement.requestedInputs === undefined
          ? {}
          : { requestedInputs: requirement.requestedInputs }),
        schema: requirement.schema,
        openapiVersion: requirement.openapiVersion,
        ...(requirement.operationSummary !== undefined
          ? { operationSummary: requirement.operationSummary }
          : {}),
        ...(requirement.parameterDescription !== undefined
          ? { parameterDescription: requirement.parameterDescription }
          : {}),
      }),
    );
  });
}
