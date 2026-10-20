import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { itemJoinParametersSchema } from '../../../schemas/item-join-schema.js';

export const itemJoinDefinition: NativeMaterialFeatureDefinition = {
  name: 'join-api-items',
  materialRequirements: [
    { field: 'apiMaterials', minimumItems: 2 },
    { field: 'nativeOutputs', minimumItems: 1 },
  ],
  description:
    'Join API branches by their shared native scope item ancestry. Each participating item requires exactly one full OAS-valid response per API. Different orders and duplicate JSON values are safe. Missing/duplicate branch responses fail; no business-ID matching, index zip, Cartesian product or value conversion. Output {responses: {callId: unchangedBody}}.',
  parametersSchema: itemJoinParametersSchema,
  parameterReferenceSources: ['response', 'node-output'],
  inputPorts: (values) =>
    Array.from(
      { length: itemJoinParametersSchema.parse(values).sourceCallIds.length },
      (_, index) => `input${index + 1}`,
    ),
  outputPorts: () => ['main'],
  referenceStructureSchema: itemJoinParametersSchema,
  parameterReferenceBindings: (values) => {
    const parameters = itemJoinParametersSchema.parse(values);
    return [
      ...parameters.sourceCallIds.map((nodeId, index) => ({
        nodeIdPointer: `/sourceCallIds/${index}`,
        reference: { source: 'response' as const, nodeId, pointer: '' },
      })),
      {
        nodeIdPointer: '/scopeNodeId',
        reference: {
          source: 'node-output',
          nodeId: parameters.scopeNodeId,
          pointer: '',
        },
      },
    ];
  },
  waitsForAllInputs: true,
  exclusiveOutputPorts: false,
};
