import type { ValidateRegisteredApiCallBindingsInput } from '../types/binding-validation-internal.js';
import { validateRegisteredApiBinding } from './validate-registered-api-binding.js';
import { OpenApiFlowError } from '../errors/openapi-flow-error.js';

/** Local assignment invariants shared by whole-plan and independently planned calls. */
export function validateRegisteredApiCallBindings({
  callId,
  bindings,
  registry,
  operation,
}: ValidateRegisteredApiCallBindingsInput): void {
  if (!registry.api.has(callId))
    throw new Error(`bindings: unknown target callId ${callId}`);
  const pointers: string[] = [];
  for (const binding of bindings) {
    validateRegisteredApiBinding({ callId, binding, registry });
    if (
      pointers.some(
        (pointer) =>
          pointer === binding.targetPointer ||
          pointer.startsWith(binding.targetPointer + '/') ||
          binding.targetPointer.startsWith(pointer + '/'),
      )
    )
      throw new OpenApiFlowError({
        message: `bindings overlap at ${callId}${binding.targetPointer}`,
        diagnostic: {
          owner: 'core',
          operation,
          stage: 'contract-validation',
          code: 'API_BINDING_TARGET_OVERLAP',
        },
      });
    pointers.push(binding.targetPointer);
  }
}
