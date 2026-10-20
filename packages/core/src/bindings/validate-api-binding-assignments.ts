import type { ValidateApiBindingAssignmentsInput } from '../types/api-bindings.js';
import { createApiBindingSourceRegistry } from './create-api-binding-source-registry.js';
import { validateRegisteredApiBinding } from './validate-registered-api-binding.js';

export function validateApiBindingAssignments({
  calls,
  materials,
  nativeOutputs = [],
}: ValidateApiBindingAssignmentsInput): void {
  const registry = createApiBindingSourceRegistry({ materials, nativeOutputs });
  const byId = registry.api;
  if (
    calls.length !== materials.length ||
    new Set(calls.map((call) => call.callId)).size !== materials.length
  )
    throw new Error(
      'binding plan must name every material callId exactly once',
    );
  const dependencies = new Map<string, string[]>();
  for (const call of calls) {
    const target = byId.get(call.callId);
    if (!target)
      throw new Error(`bindings: unknown target callId ${call.callId}`);
    const pointers: string[] = [];
    dependencies.set(call.callId, []);
    for (const binding of call.bindings) {
      validateRegisteredApiBinding({ callId: call.callId, binding, registry });
      if (
        pointers.some(
          (pointer) =>
            pointer === binding.targetPointer ||
            pointer.startsWith(binding.targetPointer + '/') ||
            binding.targetPointer.startsWith(pointer + '/'),
        )
      )
        throw new Error(
          `bindings overlap at ${call.callId}${binding.targetPointer}`,
        );
      pointers.push(binding.targetPointer);
      dependencies.get(call.callId)!.push(binding.sourceNodeId);
    }
  }
  const pending = new Set(byId.keys());
  while (pending.size) {
    const ready = [...pending].filter((id) =>
      dependencies.get(id)!.every((source) => !pending.has(source)),
    );
    if (!ready.length) throw new Error('binding dependencies have a cycle');
    for (const id of ready) pending.delete(id);
  }
}
