export function createOperationSelectionSchema(refs: string[]) {
  return {
    type: 'object',
    properties: { operationRef: { type: 'string', enum: refs } },
    required: ['operationRef'],
    additionalProperties: false,
  };
}

export function createExpectedStatusSchema(explicitStatus?: number) {
  return {
    type: 'object',
    properties: {
      expectedStatus: {
        type: 'integer',
        minimum: 100,
        maximum: 599,
        ...(explicitStatus === undefined ? {} : { enum: [explicitStatus] }),
      },
    },
    required: ['expectedStatus'],
    additionalProperties: false,
  };
}

export function createOperationPlanSchema(
  inputNames: string[],
  responseNames: string[],
) {
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
            valueJson: { type: 'string' },
          },
          required: ['key', 'valueJson'],
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
            valueJson: { type: 'string' },
          },
          required: ['key', 'valueJson'],
          additionalProperties: false,
        },
      },
    },
    required: ['inputs', 'expectedBody'],
    additionalProperties: false,
  };
}
