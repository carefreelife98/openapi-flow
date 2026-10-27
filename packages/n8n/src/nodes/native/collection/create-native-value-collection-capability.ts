import {
  createNativeValueSchema,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  CreateNativeValueCollectionCapabilityInput,
  NativeValueCollectionParameters,
} from '../../../types/value-collection.js';
import { createNativeValueCollectionParametersSchema } from '../../../schemas/native-value-collection-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { resolveNativeRuntimeSource } from '../common/resolve-native-runtime-source.js';
import { createValueCollectionFragment } from './create-value-collection-fragment.js';
import { nativeValueCollectionDefinition } from './native-value-collection-definition.js';

export function createNativeValueCollectionCapability(
  input: CreateNativeValueCollectionCapabilityInput,
): N8nNativeCapability {
  validateNativeOutputContracts(input.sources);
  if (!input.sources.length)
    throw new Error('Native value collection requires actual source contracts');
  const supplied = structuredClone(
    input.sources.map(({ nodeId, schema }) => ({ nodeId, schema })),
  );
  const sources = new Map(supplied.map((source) => [source.nodeId, source]));
  const parametersSchema =
    createNativeValueCollectionParametersSchema(supplied);
  function source(parameters: NativeValueCollectionParameters) {
    const selected = sources.get(parameters.sourceNodeId);
    if (!selected)
      throw new Error(
        `Native value collection: unknown source ${parameters.sourceNodeId}`,
      );
    createNativeValueSchema(selected, parameters.pointer);
    return selected;
  }
  return defineMaterialBoundCapability({
    ...nativeValueCollectionDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: { apiMaterials: [], nativeOutputs: supplied },
    bindMaterialContracts: (materials) =>
      createNativeValueCollectionCapability({
        sources: materials.nativeOutputs,
      }),
    responseReferences: () => [],
    nodeOutputReferences: (value) => {
      const parameters = parametersSchema.parse(value);
      source(parameters);
      return [
        {
          source: 'node-output',
          nodeId: parameters.sourceNodeId,
          pointer: parameters.pointer,
        },
      ];
    },
    outputSchema: (value) => {
      const parameters = parametersSchema.parse(value);
      return {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: createNativeValueSchema(
              source(parameters),
              parameters.pointer,
            ),
          },
        },
        required: ['items'],
        additionalProperties: false,
      };
    },
    compile: (input) => {
      const parameters = parametersSchema.parse(input.planned.parameters);
      const selected = source(parameters);
      return createValueCollectionFragment({
        planned: input.planned,
        position: input.position,
        pointer: parameters.pointer,
        source: {
          ...resolveNativeRuntimeSource({
            binding: { kind: 'compiled' },
            contract: selected,
            compiledSources: input.nativeOutputSources,
            consumerId: input.planned.id,
          }),
          kind: 'native-json',
        },
      });
    },
  });
}
