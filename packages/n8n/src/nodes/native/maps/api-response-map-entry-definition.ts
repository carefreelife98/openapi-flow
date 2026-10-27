import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import {
  apiResponseMapEntryParametersSchema,
  apiResponseMapEntryStructureSchema,
  createApiResponseMapEntryPlanningParametersSchema,
} from '../../../schemas/api-response-map-entry-schema.js';

export const apiResponseMapEntryDefinition: NativeMaterialFeatureDefinition = {
  name: 'select-api-response-map-entry',
  description:
    'Select one exact key from an OAS response object/map, preserving its unchanged value and key as {key,value}. Missing keys fail; no first-entry, empty-array or alternative-field fallback. Select a group map entry before splitting its value array with split-native-output-array. Requires the group/key as a literal or explicit runtime input, never guessed.',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  parametersSchema: apiResponseMapEntryParametersSchema,
  createPlanningParametersSchema:
    createApiResponseMapEntryPlanningParametersSchema,
  parameterReferenceSources: ['response'],
  supportsRuntimeParameters: true,
  referenceStructureSchema: apiResponseMapEntryStructureSchema,
  parameterReferenceBindings: (values) => {
    const parameters = apiResponseMapEntryStructureSchema.parse(values);
    return [
      {
        nodeIdPointer: '/sourceNodeId',
        valuePointer: '/pointer',
        reference: {
          source: 'response',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      },
    ];
  },
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};
