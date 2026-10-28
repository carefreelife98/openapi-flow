import { createResponseValueSchema } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  CreateApiResponseResultsCapabilityInput,
  ApiResponseResultsParameters,
} from '../../../types/api-response-results.js';
import { createApiResponseResultsParametersSchema } from '../../../schemas/api-response-results-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { apiResponseResultsDefinition } from './api-response-results-definition.js';
import { compileApiResponseResults } from './compile-api-response-results.js';

export function createApiResponseResultsCapability(
  input: CreateApiResponseResultsCapabilityInput,
): N8nNativeCapability {
  const supplied = structuredClone(input.materials);
  const materials = new Map(supplied.map((entry) => [entry.callId, entry]));
  if (
    !materials.size ||
    materials.size !== supplied.length ||
    supplied.some((entry) => !entry.callId.trim())
  )
    throw new Error(
      'response results capability requires unique API materials',
    );
  const parametersSchema = createApiResponseResultsParametersSchema([
    ...materials.keys(),
  ]);
  function selectedMaterials(parameters: ApiResponseResultsParameters) {
    return parameters.sourceNodeIds.map((id) => {
      const material = materials.get(id);
      if (!material)
        throw new Error(`response results: unknown sourceNodeId ${id}`);
      return material;
    });
  }
  return defineMaterialBoundCapability({
    ...apiResponseResultsDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: { apiMaterials: supplied, nativeOutputs: [] },
    bindMaterialContracts: (sources) =>
      createApiResponseResultsCapability({ materials: sources.apiMaterials }),
    responseReferences: (value) =>
      selectedMaterials(parametersSchema.parse(value)).map(
        ({ callId, operation }) => {
          createResponseValueSchema(operation, '');
          return { source: 'response', nodeId: callId, pointer: '' };
        },
      ),
    outputSchema: (value) => {
      const selected = selectedMaterials(parametersSchema.parse(value));
      const entries = selected.map(({ callId, operation }) => ({
        type: 'object',
        properties: {
          callId: { const: callId },
          documentId: { const: operation.key.documentId },
          method: { const: operation.method },
          path: { const: operation.path },
          body: createResponseValueSchema(operation, ''),
        },
        required: ['callId', 'documentId', 'method', 'path', 'body'],
        additionalProperties: false,
      }));
      return {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            minItems: selected.length,
            maxItems: selected.length,
            prefixItems: entries,
            items: false,
          },
        },
        required: ['results'],
        additionalProperties: false,
      };
    },
    compile: (source) => {
      const parameters = parametersSchema.parse(source.planned.parameters);
      return compileApiResponseResults({
        ...source,
        parameters,
        materials: selectedMaterials(parameters),
      });
    },
  });
}
