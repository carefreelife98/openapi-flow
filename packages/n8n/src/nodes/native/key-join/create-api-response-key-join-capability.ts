import {
  createResponseArrayItemSchema,
  createResponseArrayItemValueSchema,
} from '@openapi-flow/core';
import type { BindingSchema } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  ApiResponseKeyJoinContract,
  ApiResponseKeyJoinSource,
  CreateApiResponseKeyJoinCapabilityInput,
} from '../../../types/api-response-key-join.js';
import {
  apiResponseKeyJoinParametersSchema,
  createApiResponseKeyJoinParametersSchema,
} from '../../../schemas/api-response-key-join-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { apiResponseKeyJoinDefinition } from './api-response-key-join-definition.js';
import { compileApiResponseKeyJoin } from './compile-api-response-key-join.js';

export function createApiResponseKeyJoinCapability(
  input: CreateApiResponseKeyJoinCapabilityInput,
): N8nNativeCapability {
  const supplied = structuredClone(input.materials);
  const materials = new Map(
    supplied.map((material) => [material.callId, material]),
  );
  if (
    !materials.size ||
    materials.size !== supplied.length ||
    supplied.some((material) => !material.callId.trim())
  )
    throw new Error('Key join requires unique non-empty API materials');
  const parametersSchema = createApiResponseKeyJoinParametersSchema(supplied);
  function contract(
    selection: ApiResponseKeyJoinSource,
  ): ApiResponseKeyJoinContract {
    const material = materials.get(selection.sourceNodeId);
    if (!material)
      throw new Error(`Unknown key join source ${selection.sourceNodeId}`);
    return {
      material,
      itemSchema: createResponseArrayItemSchema(
        material.operation,
        selection.pointer,
      ),
      keySchema: createResponseArrayItemValueSchema(
        material.operation,
        selection.pointer,
        selection.keyPointer,
      ),
    };
  }
  function references(value: unknown) {
    const parameters = parametersSchema.parse(value);
    return (['left', 'right'] as const).map((side) => {
      contract(parameters[side]);
      return {
        source: 'response' as const,
        nodeId: parameters[side].sourceNodeId,
        pointer: parameters[side].pointer,
      };
    });
  }
  return defineMaterialBoundCapability({
    ...apiResponseKeyJoinDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: { apiMaterials: supplied, nativeOutputs: [] },
    bindMaterialContracts: (sources) =>
      createApiResponseKeyJoinCapability({ materials: sources.apiMaterials }),
    responseReferences: references,
    inputReferences: (value) => {
      const [left, right] = references(value);
      return { left: [left], right: [right] };
    },
    outputSchema: (value): BindingSchema => {
      const parameters = parametersSchema.parse(value);
      const left = contract(parameters.left),
        right = contract(parameters.right);
      const required =
        parameters.joinMode === 'inner'
          ? ['left', 'right']
          : parameters.joinMode === 'full'
            ? []
            : [parameters.joinMode];
      if (parameters.missingKeys === 'error') required.push('key');
      return {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { anyOf: [left.keySchema, right.keySchema] },
          left: left.itemSchema,
          right: right.itemSchema,
        },
        required,
        anyOf: [{ required: ['left'] }, { required: ['right'] }],
      };
    },
    compile: (source) => {
      const parameters = apiResponseKeyJoinParametersSchema.parse(
        parametersSchema.parse(source.planned.parameters),
      );
      return compileApiResponseKeyJoin({
        ...source,
        parameters,
        left: contract(parameters.left),
        right: contract(parameters.right),
      });
    },
  });
}
