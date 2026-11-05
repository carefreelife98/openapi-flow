import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { generateApiArguments } from '@openapi-flow/langchain';
import { literalGenerationFixture } from './fixtures/literal-generation-fixture.mjs';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';

test('pre-aborted argument generation does not configure or invoke the model', async () => {
  const input = await literalGenerationFixture();
  const cause = new Error('host cancellation');
  const signal = globalThis.AbortSignal.abort(cause);
  await assert.rejects(
    generateApiArguments({
      ...input,
      signal,
      model: {
        withStructuredOutput() {
          assert.fail('model configured');
        },
      },
    }),
    (error) =>
      error.diagnostic.code === 'MODEL_ABORTED' && error.cause === cause,
  );
});

test('cancellation reaches invoke and rejects a late model result without accepting its values', async () => {
  const input = await literalGenerationFixture();
  const controller = new globalThis.AbortController();
  const cause = new Error('stop');
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages, config) {
          calls++;
          assert.equal(config.signal, controller.signal);
          assert.equal(messages[1].content.includes('signal'), false);
          controller.abort(cause);
          return { values: { body: { quantity: 2 } } };
        },
      };
    },
  };
  await assert.rejects(
    generateApiArguments({ ...input, model, signal: controller.signal }),
    (error) =>
      error.diagnostic.code === 'MODEL_ABORTED' && error.cause === cause,
  );
  assert.equal(calls, 1);
});

test('invalid cancellation input is rejected at the boundary without invoking a model', async () => {
  const input = await literalGenerationFixture();
  await assert.rejects(
    generateApiArguments({
      ...input,
      signal: { aborted: false },
      model: {
        withStructuredOutput() {
          assert.fail('model configured');
        },
      },
    }),
    (error) => error.diagnostic.code === 'PLANNING_INPUT_INVALID',
  );
});

test('real ChatOpenAI passes host cancellation through to its HTTP fetch', async () => {
  const input = await literalGenerationFixture();
  const controller = new globalThis.AbortController();
  let requests = 0;
  let aborted = false;
  const model = new ChatOpenAI({
    model: 'local-cancellation-contract',
    apiKey: 'fixture-not-a-credential',
    maxRetries: 0,
    configuration: {
      baseURL: 'http://127.0.0.1:1/v1',
      fetch: async (_url, options) => {
        requests++;
        assert.ok(options.signal instanceof globalThis.AbortSignal);
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(options.signal.reason);
            },
            { once: true },
          );
          controller.abort(new Error('cancel active fetch'));
        });
      },
    },
  });
  await assert.rejects(
    generateApiArguments({ ...input, model, signal: controller.signal }),
    (error) => error.diagnostic.code === 'MODEL_ABORTED',
  );
  assert.equal(requests, 1);
  assert.equal(aborted, true);
});

test('the optional enum interpretation stage receives the same cancellation signal', async () => {
  const operation = await requestOperation({
    type: 'object',
    properties: { sort: { type: 'string', enum: ['NEW', 'VIEWS'] } },
    required: ['sort'],
  });
  const controller = new globalThis.AbortController();
  let calls = 0;
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke(_messages, config) {
          calls++;
          assert.equal(config.signal, controller.signal);
          if (options.name === 'generate_api_arguments')
            return {
              literalInputs: { state: 'not-provided' },
              requestedInputs: ['/body/sort'],
            };
          assert.equal(options.name, 'select_api_argument_enums');
          controller.abort(new Error('cancel enum interpretation'));
          return { answers: [] };
        },
      };
    },
  };
  await assert.rejects(
    generateApiArguments({
      operation,
      callId: 'enum',
      bindings: [],
      requestMediaType: 'application/json',
      scenario: '조회수 순으로 조회해줘.',
      selectOasEnums: true,
      model,
      signal: controller.signal,
    }),
    (error) => error.diagnostic.code === 'MODEL_ABORTED',
  );
  assert.equal(calls, 2);
});
