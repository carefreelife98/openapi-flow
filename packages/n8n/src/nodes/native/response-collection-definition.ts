import type { NativeMaterialFeatureDefinition } from '../../types/native-material-binding.js';
import {
  responseCollectionParametersSchema,
  createResponseCollectionParametersSchema,
} from '../../schemas/response-collection-schema.js';

export const responseCollectionDefinition: NativeMaterialFeatureDefinition = {
  name: 'collect-api-responses',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  description:
    'Collect unchanged item-linked API response values from one incoming stream into {items: values} using n8n Aggregate. Validates each full OAS response first. Preserves null, nested arrays, duplicates and received order. Not a branch join. Empty streams do not trigger this node or create an artificial result.',
  parametersSchema: responseCollectionParametersSchema,
  createPlanningParametersSchema: ({ apiCallIds }) =>
    createResponseCollectionParametersSchema(apiCallIds),
  parameterReferenceSources: ['response'],
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  referenceStructureSchema: responseCollectionParametersSchema,
  parameterReferenceBindings: (values) => {
    const parameters = responseCollectionParametersSchema.parse(values);
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
