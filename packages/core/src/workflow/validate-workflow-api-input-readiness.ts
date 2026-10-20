import type { DeferredApiInputSlot } from '../types/deferred-api-inputs.js';
import type { WorkflowApiInputReadinessInput } from '../types/workflow-api-input-readiness.js';
import { collectDeferredApiInputSlots } from '../inputs/collect-deferred-api-input-slots.js';
import { workflowDeferredApiInputIdsSchema } from '../schemas/workflow-api-input-deferral-schema.js';

/** Missing literals may be planned, but only with explicit, current slot ownership. */
export function validateWorkflowApiInputReadiness(
  input: WorkflowApiInputReadinessInput,
): DeferredApiInputSlot[] {
  const ids =
    input.deferredApiInputIds === undefined
      ? []
      : workflowDeferredApiInputIdsSchema.parse(input.deferredApiInputIds);
  const ready = input.materials.filter(
    (material) => material.status === 'ready',
  );
  // This validates supplied values against their original OAS before deriving missing slots.
  const slots = collectDeferredApiInputSlots({
    materials: ready.map((material) => ({
      operation: material.operation,
      callId: material.arguments.callId,
      values: material.arguments.values,
      bindings: material.arguments.bindings,
      requestMediaType: material.arguments.requestMediaType,
      requestedInputs: material.arguments.requestedInputs,
    })),
  });
  for (const id of ids)
    if (!slots.some((slot) => slot.id === id))
      throw new Error(
        `deferredApiInputIds contains unknown or stale slot ${id}`,
      );
  for (const slot of slots)
    if (!ids.includes(slot.id))
      throw new Error(
        `materials[${slot.callId}] has unresolved OAS request inputs or scenario-requested inputs: ${slot.targetPointer}; explicitly defer current slot ${slot.id} or supply its value`,
      );
  for (const material of ready) {
    const args = material.arguments;
    if (
      new Set(args.unresolvedInputs).size !== args.unresolvedInputs.length ||
      args.unresolvedInputs.some(
        (pointer) =>
          !slots.some(
            (slot) =>
              slot.callId === args.callId && slot.targetPointer === pointer,
          ),
      )
    )
      throw new Error(
        `materials[${args.callId}].unresolvedInputs must name current OAS request input slots without duplicates`,
      );
  }
  return slots;
}
