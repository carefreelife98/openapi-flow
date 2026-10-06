import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { generateApiArguments } from '@openapi-flow/langchain';
import { createApiArgumentGenerationContract } from '@openapi-flow/core';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';

test('actual ChatOpenAI tool requests preserve OAS constraints and reject invalid values without repair', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: {
      quantity: { enum: [1, 2, 4], maximum: 3 },
      code: { minLength: 2 },
    },
  });
  const input = {
    operation,
    bindings: [],
    requestMediaType: 'application/json',
  };
  const expected =
    createApiArgumentGenerationContract(input).literalInputSchema;
  const requests = [];
  let proposal = { values: { body: { quantity: 2, code: 'ok' } } };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const received = JSON.parse(body);
    requests.push(received);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-value-test',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-values',
                  type: 'function',
                  function: {
                    name: 'generate_api_arguments',
                    arguments: JSON.stringify(proposal),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const generated = await generateApiArguments({
      ...input,
      callId: 'consumer',
      scenario: 'Use quantity 2 and code ok',
      model,
    });
    assert.deepEqual(generated.values, proposal.values);
    proposal = { values: { body: { quantity: 4, code: 'ok' } } };
    await assert.rejects(
      generateApiArguments({
        ...input,
        callId: 'consumer',
        scenario: 'Use quantity 4 and code ok',
        model,
      }),
      /maximum/,
    );
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.deepEqual(request.tools[0].function.parameters, expected);
      assert.deepEqual(
        JSON.parse(request.messages[1].content).literalInputSchema,
        expected,
      );
      assert.equal(Object.hasOwn(request.tools[0].function, 'strict'), false);
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
