import { defineMaterialBoundCapability } from './common/define-material-bound-capability.js';
import { createResponseValueSchema } from '@openapi-flow/core';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import type {
  CreateResponseCollectionCapabilityInput,
  ResponseCollectionParameters,
} from '../../types/response-collection.js';
import { createResponseCollectionParametersSchema } from '../../schemas/response-collection-schema.js';
import { responseCollectionDefinition } from './response-collection-definition.js';
import { createValueCollectionFragment } from './collection/create-value-collection-fragment.js';

export function createResponseCollectionCapability(
  input: CreateResponseCollectionCapabilityInput,
): N8nNativeCapability {
  const materials = new Map(
    input.materials.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== input.materials.length ||
    input.materials.some((material) => !material.callId.trim())
  )
    throw new Error(
      'response collection capability requires unique API materials',
    );
  const parametersSchema = createResponseCollectionParametersSchema([
    ...materials.keys(),
  ]);
  function source(
    parameters: ResponseCollectionParameters,
  ): ApiBindingMaterial {
    const material = materials.get(parameters.sourceNodeId);
    if (!material)
      throw new Error(
        `response collection: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createResponseValueSchema(material.operation, parameters.pointer);
    return material;
  }
  return defineMaterialBoundCapability({
    ...responseCollectionDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: {
      apiMaterials: structuredClone(input.materials),
      nativeOutputs: [],
    },
    bindMaterialContracts: (sources) =>
      createResponseCollectionCapability({ materials: sources.apiMaterials }),
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
          items: {
            type: 'array',
            items: createResponseValueSchema(
              source(parameters).operation,
              parameters.pointer,
            ),
          },
        },
        required: ['items'],
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
      return createValueCollectionFragment({
        planned,
        position,
        pointer: parameters.pointer,
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
