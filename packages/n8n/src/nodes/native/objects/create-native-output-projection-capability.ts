import {
  createNativeValueSchema,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  CreateNativeOutputProjectionCapabilityInput,
  NativeOutputProjectionParameters,
} from '../../../types/native-output-projection.js';
import { createNativeOutputProjectionParametersSchema } from '../../../schemas/native-output-projection-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { resolveNativeRuntimeSource } from '../common/resolve-native-runtime-source.js';
import { nativeOutputProjectionDefinition } from './native-output-projection-definition.js';
import { compileNativeOutputProjection } from './compile-native-output-projection.js';
import { createNativeProjectionOutputSchema } from './create-native-projection-output-schema.js';

export function createNativeOutputProjectionCapability(
  input: CreateNativeOutputProjectionCapabilityInput,
): N8nNativeCapability {
  validateNativeOutputContracts(input.sources);
  if (!input.sources.length)
    throw new Error(
      'native output projection requires actual source contracts',
    );
  const supplied = structuredClone(
    input.sources.map(({ nodeId, schema }) => ({ nodeId, schema })),
  );
  const sources = new Map(supplied.map((source) => [source.nodeId, source]));
  const parametersSchema =
    createNativeOutputProjectionParametersSchema(supplied);
  function source(parameters: NativeOutputProjectionParameters) {
    const selected = sources.get(parameters.sourceNodeId);
    if (!selected)
      throw new Error(
        `native projection: unknown source ${parameters.sourceNodeId}`,
      );
    return selected;
  }
  return defineMaterialBoundCapability({
    ...nativeOutputProjectionDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: { apiMaterials: [], nativeOutputs: supplied },
    bindMaterialContracts: (materials) =>
      createNativeOutputProjectionCapability({
        sources: materials.nativeOutputs,
      }),
    responseReferences: () => [],
    nodeOutputReferences: (value) => {
      const parameters = parametersSchema.parse(value);
      return parameters.fields.map((field) => {
        createNativeValueSchema(source(parameters), field.pointer);
        return {
          source: 'node-output' as const,
          nodeId: parameters.sourceNodeId,
          pointer: field.pointer,
        };
      });
    },
    outputSchema: (value) => {
      const parameters = parametersSchema.parse(value);
      const selected = source(parameters);
      return createNativeProjectionOutputSchema(selected, parameters.fields);
    },
    compile: (input) => {
      const parameters = parametersSchema.parse(input.planned.parameters);
      const selected = source(parameters);
      createNativeProjectionOutputSchema(selected, parameters.fields);
      for (const field of parameters.fields)
        createNativeValueSchema(selected, field.pointer);
      return compileNativeOutputProjection({
        ...input,
        parameters,
        source: resolveNativeRuntimeSource({
          binding: { kind: 'compiled' },
          contract: selected,
          compiledSources: input.nativeOutputSources,
          consumerId: input.planned.id,
        }),
      });
    },
  });
}
