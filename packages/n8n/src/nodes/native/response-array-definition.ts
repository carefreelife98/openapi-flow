import type { NativeMaterialFeatureDefinition } from '../../types/native-material-binding.js';
import {
  responseArrayParametersSchema,
  createResponseArrayPlanningParametersSchema,
} from '../../schemas/response-array-schema.js';

export const responseArrayDefinition: NativeMaterialFeatureDefinition = {
  name: 'split-api-response-array',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  description:
    'Split a declared OAS response array into one unchanged JSON item per element using n8n Split Out. Output is {item: element}. Downstream bound requests must use linked item mode. An empty array creates no downstream items.',
  parametersSchema: responseArrayParametersSchema,
  createPlanningParametersSchema: createResponseArrayPlanningParametersSchema,
  parameterReferenceSources: ['response'],
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  referenceStructureSchema: responseArrayParametersSchema,
  parameterReferenceBindings: (values) => {
    const parameters = responseArrayParametersSchema.parse(values);
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
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};
