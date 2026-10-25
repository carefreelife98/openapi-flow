import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectNativeNodeInstances,
  planNativeInstanceDependencies,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import {
  nativeDependencyFixture,
  nativeDependencyConfiguration,
  nativeDependencyValues,
} from './fixtures/native-instance-dependencies-fixture.mjs';

function cases() {
  const f = nativeDependencyFixture();
  return [
    {
      name: 'native selection',
      invoke: selectNativeNodeInstances,
      input: f.input,
      output: f.selection.proposal,
    },
    {
      name: 'native dependencies',
      invoke: planNativeInstanceDependencies,
      input: { ...f.input, selection: f.selection },
      output: f.proposal,
    },
    {
      name: 'native parameters',
      invoke: generateNativeNodeParameters,
      input: nativeDependencyConfiguration(f, f.source),
      output: {
        decision: { status: 'provided', parameters: nativeDependencyValues },
      },
    },
  ];
}

for (const entry of cases()) {
  test(`${entry.name} rejects an already aborted signal before a model request`, async () => {
    const controller = new globalThis.AbortController();
    const reason = new Error('This exact native request was cancelled');
    controller.abort(reason);
    let calls = 0;
    const model = {
      withStructuredOutput() {
        calls++;
        throw new Error('Must not create a cancelled model request');
      },
    };
    await assert.rejects(
      entry.invoke({ ...entry.input, model, signal: controller.signal }),
      (error) => error === reason,
    );
    assert.equal(calls, 0);
  });

  test(`${entry.name} forwards the exact signal and rejects a cancelled late model result without another call`, async () => {
    const controller = new globalThis.AbortController();
    const reason = new Error('Do not apply this late native result');
    let calls = 0;
    const model = {
      withStructuredOutput() {
        return {
          async invoke(_messages, config) {
            calls++;
            assert.equal(config.signal, controller.signal);
            controller.abort(reason);
            return globalThis.structuredClone(entry.output);
          },
        };
      },
    };
    await assert.rejects(
      entry.invoke({ ...entry.input, model, signal: controller.signal }),
      (error) => error === reason,
    );
    assert.equal(calls, 1);
  });
}
