import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { nativeOutputObjectParametersSchema } from '../../../schemas/native-output-object-schema.js';

export const nativeOutputObjectDefinition: NativeMaterialFeatureDefinition = {
  name: 'compose-native-outputs',
  description:
    'Compose ONE named JSON object from unchanged fields of actual configured native JSON producers. Can include complete response bundles and check results as named fields. Code derives the exact output contract from each source. Input1..inputN correspond to distinct field sourceNodeIds in first-occurrence order; waits for every input. Requires exactly one item per source; ambiguous multiple items and missing fields fail. No calculations, merging fields, casting, fabricated values or API calls.',
  parametersSchema: nativeOutputObjectParametersSchema,
  parameterValuePolicy: {
    businessInputPaths: [],
    generatedTextPaths: ['/fields/*/name'],
  },
  referenceStructureSchema: nativeOutputObjectParametersSchema,
  materialRequirements: [{ field: 'nativeOutputs', minimumItems: 1 }],
  parameterReferenceSources: ['node-output'],
  parameterReferenceBindings: (value) =>
    nativeOutputObjectParametersSchema
      .parse(value)
      .fields.map((field, index) => ({
        nodeIdPointer: `/fields/${index}/sourceNodeId`,
        valuePointer: `/fields/${index}/pointer`,
        reference: {
          source: 'node-output' as const,
          nodeId: field.sourceNodeId,
          pointer: field.pointer,
        },
      })),
  inputPorts: (value) =>
    [
      ...new Set(
        nativeOutputObjectParametersSchema
          .parse(value)
          .fields.map((f) => f.sourceNodeId),
      ),
    ].map((_, i) => `input${i + 1}`),
  outputPorts: () => ['main'],
  waitsForAllInputs: true,
  exclusiveOutputPorts: false,
};
