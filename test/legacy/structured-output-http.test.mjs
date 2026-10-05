import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { createOperationPlanSchema } from '../../packages/core/dist/schemas/operation-plan-schema.js';
import { createOperationSelectionSchema } from '../../packages/langchain/dist/legacy/schemas/operation-selection-schema.js';

test('ChatOpenAI sends the Zod-derived JSON Schema and rejects an invalid parsed response', async () => {
  const requests = [];
  const responseRef = '#/paths/~1items/get';
  let modelResponse = { operationRef: responseRef };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const received = JSON.parse(body);
    requests.push(received);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: received.tools ? 'tool_calls' : 'stop',
            message: received.tools
              ? {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-plan',
                      type: 'function',
                      function: {
                        name: 'plan_operation',
                        arguments: JSON.stringify(modelResponse),
                      },
                    },
                  ],
                }
              : { role: 'assistant', content: JSON.stringify(modelResponse) },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: { baseURL: `http://127.0.0.1:${address.port}/v1` },
    });
    const structured = model.withStructuredOutput(
      createOperationSelectionSchema(['#/paths/~1items/get']),
      { name: 'select_operation', method: 'jsonSchema', strict: true },
    );
    assert.deepEqual(await structured.invoke('Read an item'), {
      operationRef: responseRef,
    });
    modelResponse = { operationRef: 'not-in-oas' };
    await assert.rejects(structured.invoke('Read an item'));
    for (const request of requests.slice(0, 2)) {
      assert.equal(request.response_format.type, 'json_schema');
      assert.equal(request.response_format.json_schema.strict, true);
      assert.deepEqual(
        request.response_format.json_schema.schema.properties.operationRef.enum,
        ['#/paths/~1items/get'],
      );
      assert.ok(
        request.response_format.json_schema.schema.properties.operationRef
          .description,
      );
    }
    const planSchema = createOperationPlanSchema(
      {
        parameters: [{ in: 'path', name: 'id', schema: { type: 'string' } }],
        body: {
          mediaTypes: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { quantity: { type: 'integer', minimum: 1 } },
              },
            },
          },
        },
      },
      '3.1.1',
    );
    modelResponse = {
      inputs: { path: { id: 'item-42' }, body: { quantity: 3 } },
    };
    const planned = model.withStructuredOutput(planSchema, {
      name: 'plan_operation',
      method: 'functionCalling',
    });
    assert.deepEqual(
      await planned.invoke('Update item-42 quantity to 3'),
      modelResponse,
    );
    assert.equal(requests.length, 3);
    assert.equal(requests[2].response_format, undefined);
    assert.deepEqual(requests[2].tool_choice, {
      type: 'function',
      function: { name: 'plan_operation' },
    });
    const wire = requests[2].tools[0].function;
    assert.equal(Object.hasOwn(wire, 'strict'), false);
    assert.equal(
      wire.parameters.properties.inputs.properties.path.properties.id.type,
      'string',
    );
    assert.equal(
      wire.parameters.properties.inputs.properties.body.properties.quantity
        .type,
      'integer',
    );
    modelResponse = { inputs: { body: { quantity: 'three' } } };
    await assert.rejects(planned.invoke('Use quantity three'));
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
