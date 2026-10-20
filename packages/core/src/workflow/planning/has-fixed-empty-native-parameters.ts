import type { BindingSchema } from '../../types/api-bindings.js';
import { z } from 'zod';
import type { WorkflowCapability } from '../../types/workflow-plan.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** Prove the single value using the explicit closed empty object contract, then the full original validator. */
export function hasFixedEmptyNativeParameters(
  schema: BindingSchema,
  capability: WorkflowCapability,
): boolean {
  if (
    !(capability.parametersSchema instanceof z.ZodObject) ||
    Object.keys(capability.parametersSchema.shape).length
  )
    return false;
  if (
    typeof schema === 'boolean' ||
    schema.type !== 'object' ||
    schema.additionalProperties !== false ||
    !schema.properties ||
    typeof schema.properties !== 'object' ||
    Array.isArray(schema.properties) ||
    Object.keys(schema.properties).length
  )
    return false;
  if (
    schema.patternProperties !== undefined &&
    (schema.patternProperties === null ||
      typeof schema.patternProperties !== 'object' ||
      Array.isArray(schema.patternProperties) ||
      Object.keys(schema.patternProperties).length)
  )
    return false;
  const checked = capability.parametersSchema.safeParse({});
  return checked.success && jsonValuesEqual(checked.data, {});
}
