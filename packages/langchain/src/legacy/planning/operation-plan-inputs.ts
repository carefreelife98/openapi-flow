import type { JsonObject } from '@openapi-flow/core/internal';
import type { WorkflowInputs } from '@openapi-flow/core/internal';
import { isObject } from '@openapi-flow/core/internal';

export function operationPlanInputs(plannedInputs: JsonObject): WorkflowInputs {
  const inputs: WorkflowInputs = {};
  for (const location of ['path', 'query', 'header', 'cookie'] as const) {
    const values = plannedInputs[location];
    if (values === undefined) continue;
    if (!isObject(values))
      throw new Error(
        `model operation plan inputs.${location} must be an object`,
      );
    for (const [name, value] of Object.entries(values)) {
      inputs[`${location}.${name}`] = value;
    }
  }
  if (Object.hasOwn(plannedInputs, 'body')) inputs.body = plannedInputs.body;
  return inputs;
}
