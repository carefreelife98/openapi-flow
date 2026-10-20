import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import {
  createNativeArrayItemSchema,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { NativeOutputContract } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { NativeArrayParameters } from '../../../types/native-array.js';
import type { BoundNativeArrayCapabilityInput } from '../../../types/native-material-binding.js';
import { createNativeArrayParametersSchema } from '../../../schemas/native-array-schema.js';
import { nativeArrayDefinition } from './native-array-definition.js';
import { createArrayNodeFragment } from './create-array-node-fragment.js';
import { resolveNativeRuntimeSource } from '../common/resolve-native-runtime-source.js';

/** Data-contract binding is independent of runtime SDK producer names. */
export function createBoundNativeArrayCapability(
  input: BoundNativeArrayCapabilityInput,
): N8nNativeCapability {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error(
      'native array capability: itemMode must be linked or omitted',
    );
  validateNativeOutputContracts(input.sources);
  if (!input.sources.length)
    throw new Error('native array capability requires source contracts');
  const contracts = input.sources.map(({ nodeId, schema }) => ({
    nodeId,
    schema,
  }));
  const sources = new Map(contracts.map((source) => [source.nodeId, source]));
  const parametersSchema = createNativeArrayParametersSchema([
    ...sources.keys(),
  ]);
  function source(parameters: NativeArrayParameters): NativeOutputContract {
    const output = sources.get(parameters.sourceNodeId);
    if (!output)
      throw new Error(
        `native array: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createNativeArrayItemSchema(output, parameters.pointer);
    return output;
  }
  return defineMaterialBoundCapability({
    ...nativeArrayDefinition,
    parametersSchema,
    materialSources: {
      apiMaterials: [],
      nativeOutputs: structuredClone(contracts),
    },
    bindMaterialContracts: (contracts) =>
      createBoundNativeArrayCapability({
        sources: contracts.nativeOutputs,
        itemMode: input.itemMode,
        runtime: { kind: 'compiled' },
      }),
    responseReferences: () => [],
    nodeOutputReferences: (values) => {
      const parameters = parametersSchema.parse(values);
      source(parameters);
      return [
        {
          source: 'node-output',
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
          item: createNativeArrayItemSchema(
            source(parameters),
            parameters.pointer,
          ),
        },
        required: ['item'],
        additionalProperties: false,
      };
    },
    compile: ({ planned, position, nativeOutputSources }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      const runtime = resolveNativeRuntimeSource({
        binding: input.runtime,
        contract: source(parameters),
        compiledSources: nativeOutputSources,
        consumerId: planned.id,
      });
      return createArrayNodeFragment({
        planned,
        position,
        source: { ...runtime, kind: 'native-json' },
        parameters,
        linked: input.itemMode === 'linked',
      });
    },
  });
}
