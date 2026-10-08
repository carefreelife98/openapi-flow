import type { JsonValueObject } from '../types/api-arguments.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
} from '../types/workflow-plan.js';
import { jsonValuesEqual } from '../utils/json-values-equal.js';

export function parseNativeNodeParameters(
  planned: PlannedNativeNode,
  capability: WorkflowCapability,
): JsonValueObject {
  const parameters = capability.parametersSchema.parse(planned.parameters);
  if (!jsonValuesEqual(parameters, planned.parameters))
    throw new Error(
      `node ${planned.id}: parameter schema must validate without defaults, coercion or transformation`,
    );
  return parameters;
}
