import { defineMaterialBoundCapability } from './common/define-material-bound-capability.js';
import { createResponseArrayItemSchema } from '@openapi-flow/core';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import type {
  CreateResponseArrayCapabilityInput,
  ResponseArrayParameters,
} from '../../types/array-iteration.js';
import { createResponseArrayParametersSchema } from '../../schemas/response-array-schema.js';
import { createArrayNodeFragment } from './arrays/create-array-node-fragment.js';
import { responseArrayDefinition } from './response-array-definition.js';

export function createResponseArrayCapability(
  input: CreateResponseArrayCapabilityInput,
): N8nNativeCapability {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error(
      'response array capability: itemMode must be linked or omitted',
    );
  const linked = input.itemMode === 'linked';
  const materials = new Map(
    input.materials.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== input.materials.length ||
    input.materials.some((material) => !material.callId.trim())
  )
    throw new Error('response array capability requires unique API materials');
  const parametersSchema = createResponseArrayParametersSchema([
    ...materials.keys(),
  ]);
  function source(parameters: ResponseArrayParameters): ApiBindingMaterial {
    const material = materials.get(parameters.sourceNodeId);
    if (!material)
      throw new Error(
        `response array: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createResponseArrayItemSchema(material.operation, parameters.pointer);
    return material;
  }
  return defineMaterialBoundCapability({
    ...responseArrayDefinition,
    parametersSchema,
    materialSources: {
      apiMaterials: structuredClone(input.materials),
      nativeOutputs: [],
    },
    bindMaterialContracts: (sources) =>
      createResponseArrayCapability({
        materials: sources.apiMaterials,
        itemMode: input.itemMode,
      }),
    responseReferences: (values) => {
      const parameters = parametersSchema.parse(values);
      source(parameters);
      return [
        {
          source: 'response',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      ];
    },
    outputSchema: (values) => {
      const parameters = parametersSchema.parse(values);
      return {
        type: 'object',
        properties: {
          item: createResponseArrayItemSchema(
            source(parameters).operation,
            parameters.pointer,
          ),
        },
        required: ['item'],
        additionalProperties: false,
      };
    },
    compile: ({ planned, position, apiNodeNames }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      const material = source(parameters);
      if (
        !Object.hasOwn(apiNodeNames, material.callId) ||
        !apiNodeNames[material.callId].trim()
      )
        throw new Error(`apiNodeNames is missing ${material.callId}`);
      return createArrayNodeFragment({
        planned,
        position,
        parameters,
        linked,
        source: {
          kind: 'api-response',
          nodeId: material.callId,
          nodeName: apiNodeNames[material.callId],
          operation: material.operation,
        },
      });
    },
  });
}
