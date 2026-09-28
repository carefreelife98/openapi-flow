import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { createOperationSelectionSchema } from '../dist/schemas/operation-selection-schema.js';

test('ChatOpenAI sends the Zod-derived JSON Schema and rejects an invalid parsed response', async () => {
  const requests = [];
  let responseRef = '#/paths/~1items/get';
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
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
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify({ operationRef: responseRef }),
            },
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
    responseRef = 'not-in-oas';
    await assert.rejects(structured.invoke('Read an item'));
    assert.equal(requests.length, 2);
    for (const request of requests) {
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
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
