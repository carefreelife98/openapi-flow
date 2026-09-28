import type { JSONSchema } from '@langchain/core/utils/json_schema';

export function createOperationPlanSchema(
  inputNames: string[],
  responseNames: string[],
): JSONSchema {
  return {
    type: 'object',
    description:
      'Values and response-body assertions explicitly stated in the scenario for the selected OpenAPI operation.',
    properties: {
      inputs: {
        type: 'array',
        description:
          'Request parameter and body values explicitly provided by the scenario. Return an empty array if none are provided.',
        items: {
          type: 'object',
          description:
            'One explicitly supplied value for an OpenAPI request input.',
          properties: {
            key: inputNames.length
              ? {
                  type: 'string',
                  description:
                    'An exact request input key from the selected operation, such as path.id, query.page, body, or body.name.',
                  enum: inputNames,
                }
              : {
                  type: 'string',
                  description:
                    'An exact request input key from the selected operation. No input keys are available for this operation.',
                },
            valueJson: {
              type: 'string',
              description:
                'The explicitly supplied input value encoded as a JSON literal string. For example: "42", true, [1,2], or {"name":"demo"}. Do not invent a value.',
            },
          },
          required: ['key', 'valueJson'],
          additionalProperties: false,
        },
      },
      expectedBody: {
        type: 'array',
        description:
          'Response-body field assertions explicitly requested by the scenario. Return an empty array if none are requested.',
        items: {
          type: 'object',
          description:
            'One explicitly requested OpenAPI response-body assertion.',
          properties: {
            key: responseNames.length
              ? {
                  type: 'string',
                  description:
                    'An exact response-body field name declared by the selected operation.',
                  enum: responseNames,
                }
              : {
                  type: 'string',
                  description:
                    'An exact response-body field name declared by the selected operation. No response fields are available.',
                },
            valueJson: {
              type: 'string',
              description:
                'The explicitly expected response-body value encoded as a JSON literal string. For example: true, 200, or ["a","b"]. Do not invent an assertion.',
            },
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
