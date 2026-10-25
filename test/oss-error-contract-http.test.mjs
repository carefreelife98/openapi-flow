import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import { OpenApiFlowError } from '@openapi-flow/core';
import { planApiBindings } from '@openapi-flow/langchain';
import { OutputParserException } from '@langchain/core/output_parsers';
import { bindingPlanningFixture } from './fixtures/binding-planning-record-fixture.mjs';
import { bindingPlan } from './fixtures/request-binding-fixture.mjs';

test('actual ChatOpenAI HTTP failures, tool parsing, contract rejection and success remain distinct', async () => {
  let mode;
  let requests = 0;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests++;
    response.setHeader('content-type', 'application/json');
    if (mode === 'http-error') {
      response.writeHead(400);
      response.end(
        JSON.stringify({
          error: {
            message: 'private server response',
            type: 'invalid_request_error',
            code: 'fixture',
          },
        }),
      );
      return;
    }
    const output =
      mode === 'coverage-error' ? { calls: [], gaps: [] } : bindingPlan;
    response.end(
      JSON.stringify({
        id: 'local-diagnostic-fixture',
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
                  id: 'local-binding-decision',
                  type: 'function',
                  function: {
                    name: body.tools[0].function.name,
                    arguments:
                      mode === 'parser-error'
                        ? '{invalid private output'
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
    const input = bindingPlanningFixture();
    for (const [nextMode, code, stage, httpStatus] of [
      ['http-error', 'MODEL_INVOCATION_FAILED', 'model-invocation', 400],
      ['parser-error', 'MODEL_OUTPUT_INVALID', 'model-output', undefined],
      [
        'coverage-error',
        'API_BINDING_CALL_COVERAGE_MISMATCH',
        'contract-validation',
        undefined,
      ],
    ]) {
      mode = nextMode;
      const before = requests;
      await assert.rejects(planApiBindings({ ...input, model }), (error) => {
        assert.ok(error instanceof OpenApiFlowError);
        assert.equal(error.diagnostic.code, code);
        assert.equal(error.diagnostic.stage, stage);
        assert.equal(error.diagnostic.httpStatus, httpStatus);
        assert.equal(JSON.stringify(error).includes('private'), false);
        if (mode === 'http-error') assert.equal(error.cause.status, 400);
        if (mode === 'parser-error')
          assert.ok(error.cause instanceof OutputParserException);
        return true;
      });
      assert.equal(requests - before, 1, 'No hidden model retry');
    }
    mode = 'valid';
    assert.deepEqual(await planApiBindings({ ...input, model }), bindingPlan);
    assert.equal(requests, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
