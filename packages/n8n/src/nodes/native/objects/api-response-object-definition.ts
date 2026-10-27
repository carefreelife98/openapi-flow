import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import {
  apiResponseObjectParametersSchema,
  createApiResponseObjectParametersSchema,
} from '../../../schemas/api-response-object-schema.js';

export const apiResponseObjectDefinition: NativeMaterialFeatureDefinition = {
  name: 'compose-api-responses',
  description:
    'Wait for all referenced API branches and compose explicitly named properties into one JSON object from unchanged whole response bodies or RFC 6901 values. Code derives all value types and input ports from actual references, validates full OAS responses and compiles official Merge plus Edit Fields (Set). Input1..inputN correspond to distinct sourceNodeIds in first-field occurrence order. Connect each API branch to its matching input; do not add a separate branch join for this operation. Requires exactly one item per referenced API execution. No casting, flattening or inferred matching. Repeated fields may read the same source under different names without adding an input.',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  parametersSchema: apiResponseObjectParametersSchema,
  createPlanningParametersSchema: ({ apiCallIds }) =>
    createApiResponseObjectParametersSchema(apiCallIds),
  parameterReferenceSources: ['response'],
  referenceStructureSchema: apiResponseObjectParametersSchema,
  parameterReferenceBindings: (value) =>
    apiResponseObjectParametersSchema
      .parse(value)
      .fields.map((field, index) => ({
        nodeIdPointer: `/fields/${index}/sourceNodeId`,
        valuePointer: `/fields/${index}/pointer`,
        reference: {
          source: 'response' as const,
          nodeId: field.sourceNodeId,
          pointer: field.pointer,
        },
      })),
  inputPorts: (value) =>
    [
      ...new Set(
        apiResponseObjectParametersSchema
          .parse(value)
          .fields.map((field) => field.sourceNodeId),
      ),
    ].map((_, index) => `input${index + 1}`),
  outputPorts: () => ['main'],
  waitsForAllInputs: true,
  exclusiveOutputPorts: false,
};
