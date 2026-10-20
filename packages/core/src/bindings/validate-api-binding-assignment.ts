import type { ValidateApiBindingAssignmentInput } from '../types/api-bindings.js';
import { createApiBindingSourceRegistry } from './create-api-binding-source-registry.js';
import { validateRegisteredApiBinding } from './validate-registered-api-binding.js';

/** Validate an actual assignment without fabricating empty bindings for unrelated calls. */
export function validateApiBindingAssignment(
  input: ValidateApiBindingAssignmentInput,
): void {
  validateRegisteredApiBinding({
    ...input,
    registry: createApiBindingSourceRegistry(input),
  });
}
