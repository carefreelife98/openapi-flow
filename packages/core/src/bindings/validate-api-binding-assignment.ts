import type { ValidateApiBindingAssignmentInput } from '../types/api-bindings.js';
import { createApiBindingSourceRegistry } from './create-api-binding-source-registry.js';
import { validateRegisteredApiBinding } from './validate-registered-api-binding.js';
import { runOpenApiFlowOperation } from '../errors/run-openapi-flow-operation.js';

/** Validate an actual assignment without fabricating empty bindings for unrelated calls. */
export function validateApiBindingAssignment(
  input: ValidateApiBindingAssignmentInput,
): void {
  runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateApiBindingAssignment',
      stage: 'contract-validation',
      code: 'API_BINDING_VALIDATION_FAILED',
    },
    () =>
      validateRegisteredApiBinding({
        ...input,
        registry: createApiBindingSourceRegistry(input),
      }),
  );
}
