import {
  createNativeArrayItemSchema,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type {
  CreateNativeArrayCapabilityInput,
  NativeArrayParameters,
} from '../../../types/native-array.js';
import type { N8nNativeJsonSource } from '../../../types/output-binding-source.js';
import { createNativeArrayParametersSchema } from '../../../schemas/native-array-schema.js';
import { createArrayNodeFragment } from './create-array-node-fragment.js';

export function createNativeArrayCapability(
  input: CreateNativeArrayCapabilityInput,
): N8nNativeCapability {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error(
      'native array capability: itemMode must be linked or omitted',
    );
  validateNativeOutputContracts(input.sources);
  if (
    !input.sources.length ||
    input.sources.some(
      (source) =>
        typeof source.nodeName !== 'string' || !source.nodeName.trim(),
    )
  )
    throw new Error(
      'native array capability requires sources with compiled names',
    );
  const sources = new Map(
    input.sources.map((source) => [source.nodeId, source]),
  );
  const parametersSchema = createNativeArrayParametersSchema([
    ...sources.keys(),
  ]);
  function source(parameters: NativeArrayParameters): N8nNativeJsonSource {
    const output = sources.get(parameters.sourceNodeId);
    if (!output)
      throw new Error(
        `native array: unknown sourceNodeId ${parameters.sourceNodeId}`,
      );
    createNativeArrayItemSchema(output, parameters.pointer);
    return { ...output, kind: 'native-json' };
  }
  return {
    name: 'split-native-output-array',
    description:
      'Split a supplied native JSON output array into {item: unchangedElement} using official n8n Split Out. Validate the full native output schema first. Linked mode preserves parent ancestry across nested splits. Empty arrays emit no child items; never convert, flatten or fabricate values.',
    parametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
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
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
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
    compile: ({ planned, position }) => {
      const parameters = parametersSchema.parse(planned.parameters);
      return createArrayNodeFragment({
        planned,
        position,
        source: source(parameters),
        parameters,
        linked: input.itemMode === 'linked',
      });
    },
  };
}
