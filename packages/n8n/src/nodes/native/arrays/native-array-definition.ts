import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { nativeArrayParametersSchema } from '../../../schemas/native-array-schema.js';

export const nativeArrayDefinition: NativeMaterialFeatureDefinition = {
  name: 'split-native-output-array',
  materialRequirements: [{ field: 'nativeOutputs', minimumItems: 1 }],
  description:
    'Split a supplied native JSON output array into {item: unchangedElement} using official n8n Split Out. Validate the full native output schema first. Linked mode preserves parent ancestry across nested splits. Empty arrays emit no child items; never convert, flatten or fabricate values.',
  parametersSchema: nativeArrayParametersSchema,
  parameterReferenceSources: ['node-output'],
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  referenceStructureSchema: nativeArrayParametersSchema,
  parameterReferenceBindings: (values) => {
    const parameters = nativeArrayParametersSchema.parse(values);
    return [
      {
        nodeIdPointer: '/sourceNodeId',
        valuePointer: '/pointer',
        reference: {
          source: 'node-output',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      },
    ];
  },
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};
