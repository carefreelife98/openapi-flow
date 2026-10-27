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
import {
  nativeSelectionReviewFixture,
  nativeOutsideScopeReviewFixture,
} from './fixtures/native-instance-selection-review-fixture.mjs';

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

test('an outside-scope assessment requests a new selection without approving or deleting the old proposal', async () => {
  const { input, selection, reviewProposal } =
    await nativeOutsideScopeReviewFixture();
  const before = clone(selection);
  const review = createNativeInstanceSelectionReview({
    ...input,
    selection,
    proposal: reviewProposal,
  });
  assert.equal(review.status, 'needs-reselection');
  assert.deepEqual(review.proposal, reviewProposal);
  assert.deepEqual(selection, before);
  assert.equal(selection.gaps.length, 1);
  const feedback = { selection, review, previousSelections: [selection] };
  const context = describeNativeInstanceSelectionFeedback(input, feedback);
  assert.deepEqual(context.reportedGaps, before.gaps);
  assert.deepEqual(context.assessments, reviewProposal.assessments);
  let calls = 0;
  const next = await selectNativeNodeInstances({
    ...input,
    feedback,
    model: model({ instances: [], gaps: [] }, ({ messages }) => {
      calls++;
      const sent = JSON.parse(messages[1].content);
      assert.equal(sent.scenario, input.scenario);
      assert.deepEqual(sent.selectionFeedback.assessments, context.assessments);
      assert.deepEqual(sent.selectionFeedback.reportedGaps, before.gaps);
    }),
  });
  assert.equal(calls, 1);
  assert.equal(next.gaps.length, 0);
  assert.equal(next.instances.length, 0);
  assert.deepEqual(selection, before);
  assert.throws(
    () =>
      validateNativeInstanceSelectionReview({
        ...input,
        selection,
        review: { ...review, status: 'no-gaps' },
      }),
    /stale|routing status/,
  );
});

test('explicit instance review can reject an unrequested role even when the proposal has no reported gaps', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const selection = resolveNativeInstanceSelection({
    ...f.input,
    proposal: { ...f.proposal, gaps: [] },
  });
  const before = clone(selection);
  const role = selection.instances[0];
  const proposal = {
    assessments: {},
    coverageAssessment: {
      kind: 'needs-reselection',
      reason: 'The selected role is outside the requested work.',
    },
    instanceAssessments: {
      [role.id]: Object.values(f.reviewProposal.assessments)[0],
    },
  };
  let calls = 0;
  const review = await reviewNativeInstanceSelection({
    ...f.input,
    selection,
    reviewInstances: true,
    model: model(proposal, ({ messages }) => {
      calls++;
      const sent = JSON.parse(messages[1].content);
      assert.equal(sent.reviewInstances, true);
      assert.equal(sent.gaps.length, 0);
      assert.equal(sent.instances[0].id, role.id);
    }),
  });
  assert.equal(calls, 1);
  assert.equal(review.reviewInstances, true);
  assert.equal(review.status, 'needs-reselection');
  assert.deepEqual(selection, before);
  const feedback = describeNativeInstanceSelectionFeedback(f.input, {
    selection,
    review,
  });
  assert.equal(feedback.reviewInstances, true);
  assert.deepEqual(feedback.instanceAssessments, proposal.instanceAssessments);
  assert.throws(() =>
    validateNativeInstanceSelectionReview({ ...f.input, selection, review }),
  );
  assert.throws(() =>
    createNativeInstanceSelectionReview({
      ...f.input,
      selection,
      reviewInstances: false,
      proposal,
    }),
  );
  for (const alter of [
    (value) => {
      delete value.coverageAssessment;
    },
    (value) => {
      value.coverageAssessment.sourceQuote = 'Invented scope';
    },
    (value) => {
      delete value.instanceAssessments[role.id];
    },
    (value) => {
      value.instanceAssessments.invented = clone(
        value.instanceAssessments[role.id],
      );
    },
    (value) => {
      value.instanceAssessments[role.id].sourceQuote =
        'Invented original role requirement';
    },
    (value) => {
      value.instanceAssessments[role.id].kind = 'unsupported-native-behavior';
    },
  ]) {
    const invalid = clone(proposal);
    alter(invalid);
    assert.throws(() =>
      createNativeInstanceSelectionReview({
        ...f.input,
        selection,
        reviewInstances: true,
        proposal: invalid,
      }),
    );
  }
});

test('full role review retains required roles and business questions without converting either to an implicit selection', async () => {
  const f = await nativeSelectionReviewFixture();
  const selection = resolveNativeInstanceSelection({
    ...f.input,
    proposal: { ...f.proposal, gaps: [] },
  });
  const id = selection.instances[0].id;
  for (const kind of ['required', 'business-decision']) {
    const review = createNativeInstanceSelectionReview({
      ...f.input,
      selection,
      reviewInstances: true,
      proposal: {
        assessments: {},
        coverageAssessment: {
          kind: 'covered',
          reason:
            'The supplied native role implements this controlled request.',
        },
        instanceAssessments: {
          [id]: {
            kind,
            reason:
              'The reviewer retains the original request as scope evidence.',
            ...(kind === 'business-decision'
              ? { question: 'Which business permission applies?' }
              : {}),
          },
        },
      },
    });
    assert.equal(
      review.status,
      kind === 'required' ? 'no-gaps' : 'needs-business-decision',
    );
    assert.throws(
      () =>
        describeNativeInstanceSelectionFeedback(f.input, { selection, review }),
      /cannot automatically bypass/,
    );
  }
  let calls = 0;
  const outside = await nativeOutsideScopeReviewFixture();
  const empty = resolveNativeInstanceSelection({
    ...outside.input,
    proposal: { instances: [], gaps: [] },
  });
  const review = await reviewNativeInstanceSelection({
    ...outside.input,
    selection: empty,
    reviewInstances: true,
    model: model(
      {
        assessments: {},
        instanceAssessments: {},
        coverageAssessment: {
          kind: 'covered',
          reason: 'Only the existing single API response is requested.',
        },
      },
      () => {
        calls++;
      },
    ),
  });
  assert.equal(calls, 1);
  assert.deepEqual(review.proposal, {
    assessments: {},
    instanceAssessments: {},
    coverageAssessment: {
      kind: 'covered',
      reason: 'Only the existing single API response is requested.',
    },
  });
  assert.equal(review.status, 'no-gaps');
});

test('review mode changes during a model call preserve failure rather than accepting a stale role judgment', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const input = { ...f.input, selection: f.selection, reviewInstances: true };
  const proposal = {
    ...f.reviewProposal,
    coverageAssessment: {
      kind: 'needs-reselection',
      reason: 'A fresh selection is required for the original scope.',
    },
    instanceAssessments: Object.fromEntries(
      f.selection.instances.map((role) => [
        role.id,
        Object.values(f.reviewProposal.assessments)[0],
      ]),
    ),
  };
  const valid = await reviewNativeInstanceSelection({
    ...input,
    model: model(proposal),
  });
  assert.equal(valid.reviewInstances, true);
  const mutable = { ...input };
  mutable.model = model(proposal, () => {
    delete mutable.reviewInstances;
  });
  await assert.rejects(
    reviewNativeInstanceSelection(mutable),
    /source changed/,
  );
});

test('outside-scope review keeps closed-shape and source-identity validation without model-authored quotes', async () => {
  const { input, selection, reviewProposal } =
    await nativeOutsideScopeReviewFixture();
  const id = selection.gaps[0].id;
  const create = (proposal) =>
    createNativeInstanceSelectionReview({
      ...input,
      selection,
      proposal,
    });
  for (const alter of [
    (value) => {
      value.assessments[id].sourceQuote = 'An invented exclusion';
    },
    (value) => {
      value.assessments[id].callIds = ['metrics'];
    },
    (value) => {
      delete value.assessments[id];
    },
    (value) => {
      value.assessments.extra = clone(value.assessments[id]);
    },
  ]) {
    const changed = clone(reviewProposal);
    alter(changed);
    assert.throws(() => create(changed));
  }
  const review = create(reviewProposal);
  assert.deepEqual(review.source, { id: 'scenario', text: input.scenario });
  assert.throws(() =>
    validateNativeInstanceSelectionReview({
      ...input,
      selection,
      review: {
        ...review,
        source: { ...review.source, text: 'Changed source' },
      },
    }),
  );
  assert.throws(
    () =>
      validateNativeInstanceSelectionReview({
        ...input,
        scenario: input.scenario + ' changed',
        selection,
        review,
      }),
    /stale|modified/,
  );
});

test('native review preserves original Markdown spacing without asking the model to reproduce source text', async () => {
  const f = await nativeOutsideScopeReviewFixture();
  const input = {
    ...f.input,
    scenario: '| original       | unchanged |\n\n' + f.input.scenario,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: f.proposal,
  });
  const review = await reviewNativeInstanceSelection({
    ...input,
    selection,
    model: model(f.reviewProposal, ({ schema }) => {
      assert.equal(JSON.stringify(schema).includes('sourceQuote'), false);
      assert.equal(JSON.stringify(schema).includes('sourceId'), false);
    }),
  });
  assert.equal(review.status, 'needs-reselection');
  assert.equal(review.source.text, input.scenario);
  assert.equal(
    Object.hasOwn(
      review.proposal.assessments[selection.gaps[0].id],
      'sourceQuote',
    ),
    false,
  );
  validateNativeInstanceSelectionReview({ ...input, selection, review });
});

test('native review decisions survive absent or malformed display text without weakening real references', async () => {
  const f = await nativeSelectionReviewFixture();
  for (const reason of [
    undefined,
    '',
    ' ',
    3,
    false,
    null,
    [],
    { text: 'display only' },
  ]) {
    const proposal = clone(f.reviewProposal);
    for (const assessment of Object.values(proposal.assessments)) {
      delete assessment.reason;
      if (reason !== undefined) assessment.reason = reason;
    }
    const before = clone(proposal);
    const review = await reviewNativeInstanceSelection({
      ...f.input,
      selection: f.selection,
      model: model(proposal),
    });
    assert.equal(review.status, 'needs-reselection');
    assert.deepEqual(proposal, before);
    for (const assessment of Object.values(review.proposal.assessments))
      assert.equal(Object.hasOwn(assessment, 'reason'), false);
    validateNativeInstanceSelectionReview({
      ...f.input,
      selection: f.selection,
      review,
    });
    const invalid = clone(proposal);
    invalid.assessments[f.selection.gaps[1].id].callIds = ['not-supplied'];
    assert.throws(() =>
      createNativeInstanceSelectionReview({
        ...f.input,
        selection: f.selection,
        proposal: invalid,
      }),
    );
  }
});

test('an outside-scope judgment cannot bypass another unsupported need or genuine business decision', async () => {
  const { input, proposal, reviewProposal } =
    await nativeOutsideScopeReviewFixture();
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      ...proposal,
      gaps: [
        ...proposal.gaps,
        { description: 'An independent required behavior remains unresolved.' },
      ],
    },
  });
  const [outside, required] = selection.gaps;
  const outsideAssessment = Object.values(reviewProposal.assessments)[0];
  for (const kind of ['unsupported-native-behavior', 'business-decision']) {
    const review = createNativeInstanceSelectionReview({
      ...input,
      selection,
      proposal: {
        assessments: {
          [outside.id]: outsideAssessment,
          [required.id]: {
            kind,
            reason:
              'Independent required work is not removed by the other assessment.',
            ...(kind === 'business-decision'
              ? { question: 'Which permitted business behavior is required?' }
              : {}),
          },
        },
      },
    });
    assert.equal(
      review.status,
      kind === 'business-decision'
        ? 'needs-business-decision'
        : 'unavailable-native-behavior',
    );
    assert.throws(
      () =>
        describeNativeInstanceSelectionFeedback(input, { selection, review }),
      /cannot automatically bypass/,
    );
    assert.equal(selection.gaps.length, 2);
  }
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
