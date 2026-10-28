import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import {
  apiResponseResultsParametersSchema,
  createApiResponseResultsParametersSchema,
} from '../../../schemas/api-response-results-schema.js';

export const apiResponseResultsDefinition: NativeMaterialFeatureDefinition = {
  name: 'gather-api-responses',
  description:
    'Only when a consolidated API result is requested, wait for selected API calls and gather their complete unchanged bodies into {results:[{callId,documentId,method,path,body}]}. Code derives provenance and body schemas from OAS; select sourceNodeIds only, never output names or response subpaths. Input1..inputN and results[0]..results[N-1] match sourceNodeIds order, independently of API completion order. The bound output schema declares each position and its original body contract. Exactly one item per selected call. Do not use for a wait-only join or checks: Merge Append plus original API response references suffice. Downstream consumers may use original API references or declared pointers in the bound native output contract; never guess an index from catalog order. Compiles official Merge and Aggregate nodes with an OAS response guard.',
  materialRequirements: [{ field: 'apiMaterials', minimumItems: 1 }],
  parametersSchema: apiResponseResultsParametersSchema,
  createPlanningParametersSchema: ({ apiCallIds }) =>
    createApiResponseResultsParametersSchema(apiCallIds),
  parametersFromProducerDependencies: (sourceNodeIds) => ({
    sourceNodeIds: [...sourceNodeIds],
  }),
  parameterReferenceSources: ['response'],
  referenceStructureSchema: apiResponseResultsParametersSchema,
  parameterReferenceBindings: (value) =>
    apiResponseResultsParametersSchema
      .parse(value)
      .sourceNodeIds.map((nodeId, index) => ({
        nodeIdPointer: `/sourceNodeIds/${index}`,
        reference: { source: 'response' as const, nodeId, pointer: '' },
      })),
  inputPorts: (value) =>
    apiResponseResultsParametersSchema
      .parse(value)
      .sourceNodeIds.map((_, index) => `input${index + 1}`),
  outputPorts: () => ['main'],
  waitsForAllInputs: true,
  exclusiveOutputPorts: false,
};
