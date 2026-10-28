import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiBindingSourceSelection } from '@openapi-flow/core';
import {
  planApiCallBindings,
  createApiCallBindingRejection,
  ApiCallBindingPlanningError,
} from '@openapi-flow/langchain';
import { materials, bindingPlan } from './fixtures/request-binding-fixture.mjs';
import { candidateChoices } from './fixtures/api-binding-candidate-choice.mjs';

test('a host can repair only a rejected candidate choice with separate source-bound feedback; no hidden retry', async () => {
  const input = {
    scenario: 'Use the source ID for detail.',
    materials,
    callId: 'detail',
  };
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: ['source'], gaps: [] },
  });
  const contexts = [];
  const model = {
    withStructuredOutput() {
      return {
        invoke: async (messages) => {
          const context = JSON.parse(messages[1].content);
          contexts.push(context);
          return contexts.length === 1
            ? {
                bindings: [
                  {
                    candidateId: 'invented',
                    sourceSelections: {},
                    targetSelections: {},
                  },
                ],
                gaps: [],
              }
            : {
                bindings: candidateChoices(
                  context,
                  bindingPlan.calls.find((call) => call.callId === 'detail')
                    .bindings,
                ),
                gaps: [],
              };
        },
      };
    },
  };
  let failure;
  try {
    await planApiCallBindings({ ...input, sources, model });
  } catch (error) {
    failure = error;
  }
  assert(failure instanceof ApiCallBindingPlanningError);
  assert.equal(contexts.length, 1);
  assert(!JSON.stringify(failure).includes('invented'));
  const rejection = createApiCallBindingRejection({
    ...input,
    sources,
    error: failure,
  });
  assert(rejection);
  assert.equal(
    createApiCallBindingRejection({
      ...input,
      scenario: 'changed',
      sources,
      error: failure,
    }),
    undefined,
  );
  const result = await planApiCallBindings({
    ...input,
    sources,
    rejectedProposals: [rejection],
    model,
  });
  assert.deepEqual(
    result.bindings,
    bindingPlan.calls.find((call) => call.callId === 'detail').bindings,
  );
  assert.equal(contexts[1].scenario, input.scenario);
  assert.deepEqual(contexts[1].rejectedProposals, [rejection]);
  await assert.rejects(
    planApiCallBindings({
      ...input,
      sources,
      model,
      rejectedProposals: [{ ...rejection, sourceFingerprint: '0'.repeat(64) }],
    }),
    /different call/,
  );
  assert.equal(contexts.length, 2);
  assert.equal(
    createApiCallBindingRejection({
      ...input,
      sources,
      error: new Error('network failed'),
    }),
    undefined,
  );
});

test('host repair composition uses an explicit bound, stops on transport errors and keeps source selection unchanged', async () => {
  const { planApiBindingCallWithRepair } =
    await import('@openapi-flow/example-langgraph-workflow');
  const input = {
    scenario: 'Use the original source ID.',
    materials,
    callId: 'detail',
  };
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: ['source'], gaps: [] },
  });
  let calls = 0;
  const before = [],
    rejected = [];
  const model = {
    withStructuredOutput() {
      return {
        invoke: async (messages) => {
          calls++;
          const context = JSON.parse(messages[1].content);
          return calls === 1
            ? {
                bindings: [
                  {
                    candidateId: 'unknown',
                    sourceSelections: {},
                    targetSelections: {},
                  },
                ],
                gaps: [],
              }
            : {
                bindings: candidateChoices(
                  context,
                  bindingPlan.calls.find((call) => call.callId === 'detail')
                    .bindings,
                ),
                gaps: [],
              };
        },
      };
    },
  };
  const result = await planApiBindingCallWithRepair({
    ...input,
    sources,
    model,
    maxRejectedProposals: 1,
    beforeAttempt: (attempt) => {
      before.push(attempt);
    },
    onRejected: (count) => {
      rejected.push(count);
    },
  });
  assert.equal(result.bindings.length, 1);
  assert.deepEqual(before, [1, 2]);
  assert.deepEqual(rejected, [1]);
  calls = 0;
  await assert.rejects(
    planApiBindingCallWithRepair({
      ...input,
      sources,
      model,
      maxRejectedProposals: 0,
    }),
    ApiCallBindingPlanningError,
  );
  assert.equal(calls, 1);
  const providerError = new Error('private transport failure');
  let failures = 0;
  await assert.rejects(
    planApiBindingCallWithRepair({
      ...input,
      sources,
      maxRejectedProposals: 3,
      model: {
        withStructuredOutput() {
          return {
            invoke: async () => {
              failures++;
              throw providerError;
            },
          };
        },
      },
    }),
    (error) => error.cause === providerError,
  );
  assert.equal(failures, 1);
});
