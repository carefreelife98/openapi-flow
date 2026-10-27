import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { nativeOutputProjectionParametersSchema } from '../../../schemas/native-output-projection-schema.js';

export const nativeOutputProjectionDefinition: NativeMaterialFeatureDefinition =
  {
    name: 'project-native-output',
    description:
      'Official n8n Edit Fields: create one named summary object per incoming item from ONE actual native JSON producer, including a previous item join. Omit measurement to copy values unchanged. Explicit derived measurement fields may use utf16-code-units (string.length, not Unicode characters/graphemes) or array-items (array.length). Never infer a missing counting policy or replace an original field with a count; ask for the required unit in the value stage. Original fields can be copied beside derived counts. No casting, arbitrary code, classification labels or extra API calls. Code derives output contracts and validates actual input types. Multiple items remain multiple items; empty input remains empty.',
    materialRequirements: [{ field: 'nativeOutputs', minimumItems: 1 }],
    parametersSchema: nativeOutputProjectionParametersSchema,
    referenceStructureSchema: nativeOutputProjectionParametersSchema,
    parameterReferenceSources: ['node-output'],
    parameterReferenceBindings: (value) => {
      const parameters = nativeOutputProjectionParametersSchema.parse(value);
      return parameters.fields.map((field, index) => ({
        nodeIdPointer: '/sourceNodeId',
        valuePointer: `/fields/${index}/pointer`,
        reference: {
          source: 'node-output' as const,
          nodeId: parameters.sourceNodeId,
          pointer: field.pointer,
        },
      }));
    },
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
