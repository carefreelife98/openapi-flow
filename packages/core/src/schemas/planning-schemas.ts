export function createOperationSelectionSchema(refs: string[]) {
  return {
    type: 'object',
    properties: { operationRef: { type: 'string', enum: refs } },
    required: ['operationRef'],
    additionalProperties: false,
  };
}

export function createOperationPlanSchema(
  inputNames: string[],
  responseNames: string[],
) {
  const primitiveSchema = {
    anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  };
  return {
    type: 'object',
    properties: {
      inputs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: inputNames.length
              ? { type: 'string', enum: inputNames }
              : { type: 'string' },
            value: primitiveSchema,
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
      expectedBody: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: responseNames.length
              ? { type: 'string', enum: responseNames }
              : { type: 'string' },
            value: primitiveSchema,
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['inputs', 'expectedBody'],
    additionalProperties: false,
  };
}
