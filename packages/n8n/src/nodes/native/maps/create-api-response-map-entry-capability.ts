import {
  createResponseObjectEntrySchema,
  resolveNativeStructureParameters,
} from '@openapi-flow/core';
import type {
  ApiResponseMapEntryStructure,
  CreateApiResponseMapEntryCapabilityInput,
} from '../../../types/api-response-map-entry.js';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import {
  createApiResponseMapEntryParametersSchema,
  createApiResponseMapEntryBoundPlanningSchema,
  apiResponseMapEntryStructureSchema,
} from '../../../schemas/api-response-map-entry-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { apiResponseMapEntryDefinition } from './api-response-map-entry-definition.js';
import { compileApiResponseMapEntry } from './compile-api-response-map-entry.js';
import { prependNativeParameterGuard } from '../inputs/prepend-native-parameter-guard.js';

export function createApiResponseMapEntryCapability(
  input: CreateApiResponseMapEntryCapabilityInput,
): N8nNativeCapability {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error('Map entry itemMode must be linked or omitted');
  const supplied = structuredClone(input.materials);
  const materials = new Map(
    supplied.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== supplied.length ||
    supplied.some((material) => !material.callId.trim())
  )
    throw new Error('Map entry capability requires unique API materials');
  const parametersSchema = createApiResponseMapEntryParametersSchema(supplied);
  const planningSchema = createApiResponseMapEntryBoundPlanningSchema(supplied);
  function describe(parameters: ApiResponseMapEntryStructure) {
    const material = materials.get(parameters.sourceNodeId);
    if (!material)
      throw new Error(`Unknown map entry source ${parameters.sourceNodeId}`);
    return {
      material,
      schema: createResponseObjectEntrySchema(
        material.operation,
        parameters.pointer,
        parameters.key,
      ),
    };
  }
  const capability: N8nNativeCapability = defineMaterialBoundCapability({
    ...apiResponseMapEntryDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => planningSchema,
    materialSources: { apiMaterials: supplied, nativeOutputs: [] },
    bindMaterialContracts: (sources) =>
      createApiResponseMapEntryCapability({
        materials: sources.apiMaterials,
        itemMode: input.itemMode,
      }),
    responseReferences: (value) => {
      const parameters = apiResponseMapEntryStructureSchema.parse(value);
      describe(parameters);
      return [
        {
          source: 'response',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      ];
    },
    outputSchema: (value) => {
      const parameters = apiResponseMapEntryStructureSchema.parse(value);
      const { schema } = describe(parameters);
      return {
        type: 'object',
        properties: { key: { type: 'string' }, value: schema },
        required: ['key', 'value'],
        additionalProperties: false,
      };
    },
    compile: (source) => {
      const parameters = apiResponseMapEntryStructureSchema.parse(
        resolveNativeStructureParameters(source.planned, capability),
      );
      const { material } = describe(parameters);
      const fragment = compileApiResponseMapEntry({
        ...source,
        material,
        parameters,
        linked: input.itemMode === 'linked',
      });
      return source.planned.runtimeParameters === undefined
        ? fragment
        : prependNativeParameterGuard({ input: source, capability, fragment });
    },
  });
  return capability;
}
