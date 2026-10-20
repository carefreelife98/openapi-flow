import { z } from 'zod';
import type { WorkflowCapability } from '../../types/workflow-plan.js';
import type { NativePlanningCapabilityMaterial } from '../../types/native-node-planning.js';
import { nativeMaterialRequirementsSchema } from '../../schemas/native-material-requirements-schema.js';
import { nativeParameterReferenceSourcesSchema } from '../../schemas/native-parameter-reference-sources-schema.js';

/** Serializable generation contract only; executable implementations remain host supplied. */
export function createNativePlanningCapabilityMaterial(
  capability: WorkflowCapability,
  allowRuntimeParameters: boolean,
  allowFieldOwnership = false,
): NativePlanningCapabilityMaterial {
  if (typeof capability.name !== 'string' || !capability.name.trim())
    throw new Error('native planning capability.name must be non-empty');
  if (typeof capability.description !== 'string')
    throw new Error(
      `native planning capability ${capability.name}.description must be a string`,
    );
  if (
    !capability.parametersSchema ||
    typeof capability.parametersSchema.safeParse !== 'function'
  )
    throw new Error(
      `native planning capability ${capability.name}.parametersSchema must be a Zod schema`,
    );
  for (const field of [
    'inputPorts',
    'outputPorts',
    'responseReferences',
  ] as const)
    if (typeof capability[field] !== 'function')
      throw new Error(
        `native planning capability ${capability.name}.${field} must be a function`,
      );
  for (const field of ['waitsForAllInputs', 'exclusiveOutputPorts'] as const)
    if (typeof capability[field] !== 'boolean')
      throw new Error(
        `native planning capability ${capability.name}.${field} must be a boolean`,
      );
  return {
    name: capability.name,
    description: capability.description,
    parametersSchema: z.toJSONSchema(capability.parametersSchema),
    ...(capability.parameterReferenceSources === undefined
      ? {}
      : {
          parameterReferenceSources:
            nativeParameterReferenceSourcesSchema.parse(
              capability.parameterReferenceSources,
            ),
        }),
    ...(capability.materialRequirements === undefined
      ? {}
      : {
          materialRequirements: nativeMaterialRequirementsSchema.parse(
            capability.materialRequirements,
          ),
        }),
    ...(capability.materialSources === undefined
      ? {}
      : { materialSources: structuredClone(capability.materialSources) }),
    parameterSources:
      allowRuntimeParameters && capability.supportsRuntimeParameters === true
        ? allowFieldOwnership
          ? ['literal', 'workflow-input', 'workflow-fields']
          : ['literal', 'workflow-input']
        : ['literal'],
  };
}
