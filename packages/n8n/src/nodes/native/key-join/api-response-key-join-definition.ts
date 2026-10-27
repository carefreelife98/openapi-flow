import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import {
  apiResponseKeyJoinParametersSchema,
  createApiResponseKeyJoinPlanningSchema,
} from '../../../schemas/api-response-key-join-schema.js';

export const apiResponseKeyJoinDefinition: NativeMaterialFeatureDefinition = {
  name: 'join-api-response-arrays-by-key',
  description:
    'Join two OAS response arrays by explicitly selected business-key paths using official n8n Merge. Strict typed/deep equality, all duplicate-key combinations, explicit inner/full/left/right retention and missing-key policy. Output keeps unchanged rows under fixed left/right fields and the original key when present. Operates on all response items arriving on each input in the current invocation; not ancestry pairing, positional zipping, status interpretation or cross-invocation accumulation.',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  parametersSchema: apiResponseKeyJoinParametersSchema,
  referenceStructureSchema: apiResponseKeyJoinParametersSchema,
  createPlanningParametersSchema: createApiResponseKeyJoinPlanningSchema,
  parameterReferenceSources: ['response'],
  parameterReferenceBindings: (value) => {
    const parameters = apiResponseKeyJoinParametersSchema.parse(value);
    return (['left', 'right'] as const).map((side) => ({
      nodeIdPointer: `/${side}/sourceNodeId`,
      valuePointer: `/${side}/pointer`,
      reference: {
        source: 'response' as const,
        nodeId: parameters[side].sourceNodeId,
        pointer: parameters[side].pointer,
      },
    }));
  },
  inputPorts: () => ['left', 'right'],
  outputPorts: () => ['main'],
  waitsForAllInputs: true,
  exclusiveOutputPorts: false,
};
