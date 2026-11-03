export function recursiveOasDocument(openapi = '3.0.3') {
  return {
    openapi,
    info: { title: 'Recursive API contract', version: '1' },
    paths: {
      '/tree': {
        post: {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Node' },
              },
            },
          },
          responses: {
            200: {
              description: 'Tree',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Node' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Node: {
          type: 'object',
          required: ['name', 'children'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    },
  };
}
