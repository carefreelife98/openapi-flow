import { createResponseValueSchema } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  CreateApiResponseObjectCapabilityInput,
  ApiResponseObjectParameters,
} from '../../../types/api-response-object.js';
import { createApiResponseObjectParametersSchema } from '../../../schemas/api-response-object-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { apiResponseObjectDefinition } from './api-response-object-definition.js';
import { compileApiResponseObject } from './compile-api-response-object.js';

export function createApiResponseObjectCapability(
  input: CreateApiResponseObjectCapabilityInput,
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
    throw new Error('response object capability requires unique API materials');
  const parametersSchema = createApiResponseObjectParametersSchema([
    ...materials.keys(),
  ]);
  function describeFields(parameters: ApiResponseObjectParameters) {
    return parameters.fields.map((field) => {
      const material = materials.get(field.sourceNodeId);
      if (!material)
        throw new Error(
          `response object: unknown sourceNodeId ${field.sourceNodeId}`,
        );
      return {
        field,
        material,
        schema: createResponseValueSchema(material.operation, field.pointer),
      };
    });
  }
  return defineMaterialBoundCapability({
    ...apiResponseObjectDefinition,
    parametersSchema,
    materialSources: { apiMaterials: supplied, nativeOutputs: [] },
    bindMaterialContracts: (sources) =>
      createApiResponseObjectCapability({ materials: sources.apiMaterials }),
    responseReferences: (value) =>
      describeFields(parametersSchema.parse(value)).map(({ field }) => ({
        source: 'response',
        nodeId: field.sourceNodeId,
        pointer: field.pointer,
      })),
    outputSchema: (value) => {
      const fields = describeFields(parametersSchema.parse(value));
      return {
        type: 'object',
        properties: Object.fromEntries(
          fields.map(({ field, schema }) => [field.name, schema]),
        ),
        required: fields.map(({ field }) => field.name),
        additionalProperties: false,
      };
    },
    compile: (source) => {
      const parameters = parametersSchema.parse(source.planned.parameters);
      const fields = describeFields(parameters);
      const used = [
        ...new Map(
          fields.map(({ material }) => [material.callId, material]),
        ).values(),
      ];
      return compileApiResponseObject({
        ...source,
        parameters,
        materials: used,
      });
    },
  });
}
