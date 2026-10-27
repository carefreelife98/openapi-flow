import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createMaterialRecoveryModelLease } from '../examples/langgraph-workflow/dist/graph/connections/create-material-recovery-model-lease.js';

test('the leased actual ChatOpenAI retains its tool protocol and output while stopping a second invocation before HTTP', async () => {
  let calls = 0;
  const chat = new ChatOpenAI({
    apiKey: 'local-fixture-not-a-credential',
    model: 'gpt-4o',
    maxRetries: 0,
    configuration: {
      baseURL: 'http://127.0.0.1:1/v1',
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(body.tools[0].function.name, 'leased_request');
        assert.equal(body.tools[0].function.strict, true);
        assert.ok(init.signal instanceof globalThis.AbortSignal);
        return new globalThis.Response(
          JSON.stringify({
            id: 'lease-wire',
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
                      id: 'leased',
                      type: 'function',
                      function: {
                        name: 'leased_request',
                        arguments: JSON.stringify({ value: '0007' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  });
  const lease = createMaterialRecoveryModelLease(
    chat,
    1,
    new globalThis.AbortController().signal,
  );
  const runnable = lease.model.withStructuredOutput(
    z.strictObject({ value: z.string() }),
    { name: 'leased_request', method: 'functionCalling', strict: true },
  );
  assert.throws(
    () => lease.model.withConfig({}),
    /requires withStructuredOutput/,
  );
  assert.throws(() => runnable.withConfig({}), /supports only/);
  assert.throws(() => runnable.withRetry({}), /supports only/);
  assert.deepEqual(
    await runnable.invoke([new HumanMessage('Use the supplied string.')]),
    { value: '0007' },
  );
  assert.equal(lease.usedInvocations(), 1);
  assert.throws(
    () => runnable.invoke([new HumanMessage('Must not call')]),
    /exceeded model-invocations/,
  );
  assert.equal(calls, 1);
});

test('the lease shares its allowance across runnables, preserves private method receivers, and supports a zero-call policy', async () => {
  class Model {
    #count = 0;
    withStructuredOutput() {
      this.#count++;
      return { invoke: async () => ({ count: this.#count }) };
    }
  }
  const lease = createMaterialRecoveryModelLease(
    new Model(),
    2,
    new globalThis.AbortController().signal,
  );
  const first = lease.model.withStructuredOutput({});
  const second = lease.model.withStructuredOutput({});
  assert.equal((await first.invoke([])).count, 2);
  assert.equal((await second.invoke([])).count, 2);
  assert.throws(() => first.invoke([]), /exceeded model-invocations/);
  const zero = createMaterialRecoveryModelLease(
    new Model(),
    0,
    new globalThis.AbortController().signal,
  );
  assert.throws(
    () => zero.model.withStructuredOutput({}).invoke([]),
    /exceeded model-invocations/,
  );
  assert.equal(zero.usedInvocations(), 0);
});

test('parent and caller abort signals reach the runnable without relying on the callback to forward configuration', async () => {
  for (const abortParent of [true, false]) {
    const parent = new globalThis.AbortController(),
      caller = new globalThis.AbortController();
    let release, invocationSignal;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const model = {
      withStructuredOutput() {
        return {
          async invoke(_messages, config) {
            invocationSignal = config.signal;
            await pending;
            return { value: 'late' };
          },
        };
      },
    };
    const lease = createMaterialRecoveryModelLease(model, 1, parent.signal);
    const result = lease.model
      .withStructuredOutput({})
      .invoke([], abortParent ? undefined : { signal: caller.signal });
    const reason = new Error('cancel-leased-model');
    (abortParent ? parent : caller).abort(reason);
    assert.equal(invocationSignal.aborted, true);
    release();
    await assert.rejects(result, (error) => error === reason);
  }
});

test('unsupported entry points, invalid configs and closed leases fail before calling the model; transport failures preserve their original cause', async () => {
  const cause = new Error('original leased transport failure');
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          throw cause;
        },
      };
    },
  };
  const lease = createMaterialRecoveryModelLease(
    model,
    3,
    new globalThis.AbortController().signal,
  );
  const runnable = lease.model.withStructuredOutput({});
  assert.throws(() => lease.model.invoke([]), /requires withStructuredOutput/);
  assert.throws(() => runnable.batch([[]]), /supports only/);
  for (const config of [null, [], { signal: 'not-a-signal' }])
    assert.throws(() => runnable.invoke([], config));
  assert.equal(calls, 0);
  await assert.rejects(runnable.invoke([]), (error) => error === cause);
  assert.equal(calls, 1);
  lease.close();
  assert.throws(() => runnable.invoke([]), /lease is closed/);
  assert.equal(calls, 1);
});
