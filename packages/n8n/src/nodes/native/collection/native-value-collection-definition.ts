import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { nativeValueCollectionParametersSchema } from '../../../schemas/native-value-collection-schema.js';

export const nativeValueCollectionDefinition: NativeMaterialFeatureDefinition =
  {
    name: 'collect-native-output-values',
    description:
      'Official n8n Aggregate: collect unchanged values from ONE actual native JSON producer across all items in the current incoming stream into {items: values}. Can collect rows created by field projection or an item join. Choose only the exact producer and its RFC 6901 pointer; code derives value types and validates each complete original output. Preserves null, false, zeros, nested arrays, duplicates and received order. This reduces the current stream, not per-parent grouping, pagination, deduplication, a join of independent branches or a classification rule. Empty streams do not trigger this node and produce no artificial empty result. A later REST call can bind the items array without conversion.',
    materialRequirements: [{ field: 'nativeOutputs', minimumItems: 1 }],
    parametersSchema: nativeValueCollectionParametersSchema,
    referenceStructureSchema: nativeValueCollectionParametersSchema,
    parameterReferenceSources: ['node-output'],
    parameterReferenceBindings: (value) => {
      const parameters = nativeValueCollectionParametersSchema.parse(value);
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
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
