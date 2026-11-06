import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiBindingCalls,
  describeApiCallBindingPlanning,
  resolveApiBindingSourceSelection,
} from '../packages/core/dist/public-api.js';
import { selectWorkflowApiBindingSources } from '../packages/langchain/dist/public-api.js';
import {
  fixture,
  messages,
} from './fixtures/workflow-api-argument-fixture.mjs';
async function input() {
  const f = await fixture();
  return {
    scenario: f.context.scenario,
    materials: f.context.calls.map(
      ({ callId, operation, requestMediaType }) => ({
        callId,
        operation,
        ...(requestMediaType === undefined ? {} : { requestMediaType }),
      }),
    ),
    literalSourceMessages: messages,
  };
}
function model(output, capture) {
  return {
    withStructuredOutput(schema, options) {
      return {
        invoke: async (messages) => {
          capture?.({ schema, options, messages });
          return output;
        },
      };
    },
  };
}
test('six independent calls select producer dependencies together in one model invocation', async () => {
  const source = await input();
  let count = 0;
  const calls = Object.fromEntries(
    source.materials.map((m) => [
      m.callId,
      { decision: { kind: 'independent-inputs' } },
    ]),
  );
  const results = await selectWorkflowApiBindingSources({
    ...source,
    model: model({ calls }, (wire) => {
      count++;
      assert.equal(wire.options.strict, true);
      const body = JSON.parse(wire.messages[1].content);
      assert.equal(body.calls.length, 6);
      assert.equal(body.sourceCandidates.length, 6);
      assert.doesNotMatch(JSON.stringify(body), /startTokenId|endTokenId/);
    }),
  });
  assert.equal(count, 1);
  assert.equal(results.length, 6);
  assert(results.every((result) => !result.sourceNodeIds.length));
  for (const result of results)
    assert.deepEqual(
      result,
      resolveApiBindingSourceSelection({
        ...source,
        callId: result.callId,
        proposal: { sourceNodeIds: [], gaps: [] },
      }),
    );
});
test('batch preparation preserves individual target contracts and source eligibility', async () => {
  const source = await input();
  for (const description of describeApiBindingCalls(source)) {
    const single = describeApiCallBindingPlanning({
      ...source,
      callId: description.input.callId,
    });
    assert.equal(description.fingerprint, single.fingerprint);
    assert.deepEqual(description.requestSchema, single.requestSchema);
    assert.deepEqual(description.sourceCandidates, single.sourceCandidates);
  }
});
test('partial recovery plans only pending calls while preserving all source candidates', async () => {
  const source = await input();
  const [target] = source.materials;
  const calls = {
    [target.callId]: { decision: { kind: 'independent-inputs' } },
  };
  let invoked = 0;
  const result = await selectWorkflowApiBindingSources({
    ...source,
    callIds: [target.callId],
    model: model({ calls }, (wire) => {
      invoked++;
      const body = JSON.parse(wire.messages[1].content);
      assert.equal(body.calls.length, 1);
      assert.equal(body.sourceCandidates.length, 6);
      assert.equal(body.calls[0].allowedSourceNodeIds.length, 5);
    }),
  });
  assert.equal(invoked, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].callId, target.callId);
  assert.deepEqual(
    await selectWorkflowApiBindingSources({
      ...source,
      callIds: [],
      model: model({}, () =>
        assert.fail('empty work must not invoke the model'),
      ),
    }),
    [],
  );
  for (const callIds of [[target.callId, target.callId], ['unknown']])
    await assert.rejects(
      selectWorkflowApiBindingSources({ ...source, callIds, model: model({}) }),
      /callIds/,
    );
});
test('unknown producers and missing call decisions fail without fabricated independent selections', async () => {
  const source = await input();
  const calls = Object.fromEntries(
    source.materials.map((m) => [
      m.callId,
      { decision: { kind: 'independent-inputs' } },
    ]),
  );
  delete calls.price;
  await assert.rejects(
    selectWorkflowApiBindingSources({ ...source, model: model({ calls }) }),
  );
  calls.price = {
    decision: {
      kind: 'selected-response-sources',
      sourceNodeIds: ['invented'],
    },
  };
  await assert.rejects(
    selectWorkflowApiBindingSources({ ...source, model: model({ calls }) }),
  );
});
test('an upstream error is propagated once and changes to original material invalidate the proposal', async () => {
  const source = await input(),
    error = new Error('wire-stopped');
  let count = 0;
  await assert.rejects(
    selectWorkflowApiBindingSources({
      ...source,
      model: {
        withStructuredOutput() {
          return {
            invoke: async () => {
              count++;
              throw error;
            },
          };
        },
      },
    }),
    (e) => e.cause === error,
  );
  assert.equal(count, 1);
  const calls = Object.fromEntries(
    source.materials.map((m) => [
      m.callId,
      { decision: { kind: 'independent-inputs' } },
    ]),
  );
  const changing = { ...source };
  changing.model = model({ calls }, () => {
    changing.scenario += 'changed';
  });
  await assert.rejects(selectWorkflowApiBindingSources(changing), /changed/);
});
