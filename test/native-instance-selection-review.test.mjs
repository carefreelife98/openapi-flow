import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createNativeInstanceSelectionReview,
  validateNativeInstanceSelectionReview,
  describeNativeInstanceSelectionReview,
  createNativeInstanceSelectionReviewSchema,
  describeNativeInstanceSelectionFeedback,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  OpenApiFlowError,
} from '@openapi-flow/core';
import {
  reviewNativeInstanceSelection,
  selectNativeNodeInstances,
  generateNativeNodeParameters,
  NativeInstanceSelectionReviewError,
} from '@openapi-flow/langchain';
import { nativeSelectionReviewFixture } from './fixtures/native-instance-selection-review-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const clone = (value) => globalThis.structuredClone(value);
const model = (output, inspect = () => {}) => ({
  withStructuredOutput(schema) {
    return {
      async invoke(messages, options) {
        inspect({ schema, messages, options });
        return clone(output);
      },
    };
  },
});

test('native gap review binds every assessment to the actual source and preserves the original selection unchanged', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const before = clone(selection);
  const review = createNativeInstanceSelectionReview({
    ...input,
    selection,
    proposal: reviewProposal,
  });
  assert.equal(review.status, 'needs-reselection');
  assert.equal(review.selectionId, selection.id);
  assert.deepEqual(selection, before);
  assert.equal(
    selection.gaps.length,
    2,
    'A review does not remove original gaps',
  );
  assert.deepEqual(
    validateNativeInstanceSelectionReview({ ...input, selection, review }),
    review,
  );
  const context = describeNativeInstanceSelectionFeedback(input, {
    selection,
    review,
  });
  assert.deepEqual(context.assessments, reviewProposal.assessments);
  assert.equal(context.reportedGaps.length, 2);
  assert.equal(
    'literalParametersSchema' in context.selectedInstances[0],
    false,
    'Do not repeat complete settings schemas in feedback',
  );
});

test('explicit selection attempt history is source-validated and contains proposals rather than duplicated runtime contracts', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const review = createNativeInstanceSelectionReview({
    ...input,
    selection,
    proposal: reviewProposal,
  });
  const feedback = { selection, review, previousSelections: [selection] };
  const description = describeNativeInstanceSelectionFeedback(input, feedback);
  assert.deepEqual(description.previousSelections, [
    { id: selection.id, proposal: selection.proposal },
  ]);
  description.previousSelections[0].proposal.gaps.length = 0;
  assert.equal(selection.proposal.gaps.length, 2);
  const stale = clone(selection);
  stale.context.scenario += ' changed';
  assert.throws(
    () =>
      describeNativeInstanceSelectionFeedback(input, {
        ...feedback,
        previousSelections: [stale],
      }),
    /stale|modified/,
  );
  assert.throws(
    () =>
      describeNativeInstanceSelectionFeedback(input, {
        ...feedback,
        previousSelections: {},
      }),
    /must be an array/,
  );
});

test('missing, extra, duplicate, fabricated and stale review evidence fails rather than broadening or repairing a gap', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const create = (proposal) =>
    createNativeInstanceSelectionReview({ ...input, selection, proposal });
  const gaps = selection.gaps.map((gap) => gap.id);
  for (const edit of [
    (reply) => {
      delete reply.assessments[gaps[0]];
    },
    (reply) => {
      reply.assessments.extra = clone(reply.assessments[gaps[0]]);
    },
    (reply) => {
      reply.assessments[gaps[0]].capability = 'invented';
    },
    (reply) => {
      reply.assessments[gaps[1]].callIds = ['invented'];
    },
    (reply) => {
      reply.assessments[gaps[1]].callIds = ['metrics', 'metrics'];
    },
    (reply) => {
      reply.assessments[gaps[0]].sourceQuote =
        'Invented original user condition';
    },
  ]) {
    const changed = clone(reviewProposal);
    edit(changed);
    assert.throws(() => create(changed));
  }
  const review = create(reviewProposal);
  assert.throws(
    () =>
      validateNativeInstanceSelectionReview({
        ...input,
        selection,
        review: { ...review, status: 'no-gaps' },
      }),
    /stale|routing status/,
  );
  assert.throws(
    () =>
      validateNativeInstanceSelectionReview({
        ...input,
        planId: 'other',
        selection,
        review,
      }),
    /stale|modified/,
  );
  assert.throws(
    () =>
      describeNativeInstanceSelectionFeedback(
        { ...input, scenario: input.scenario + ' changed' },
        { selection, review },
      ),
    /stale|modified/,
  );
});

test('unsupported behavior and genuine business decisions remain explicit blockers and cannot be passed as automatic reselection feedback', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const id = selection.gaps[0].id;
  for (const kind of ['unsupported-native-behavior', 'business-decision']) {
    const proposal = clone(reviewProposal);
    proposal.assessments[id] = {
      kind,
      sourceQuote: 'Check pending connections against my threshold.',
      reason: 'Explicit independent reviewer judgment',
      ...(kind === 'business-decision'
        ? { question: 'Which business check is intended?' }
        : {}),
    };
    const review = createNativeInstanceSelectionReview({
      ...input,
      selection,
      proposal,
    });
    let calls = 0;
    await assert.rejects(
      selectNativeNodeInstances({
        ...input,
        feedback: { selection, review },
        model: model({ instances: [], gaps: [] }, () => {
          calls++;
        }),
      }),
      /cannot automatically bypass/,
    );
    assert.equal(calls, 0);
    assert.equal(selection.gaps.length, 2);
  }
});

test('review plus one explicit fresh selection routes a missing setting to the existing value-stage question without inventing it', async () => {
  const { input, selection, proposal, reviewProposal } =
    await nativeSelectionReviewFixture();
  const before = clone(selection);
  let reviewCalls = 0,
    selectionCalls = 0;
  const review = await reviewNativeInstanceSelection({
    ...input,
    selection,
    model: model(reviewProposal, () => {
      reviewCalls++;
    }),
  });
  const corrected = { instances: proposal.instances, gaps: [] };
  const ready = await selectNativeNodeInstances({
    ...input,
    feedback: { selection, review },
    model: model(corrected, ({ messages }) => {
      selectionCalls++;
      const context = JSON.parse(messages[1].content);
      assert.equal(context.selectionFeedback.selectionId, selection.id);
      assert.equal(context.scenario, input.scenario);
      assert.deepEqual(
        context.selectionFeedback.assessments,
        review.proposal.assessments,
      );
    }),
  });
  assert.equal(ready.gaps.length, 0);
  assert.deepEqual(selection, before);
  const nodeId = ready.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection: ready,
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['metrics'] } } },
  });
  const question = await generateNativeNodeParameters({
    ...input,
    selection: ready,
    dependencies,
    nodeId,
    model: model({
      decision: {
        status: 'needs-clarification',
        message: 'What pending-connection threshold should be used?',
      },
    }),
  });
  assert.equal(question.status, 'needs-clarification');
  assert.equal('parameters' in question.proposal.decision, false);
  assert.equal(reviewCalls, 1);
  assert.equal(selectionCalls, 1);
});

test('review has a valid closed wire contract, zero calls for no gaps and no invented API branch for a native-only source', async () => {
  const { input, selection, proposal, reviewProposal } =
    await nativeSelectionReviewFixture();
  const description = describeNativeInstanceSelectionReview({
    ...input,
    selection,
  });
  let calls = 0;
  await reviewNativeInstanceSelection({
    ...input,
    selection,
    model: model(reviewProposal, ({ schema }) => {
      calls++;
      const validate = new Ajv2020({ strict: false }).compile(schema);
      assert.equal(validate(reviewProposal), true);
      assert.equal(validate({ assessments: {} }), false);
    }),
  });
  assert.equal(calls, 1);
  const complete = resolveNativeInstanceSelection({
    ...input,
    proposal: { ...proposal, gaps: [] },
  });
  const noGaps = await reviewNativeInstanceSelection({
    ...input,
    selection: complete,
    model: model({}, () => assert.fail('No review model is needed')),
  });
  assert.equal(noGaps.status, 'no-gaps');
  const nativeInput = { ...input, apiMaterials: [] };
  const nativeSelection = resolveNativeInstanceSelection({
    ...nativeInput,
    proposal,
  });
  const nativeSchema = createNativeInstanceSelectionReviewSchema(
    describeNativeInstanceSelectionReview({
      ...nativeInput,
      selection: nativeSelection,
    }),
  );
  assert.equal(nativeSchema.safeParse(reviewProposal).success, false);
  assert.equal(description.instances[0].id, selection.instances[0].id);
});

test('invalid reviews, transport errors and concurrent source changes keep their original evidence without hidden retries', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const bad = clone(reviewProposal);
  bad.assessments[selection.gaps[0].id].sourceQuote =
    'Not in the original scenario';
  let calls = 0;
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...input,
      selection,
      model: model(bad, () => {
        calls++;
      }),
    }),
    (error) =>
      error instanceof NativeInstanceSelectionReviewError &&
      error.failure.output.assessments[selection.gaps[0].id].sourceQuote ===
        bad.assessments[selection.gaps[0].id].sourceQuote,
  );
  assert.equal(calls, 1);
  const cause = new Error('Fixture provider failed');
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...input,
      selection,
      model: {
        withStructuredOutput() {
          return {
            async invoke() {
              throw cause;
            },
          };
        },
      },
    }),
    (error) =>
      error instanceof OpenApiFlowError &&
      error.cause === cause &&
      error.diagnostic.code === 'MODEL_INVOCATION_FAILED',
  );
  const changed = { ...input, selection };
  changed.model = model(reviewProposal, () => {
    changed.scenario += ' changed';
  });
  await assert.rejects(
    reviewNativeInstanceSelection(changed),
    (error) =>
      error instanceof OpenApiFlowError &&
      error.diagnostic.code === 'PLANNING_INPUT_INVALID',
  );
});

test('review cancellation reaches the one runnable and source changes retain the original provider failure', async () => {
  const { input, selection, reviewProposal } =
    await nativeSelectionReviewFixture();
  const controller = new globalThis.AbortController();
  controller.abort(new Error('Explicit fixture cancellation'));
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...input,
      selection,
      signal: controller.signal,
      model: model(reviewProposal, () =>
        assert.fail('An already cancelled review must not call the model'),
      ),
    }),
    (error) => error === controller.signal.reason,
  );
  const active = new globalThis.AbortController();
  await assert.rejects(
    reviewNativeInstanceSelection({
      ...input,
      selection,
      signal: active.signal,
      model: {
        withStructuredOutput() {
          return {
            async invoke(_messages, options) {
              assert.equal(options.signal, active.signal);
              active.abort(new Error('Cancelled in the fixture runnable'));
              throw active.signal.reason;
            },
          };
        },
      },
    }),
    (error) =>
      error instanceof OpenApiFlowError &&
      error.diagnostic.code === 'MODEL_ABORTED' &&
      error.cause === active.signal.reason,
  );
  const failure = new Error('Original fixture provider failure');
  const changed = { ...input, selection };
  changed.model = {
    withStructuredOutput() {
      return {
        async invoke() {
          changed.scenario += ' changed';
          throw failure;
        },
      };
    },
  };
  await assert.rejects(
    reviewNativeInstanceSelection(changed),
    (error) =>
      error instanceof OpenApiFlowError &&
      error.diagnostic.code === 'PLANNING_INPUT_INVALID' &&
      error.cause instanceof AggregateError &&
      error.cause.errors[0].cause === failure,
  );
});

test('feedback mutation during explicit reselection cannot accept a stale reviewed source or hide the returned proposal', async () => {
  const { input, selection, proposal, reviewProposal } =
    await nativeSelectionReviewFixture();
  const review = createNativeInstanceSelectionReview({
    ...input,
    selection,
    proposal: reviewProposal,
  });
  const request = { ...input, feedback: { selection, review } };
  const corrected = { instances: proposal.instances, gaps: [] };
  request.model = model(corrected, () => {
    request.feedback.review.proposal.assessments[selection.gaps[1].id].callIds =
      ['invented'];
  });
  await assert.rejects(
    selectNativeNodeInstances(request),
    (error) =>
      error.failure.stage === 'instance-selection' &&
      error.failure.output.gaps.length === 0,
  );
  assert.equal(selection.gaps.length, 2);
});
