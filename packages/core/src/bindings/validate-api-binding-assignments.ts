import type { ValidateApiBindingAssignmentsInput } from '../types/api-bindings.js';
import { createApiBindingSourceRegistry } from './create-api-binding-source-registry.js';
import { validateRegisteredApiCallBindings } from './validate-registered-api-call-bindings.js';
import { OpenApiFlowError } from '../errors/openapi-flow-error.js';
import { runOpenApiFlowOperation } from '../errors/run-openapi-flow-operation.js';

export function validateApiBindingAssignments(
  input: ValidateApiBindingAssignmentsInput,
): void {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'validateApiBindingAssignments',
      stage: 'contract-validation',
      code: 'API_BINDING_VALIDATION_FAILED',
    },
    () => validateApiBindingAssignmentsContract(input),
  );
}

function validateApiBindingAssignmentsContract({
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
    throw new OpenApiFlowError({
      message: 'binding plan must name every material callId exactly once',
      diagnostic: {
        owner: 'core',
        operation: 'validateApiBindingAssignments',
        stage: 'contract-validation',
        code: 'API_BINDING_CALL_COVERAGE_MISMATCH',
        expectedCount: materials.length,
        actualCount: calls.length,
        distinctCount: new Set(calls.map((call) => call.callId)).size,
      },
    });
  const dependencies = new Map<string, string[]>();
  for (const call of calls) {
    validateRegisteredApiCallBindings({
      ...call,
      registry,
      operation: 'validateApiBindingAssignments',
    });
    dependencies.set(
      call.callId,
      call.bindings.map((binding) => binding.sourceNodeId),
    );
  }
  const pending = new Set(byId.keys());
  while (pending.size) {
    const ready = [...pending].filter((id) =>
      dependencies.get(id)!.every((source) => !pending.has(source)),
    );
    if (!ready.length)
      throw new OpenApiFlowError({
        message: 'binding dependencies have a cycle',
        diagnostic: {
          owner: 'core',
          operation: 'validateApiBindingAssignments',
          stage: 'contract-validation',
          code: 'API_BINDING_CYCLE',
        },
      });
    for (const id of ready) pending.delete(id);
  }
}
