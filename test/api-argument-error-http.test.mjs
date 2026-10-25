import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import { OutputParserException } from '@langchain/core/output_parsers';
import { OpenApiFlowError } from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { literalGenerationFixture } from './fixtures/literal-generation-fixture.mjs';

test('actual argument tool transport distinguishes HTTP, parser and output-schema failures without changing strictness', async () => {
  let mode;
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    response.setHeader('content-type', 'application/json');
    if (mode === 'http-error') {
      response.writeHead(400);
      response.end(
        JSON.stringify({
          error: {
            message: 'private provider error',
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }
    const output =
      mode === 'schema-error'
        ? { values: { body: { quantity: 'private-invalid-value' } } }
        : { values: { body: { quantity: 2 } } };
    response.end(
      JSON.stringify({
        id: 'local-argument-diagnostic',
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
                  id: 'local-argument-tool',
                  type: 'function',
                  function: {
                    name: body.tools[0].function.name,
                    arguments:
                      mode === 'parser-error'
                        ? '{private invalid JSON'
                        : JSON.stringify(output),
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
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const input = await literalGenerationFixture();
    for (const [nextMode, code, stage, status] of [
      ['http-error', 'MODEL_INVOCATION_FAILED', 'model-invocation', 400],
      ['parser-error', 'MODEL_OUTPUT_INVALID', 'model-output', undefined],
      ['schema-error', 'MODEL_OUTPUT_INVALID', 'model-output', undefined],
    ]) {
      mode = nextMode;
      const before = requests.length;
      await assert.rejects(
        generateApiArguments({ ...input, model }),
        (error) => {
          assert.ok(error instanceof OpenApiFlowError);
          assert.equal(error.diagnostic.code, code);
          assert.equal(error.diagnostic.stage, stage);
          assert.equal(error.diagnostic.httpStatus, status);
          if (mode === 'http-error') assert.equal(error.cause.status, 400);
          if (mode === 'parser-error')
            assert.ok(error.cause instanceof OutputParserException);
          assert.equal(JSON.stringify(error).includes('private'), false);
          return true;
        },
      );
      assert.equal(requests.length - before, 1);
    }
    mode = 'valid';
    const result = await generateApiArguments({ ...input, model });
    assert.deepEqual(result.values, {
      body: { id: 'confirmed-original', quantity: 2 },
    });
    assert.equal(requests.length, 4);
    for (const body of requests) {
      assert.equal(body.tools[0].function.name, 'generate_api_arguments');
      assert.equal(Object.hasOwn(body.tools[0].function, 'strict'), false);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
