import type { JsonObject } from '../types/openapi.js';
import type { WorkflowInputs } from '../types/request-workflow.js';
import { isObject } from '../utils/is-object.js';

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
