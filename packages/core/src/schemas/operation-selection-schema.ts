import type { JSONSchema } from '@langchain/core/utils/json_schema';

export function createOperationSelectionSchema(refs: string[]): JSONSchema {
  return {
    type: 'object',
    description: 'The OpenAPI operation selected for the user scenario.',
    properties: {
      operationRef: {
        type: 'string',
        description:
          'The exact operationRef of the single OpenAPI operation that best matches the scenario. Choose one of the supplied references; do not invent a new one.',
        enum: refs,
      },
    },
    required: ['operationRef'],
    additionalProperties: false,
  };
}
