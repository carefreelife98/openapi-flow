import type { WorkflowCapability } from '../../types/workflow-plan.js';
import { createNativePlanningCapabilityMaterial } from './create-native-planning-capability-material.js';

/** Capture the declared protocol, including prototype methods, without cloning opaque schema/closure state. */
export function captureNativePlanningCapability(
  capability: WorkflowCapability,
): WorkflowCapability {
  if (!capability || typeof capability !== 'object')
    throw new Error(
      'native planning capabilities must contain implementation objects',
    );
  createNativePlanningCapabilityMaterial(capability, false);
  for (const field of [
    'createPlanningParametersSchema',
    'parametersFromProducerDependencies',
    'nodeOutputReferences',
    'parameterReferenceBindings',
    'bindMaterialContracts',
    'inputReferences',
    'rejoinsExclusiveOutputs',
    'outputSchema',
  ] as const)
    if (
      capability[field] !== undefined &&
      typeof capability[field] !== 'function'
    )
      throw new Error(
        `native planning capability ${capability.name}.${field} must be a function`,
      );
  return {
    name: capability.name,
    description: capability.description,
    parametersSchema: capability.parametersSchema,
    ...(capability.parameterReferenceSources === undefined
      ? {}
      : {
          parameterReferenceSources: structuredClone(
            capability.parameterReferenceSources,
          ),
        }),
    inputPorts: capability.inputPorts.bind(capability),
    outputPorts: capability.outputPorts.bind(capability),
    responseReferences: capability.responseReferences.bind(capability),
    waitsForAllInputs: capability.waitsForAllInputs,
    exclusiveOutputPorts: capability.exclusiveOutputPorts,
    ...(capability.supportsRuntimeParameters === undefined
      ? {}
      : { supportsRuntimeParameters: capability.supportsRuntimeParameters }),
    ...(capability.createPlanningParametersSchema === undefined
      ? {}
      : {
          createPlanningParametersSchema:
            capability.createPlanningParametersSchema.bind(capability),
        }),
    ...(capability.nodeOutputReferences === undefined
      ? {}
      : {
          nodeOutputReferences:
            capability.nodeOutputReferences.bind(capability),
        }),
    ...(capability.parametersFromProducerDependencies === undefined
      ? {}
      : {
          parametersFromProducerDependencies:
            capability.parametersFromProducerDependencies.bind(capability),
        }),
    ...(capability.parameterReferenceBindings === undefined
      ? {}
      : {
          parameterReferenceBindings:
            capability.parameterReferenceBindings.bind(capability),
        }),
    ...(capability.referenceStructureSchema === undefined
      ? {}
      : { referenceStructureSchema: capability.referenceStructureSchema }),
    ...(capability.materialSources === undefined
      ? {}
      : { materialSources: structuredClone(capability.materialSources) }),
    ...(capability.materialRequirements === undefined
      ? {}
      : {
          materialRequirements: structuredClone(
            capability.materialRequirements,
          ),
        }),
    ...(capability.bindMaterialContracts === undefined
      ? {}
      : {
          bindMaterialContracts:
            capability.bindMaterialContracts.bind(capability),
        }),
    ...(capability.inputReferences === undefined
      ? {}
      : { inputReferences: capability.inputReferences.bind(capability) }),
    ...(capability.rejoinsExclusiveOutputs === undefined
      ? {}
      : {
          rejoinsExclusiveOutputs:
            capability.rejoinsExclusiveOutputs.bind(capability),
        }),
    ...(capability.outputSchema === undefined
      ? {}
      : { outputSchema: capability.outputSchema.bind(capability) }),
  };
}
