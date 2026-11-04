import {
  createNativeValueSchema,
  validateNativeOutputContracts,
  deduplicateCanonicalSchemaResources,
} from '@openapi-flow/core';
import type { JsonValueObject } from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { CreateNativeOutputProjectionCapabilityInput } from '../../../types/native-output-projection.js';
import { createNativeOutputObjectParametersSchema } from '../../../schemas/native-output-object-schema.js';
import { defineMaterialBoundCapability } from '../common/define-material-bound-capability.js';
import { nativeOutputObjectDefinition } from './native-output-object-definition.js';
import { compileNativeOutputObject } from './compile-native-output-object.js';

export function createNativeOutputObjectCapability(
  input: CreateNativeOutputProjectionCapabilityInput,
): N8nNativeCapability {
  validateNativeOutputContracts(input.sources);
  if (!input.sources.length)
    throw new Error(
      'Native output object requires actual native source contracts',
    );
  const sources = structuredClone(input.sources);
  const parametersSchema = createNativeOutputObjectParametersSchema(sources);
  const fields = (value: JsonValueObject) =>
    parametersSchema.parse(value).fields.map((field) => {
      const source = sources.find((s) => s.nodeId === field.sourceNodeId);
      if (!source)
        throw new Error(
          `Native output object source is missing ${field.sourceNodeId}`,
        );
      return {
        field,
        source,
        schema: createNativeValueSchema(source, field.pointer),
      };
    });
  return defineMaterialBoundCapability({
    ...nativeOutputObjectDefinition,
    parametersSchema,
    createPlanningParametersSchema: () => parametersSchema,
    materialSources: { apiMaterials: [], nativeOutputs: sources },
    bindMaterialContracts: (materials) =>
      createNativeOutputObjectCapability({ sources: materials.nativeOutputs }),
    responseReferences: () => [],
    nodeOutputReferences: (value) =>
      fields(value).map(({ field }) => ({
        source: 'node-output',
        nodeId: field.sourceNodeId,
        pointer: field.pointer,
      })),
    outputSchema: (value) => {
      const selected = fields(value);
      return deduplicateCanonicalSchemaResources({
        type: 'object',
        properties: Object.fromEntries(
          selected.map(({ field, schema }) => [field.name, schema]),
        ),
        required: selected.map(({ field }) => field.name),
        additionalProperties: false,
      });
    },
    compile: (input) => {
      const selected = fields(input.planned.parameters);
      return compileNativeOutputObject({
        ...input,
        parameters: parametersSchema.parse(input.planned.parameters),
        sources: [
          ...new Map(
            selected.map(({ source }) => [source.nodeId, source]),
          ).values(),
        ],
      });
    },
  });
}
