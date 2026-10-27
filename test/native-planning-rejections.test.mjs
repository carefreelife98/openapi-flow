import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectNativeNodeInstances,
  reviewNativeInstanceSelection,
  createNativeSelectionRejection,
  createNativeSelectionReviewRejection,
  NativeNodePlanningError,
  NativeInstanceSelectionReviewError,
} from '@openapi-flow/langchain';
import { nativeSelectionReviewFixture } from './fixtures/native-instance-selection-review-fixture.mjs';

const clone = (value) => globalThis.structuredClone(value);
const model = (output, inspect = () => {}) => ({
  withStructuredOutput() {
    return {
      async invoke(messages) {
        inspect(JSON.parse(messages[1].content));
        return clone(output);
      },
    };
  },
});

async function rejectedSelection(fixture) {
  const bad = {
    ...clone(fixture.proposal),
    instances: [
      {
        capability: 'not-supplied',
        purpose: 'Unavailable role',
        parameterSource: 'literal',
      },
    ],
  };
  let error;
  try {
    await selectNativeNodeInstances({ ...fixture.input, model: model(bad) });
  } catch (failure) {
    error = failure;
  }
  assert(error instanceof NativeNodePlanningError);
  const rejection = createNativeSelectionRejection({ ...fixture.input, error });
  assert(rejection);
  return { error, rejection, bad };
}

async function rejectedReview(fixture) {
  const bad = clone(fixture.reviewProposal);
  bad.assessments[fixture.selection.gaps[0].id].sourceQuote =
    'Generated gap description, not original scenario';
  let error;
  try {
    await reviewNativeInstanceSelection({
      ...fixture.input,
      selection: fixture.selection,
      model: model(bad),
    });
  } catch (failure) {
    error = failure;
  }
  assert(error instanceof NativeInstanceSelectionReviewError);
  const rejection = createNativeSelectionReviewRejection({
    ...fixture.input,
    selection: fixture.selection,
    error,
  });
  assert(rejection);
  return { error, rejection, bad };
}

test('selection exposes lossless same-source feedback for one explicit correction without a hidden retry', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const { rejection, bad } = await rejectedSelection(fixture);
  assert.deepEqual(rejection.output, bad);
  let calls = 0;
  const result = await selectNativeNodeInstances({
    ...fixture.input,
    rejectedProposals: [rejection],
    model: model(fixture.proposal, (context) => {
      calls++;
      assert.deepEqual(context.rejectedProposals, [rejection]);
      assert.equal(context.scenario, fixture.input.scenario);
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.proposal, fixture.proposal);
  assert.deepEqual(rejection.output, bad);
});

test('review correction preserves original invalid quote rather than editing it or treating it as user input', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const { rejection, bad } = await rejectedReview(fixture);
  let calls = 0;
  const result = await reviewNativeInstanceSelection({
    ...fixture.input,
    selection: fixture.selection,
    rejectedProposals: [rejection],
    model: model(fixture.reviewProposal, (context) => {
      calls++;
      assert.deepEqual(context.rejectedProposals[0].output, bad);
      assert.equal(context.context.scenario, fixture.input.scenario);
      assert(
        !context.context.scenario.includes(
          bad.assessments[fixture.selection.gaps[0].id].sourceQuote,
        ),
      );
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'needs-reselection');
  assert.deepEqual(rejection.output, bad);
});

test('selection feedback cannot be replayed against a changed scenario, plan identity, ownership policy or review stage', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const { rejection, error } = await rejectedSelection(fixture);
  for (const changed of [
    { scenario: fixture.input.scenario + ' changed' },
    { planId: fixture.input.planId + '-other' },
    { allowRuntimeParameters: true },
    { includeExplanations: true },
  ]) {
    assert.equal(
      createNativeSelectionRejection({ ...fixture.input, ...changed, error }),
      undefined,
    );
    await assert.rejects(
      selectNativeNodeInstances({
        ...fixture.input,
        ...changed,
        rejectedProposals: [rejection],
        model: model({}, () =>
          assert.fail('Stale history must fail before a model call'),
        ),
      }),
      /different planning stage|changed source/,
    );
  }
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...fixture.input,
      selection: fixture.selection,
      rejectedProposals: [rejection],
      model: model({}, () => assert.fail('Wrong stage')),
    }),
    /different planning stage/,
  );
});

test('review history belongs to the exact selected proposal, not merely an equal scenario', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const { rejection } = await rejectedReview(fixture);
  const { resolveNativeInstanceSelection } = await import('@openapi-flow/core');
  const selection = resolveNativeInstanceSelection({
    ...fixture.input,
    proposal: {
      ...fixture.proposal,
      gaps: [{ description: 'Different native issue' }],
    },
  });
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...fixture.input,
      selection,
      rejectedProposals: [rejection],
      model: model({}, () => assert.fail('Changed selection')),
    }),
    /changed source/,
  );
});

test('transport, missing-provenance and non-JSON failures never become corrective proposals', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const transport = new Error('Original transport failure');
  const failing = {
    withStructuredOutput() {
      return {
        async invoke() {
          throw transport;
        },
      };
    },
  };
  await assert.rejects(
    selectNativeNodeInstances({ ...fixture.input, model: failing }),
    (error) => error === transport,
  );
  assert.equal(
    createNativeSelectionRejection({ ...fixture.input, error: transport }),
    undefined,
  );
  assert.equal(
    createNativeSelectionReviewRejection({
      ...fixture.input,
      selection: fixture.selection,
      error: transport,
    }),
    undefined,
  );
  assert.equal(
    createNativeSelectionRejection({
      ...fixture.input,
      error: new NativeNodePlanningError(
        { stage: 'instance-selection', output: {} },
        transport,
      ),
    }),
    undefined,
  );
  const { error } = await rejectedSelection(fixture);
  const unrecordable = new NativeNodePlanningError(
    { ...error.failure, output: undefined },
    transport,
  );
  assert.equal(
    createNativeSelectionRejection({ ...fixture.input, error: unrecordable }),
    undefined,
  );
});

test('source mutations during success and failed transport are not classified as model-output corrections', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const input = { ...fixture.input };
  let caught;
  try {
    await selectNativeNodeInstances({
      ...input,
      model: model(fixture.proposal, () => {
        fixture.input.scenario += ' changed';
      }),
    });
  } catch (error) {
    caught = error;
  }
  // Changing a different object is not mutation of this invocation.
  assert.equal(caught, undefined);
  const changed = { ...input };
  changed.model = model(fixture.proposal, () => {
    changed.scenario += ' changed';
  });
  await assert.rejects(selectNativeNodeInstances(changed), (error) => {
    assert(error instanceof NativeNodePlanningError);
    assert.deepEqual(error.failure.output, fixture.proposal);
    assert.equal(error.failure.requestFingerprint, undefined);
    assert.equal(
      createNativeSelectionRejection({ ...changed, error }),
      undefined,
    );
    return /source contracts changed/.test(error.message);
  });
  const transport = new Error('Original transport failure');
  const failed = {
    ...input,
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            failed.planId += '-changed';
            throw transport;
          },
        };
      },
    },
  };
  await assert.rejects(
    selectNativeNodeInstances(failed),
    (error) => error instanceof AggregateError && error.errors[0] === transport,
  );
});

test('feedback mutation during selection/review and abort preserve failure rather than producing a new receipt', async () => {
  const fixture = await nativeSelectionReviewFixture();
  const { rejection } = await rejectedSelection(fixture);
  const history = [clone(rejection)];
  await assert.rejects(
    selectNativeNodeInstances({
      ...fixture.input,
      rejectedProposals: history,
      model: model(fixture.proposal, () => {
        history[0].reason += ' changed';
      }),
    }),
    /source contracts changed/,
  );
  const review = await rejectedReview(fixture);
  const reviewHistory = [clone(review.rejection)];
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...fixture.input,
      selection: fixture.selection,
      rejectedProposals: reviewHistory,
      model: model(fixture.reviewProposal, () => {
        reviewHistory[0].output = {};
      }),
    }),
    /source changed/,
  );
  const abort = new globalThis.AbortController();
  await assert.rejects(
    selectNativeNodeInstances({
      ...fixture.input,
      signal: abort.signal,
      model: model(fixture.proposal, () => abort.abort()),
    }),
    (error) => error.name === 'AbortError',
  );
});
