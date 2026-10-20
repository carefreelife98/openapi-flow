import type { JsonValueObject } from '../types/api-arguments.js';
import type { WorkflowNativeReferenceBinding } from '../types/native-parameter-reference.js';
import { nativeReferenceBindingSchema } from '../schemas/native-reference-binding-schema.js';
import { pointerTokens, pointerValue } from '../bindings/json-pointer.js';

/** Physical location validation is independent of whether the producer contract is ready. */
export function validateNativeReferenceBindingLocations(
  nodeId: string,
  parameters: JsonValueObject,
  bindings: WorkflowNativeReferenceBinding[],
): void {
  nativeReferenceBindingSchema.array().parse(bindings);
  const signatures = new Set<string>();
  for (const binding of bindings) {
    if (
      !pointerTokens(binding.nodeIdPointer).length ||
      pointerValue(parameters, binding.nodeIdPointer) !==
        binding.reference.nodeId
    )
      throw new Error(
        `Native reference binding for ${nodeId} must locate its actual node ID value`,
      );
    if ('pointer' in binding.reference) {
      try {
        pointerTokens(binding.reference.pointer);
      } catch (cause) {
        throw new Error(
          `node ${nodeId}: invalid ${binding.reference.source} JSON pointer ${binding.reference.pointer} in reference binding ${binding.nodeIdPointer}`,
          { cause },
        );
      }
    }
    if (
      binding.valuePointer !== undefined &&
      (!pointerTokens(binding.valuePointer).length ||
        !('pointer' in binding.reference) ||
        pointerValue(parameters, binding.valuePointer) !==
          binding.reference.pointer)
    )
      throw new Error(
        `Native reference binding for ${nodeId} must locate its actual declared value pointer`,
      );
    const signature = JSON.stringify([
      binding.nodeIdPointer,
      binding.valuePointer,
      binding.reference,
    ]);
    if (signatures.has(signature))
      throw new Error(
        `Native reference bindings for ${nodeId} repeat an identical location`,
      );
    signatures.add(signature);
  }
}
