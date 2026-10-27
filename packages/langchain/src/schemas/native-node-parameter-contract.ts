import { z } from 'zod';
import { createNativePlanningCapabilityMaterial } from '@openapi-flow/core';
import type { WorkflowCapability } from '@openapi-flow/core';
import type {
  NativeNodeParameterContract,
  NativeNodeModelInstance,
} from '../types/native-node-planning.js';

export function createNativeNodeParameterContract(
  capability: WorkflowCapability,
  allowRuntimeParameters: boolean,
): NativeNodeParameterContract {
  const identity = {
    id: z
      .string()
      .min(1)
      .describe(
        'Unique native instance ID, distinct from every supplied API, prepared native and gap ID.',
      ),
    capability: z.literal(capability.name).describe(capability.description),
  };
  const schemas: z.ZodType<NativeNodeModelInstance>[] = [];
  const material = createNativePlanningCapabilityMaterial(
    capability,
    allowRuntimeParameters,
  );
  if (material.hasProvablyEmptyParameters) return { schemas: [], material };
  if (allowRuntimeParameters && capability.supportsRuntimeParameters === true) {
    schemas.push(
      z.strictObject({
        ...identity,
        parameterSource: z
          .literal('literal')
          .describe(
            'Choose only actual values supplied in the scenario, never placeholders or invented defaults.',
          ),
        parameters: capability.parametersSchema,
      }),
      z.strictObject({
        ...identity,
        parameterSource: z
          .literal('workflow-input')
          .describe(
            'Choose when actual complete parameter values must be supplied at execution and this capability has runtime-independent ports, references and output schema. Never generate any parameters, placeholders or runtime flags here. Code derives the empty parameter object, runtime flag, slot ID and original schema.',
          ),
      }),
    );
  } else
    schemas.push(
      z.strictObject({ ...identity, parameters: capability.parametersSchema }),
    );
  return { schemas, material };
}
