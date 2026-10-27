import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionGoalReview,
  createWorkflowConnectionGoalReview,
  validateWorkflowConnectionGoalReview,
  applyWorkflowConnectionStep,
} from '@openapi-flow/core';
import {
  reviewWorkflowConnectionGoals,
  planWorkflowConnectionGoalRecovery,
  planWorkflowConnectionGoals,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';
import { connectionGoalReviewOutput } from './fixtures/connection-goal-review-fixture.mjs';
import { incrementalConnectionPatch } from './fixtures/incremental-connection-fixture.mjs';

function context() {
  const fixture = initialConnectionRecoveryFixture();
  const session = createWorkflowConnectionSession({
    ...fixture.broken,
    goals: fixture.goals.filter((goal) => goal.kind !== 'independent'),
  });
  const input = { ...fixture.broken, session };
  return {
    fixture,
    session,
    input,
    description: describeWorkflowConnectionGoalReview(input),
  };
}
function proposal(description, status = 'covered') {
  const output = connectionGoalReviewOutput(description, status);
  return {
    assessments: Object.entries(output.assessments).map(
      ([factId, assessment]) => ({ factId, ...assessment }),
    ),
  };
}

test('goal coverage review retains every original clause and actual mapping, and code derives non-acceptance separately from structural validity', () => {
  const { input, description } = context();
  assert.equal(
    description.materials.apiCalls.find((item) => item.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'detail',
  );
  assert.equal(description.requirements[0].text, input.requirements[0].text);
  assert.equal(
    description.scope,
    'initial-goal-interpretation-before-connection-planning',
  );
  assert.equal(Object.hasOwn(description, 'context'), false);
  assert.equal(Object.hasOwn(description, 'edges'), false);
  assert.deepEqual(description.codePolicies[0].protectedEdges, []);
  const review = createWorkflowConnectionGoalReview({
    ...input,
    proposal: proposal(description, 'contradicted'),
  });
  assert.equal(review.accepted, false);
  validateWorkflowConnectionGoalReview({ ...input, review });
  assert.throws(
    () =>
      validateWorkflowConnectionGoalReview({
        ...input,
        review: { ...review, accepted: true },
      }),
    /differs/,
  );
  const accepted = createWorkflowConnectionGoalReview({
    ...input,
    proposal: proposal(description),
  });
  assert.equal(
    accepted.accepted,
    true,
    'Model coverage remains model judgment, not deterministic proof of natural-language meaning',
  );
});

test('all fact identities, actual goal evidence, exact quotes and source receipts are required without normalizing data', () => {
  const { input, description } = context();
  const original = proposal(description, 'missing');
  for (const altered of [
    { assessments: [] },
    { assessments: [...original.assessments, ...original.assessments] },
    { assessments: [{ ...original.assessments[0], factId: 'foreign' }] },
    {
      assessments: [
        { ...original.assessments[0], status: 'covered', goalIds: [] },
      ],
    },
    { assessments: [{ ...original.assessments[0], goalIds: ['foreign'] }] },
    { assessments: [{ ...original.assessments[0], policyIds: ['foreign'] }] },
    {
      assessments: [
        {
          ...original.assessments[0],
          policyIds: [
            'preserve-protected-original-edges',
            'preserve-protected-original-edges',
          ],
        },
      ],
    },
    {
      assessments: [
        { ...original.assessments[0], sourceQuotes: ['invented user intent'] },
      ],
    },
    { ...original, accepted: true },
  ])
    assert.throws(() =>
      createWorkflowConnectionGoalReview({ ...input, proposal: altered }),
    );
  const review = createWorkflowConnectionGoalReview({
    ...input,
    proposal: original,
  });
  for (const key of ['sessionId', 'sourceFingerprint', 'goalFingerprint'])
    assert.throws(() =>
      validateWorkflowConnectionGoalReview({
        ...input,
        review: {
          ...review,
          [key]:
            key === 'sessionId'
              ? '00000000-0000-4000-8000-000000000000'
              : 'a'.repeat(64),
        },
      }),
    );
  assert.throws(() =>
    validateWorkflowConnectionGoalReview({
      ...input,
      scenario: 'Changed requirement context',
      review,
    }),
  );
});

test('multiple original requirements each need their own row and quotes cannot be borrowed from another fact', () => {
  const fixture = initialConnectionRecoveryFixture();
  const extra = {
    id: 'preserve-values',
    text: '원본 응답의 값과 타입을 바꾸지 않는다.',
    sources: [
      {
        kind: 'message',
        messageId: 'request',
        quote: '원본 응답의 값과 타입을 바꾸지 않는다.',
      },
    ],
  };
  const source = {
    ...fixture.source,
    requirements: [...fixture.source.requirements, extra],
  };
  const session = createWorkflowConnectionSession({
    ...source,
    goals: [
      ...fixture.goals,
      {
        kind: 'semantic',
        factIds: [extra.id],
        reason: 'Preserve original values and types.',
      },
    ],
  });
  const input = { ...source, session },
    description = describeWorkflowConnectionGoalReview(input);
  const proposed = proposal(description);
  assert.equal(proposed.assessments.length, 2);
  assert.equal(
    createWorkflowConnectionGoalReview({ ...input, proposal: proposed })
      .accepted,
    true,
  );
  assert.throws(
    () =>
      createWorkflowConnectionGoalReview({
        ...input,
        proposal: { assessments: [proposed.assessments[0]] },
      }),
    /exactly once/,
  );
  proposed.assessments[1].sourceQuotes = [source.requirements[0].text];
  assert.throws(
    () => createWorkflowConnectionGoalReview({ ...input, proposal: proposed }),
    /not an exact part/,
  );
});

test('actual code-policy evidence is distinct from planned goal evidence and never requires an already-built working graph', () => {
  const { input, description } = context();
  const proposed = proposal(description);
  proposed.assessments[0].goalIds = [];
  proposed.assessments[0].policyIds = ['preserve-protected-original-edges'];
  const review = createWorkflowConnectionGoalReview({
    ...input,
    proposal: proposed,
  });
  assert.equal(
    review.accepted,
    true,
    'Semantic matching of this policy to a full fact still belongs to the model, not code',
  );
  assert.equal(Object.hasOwn(description, 'rootNodeIds'), false);
  assert.equal(Object.hasOwn(description, 'inspection'), false);
});

test('goal/material coverage may be replayed after edge-only revisions but is not a claim about the final graph', () => {
  const fixture = initialConnectionRecoveryFixture();
  const session = createWorkflowConnectionSession({
    ...fixture.source,
    goals: fixture.goals,
  });
  const input = { ...fixture.source, session },
    description = describeWorkflowConnectionGoalReview(input);
  const review = createWorkflowConnectionGoalReview({
    ...input,
    proposal: proposal(description),
  });
  const result = applyWorkflowConnectionStep({
    ...input,
    expected: {
      sessionId: session.id,
      sourceFingerprint: session.sourceFingerprint,
      revision: session.revision,
    },
    proposal: incrementalConnectionPatch({
      addEdges: fixture.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  });
  assert.equal(result.status, 'accepted');
  assert.doesNotThrow(() =>
    validateWorkflowConnectionGoalReview({
      ...fixture.source,
      session: result.session,
      review,
    }),
  );
  assert.equal(review.accepted, true);
  assert.equal(result.session.revision, 1);
});

test('one independent call uses code-owned fact keys and actual goal enums, with no model-generated acceptance or source metadata', async () => {
  const { input } = context();
  const model = recoveryQueueModel([
    ({ payload, schema }) => {
      assert.ok(!Object.hasOwn(schema.properties, 'accepted'));
      assert.ok(!Object.hasOwn(schema.properties, 'sessionId'));
      assert.deepEqual(schema.required, ['assessments']);
      assert.deepEqual(
        Object.keys(schema.properties.assessments.properties),
        input.requirements.map((fact) => fact.id),
      );
      return connectionGoalReviewOutput(payload, 'missing');
    },
  ]);
  const review = await reviewWorkflowConnectionGoals({ ...input, model });
  assert.equal(review.accepted, false);
  assert.equal(model.requests.length, 1);
});

test('a negative semantic judgment alone can request the actual originating stage, without inventing code conflicts or modifying requirements', async () => {
  const { input, fixture, session, description } = context();
  const review = createWorkflowConnectionGoalReview({
    ...input,
    proposal: proposal(description, 'contradicted'),
  });
  const candidate = { session, review };
  const model = recoveryQueueModel(
    [{ decision: fixture.request }],
    ({ payload }) => {
      assert.deepEqual(payload.rejectedGoalReviews, [candidate]);
      assert.equal(payload.rejectedProposals.length, 0);
    },
  );
  const result = await planWorkflowConnectionGoalRecovery({
    ...fixture.broken,
    model,
    rejectedProposals: [],
    rejectedGoalReviews: [candidate],
  });
  assert.equal(result.kind, 'replan-materials');
  assert.deepEqual(result.request, fixture.request);
  await assert.rejects(
    planWorkflowConnectionGoalRecovery({
      ...fixture.broken,
      model,
      rejectedProposals: [],
      rejectedGoalReviews: [{ session, review: { ...review, accepted: true } }],
    }),
  );
  assert.equal(model.requests.length, 1);
});

test('transport, cancellation, unknown review fields and concurrent candidate changes are not turned into accepted coverage', async () => {
  for (const mode of ['transport', 'cancel', 'malformed', 'mutation']) {
    const { input } = context();
    const cause = new Error('original review transport failure');
    const abort = new globalThis.AbortController();
    if (mode === 'cancel') abort.abort(cause);
    const model = recoveryQueueModel([
      ({ payload }) => {
        if (mode === 'transport') throw cause;
        if (mode === 'mutation')
          input.session.goals[0].decision.reason =
            'Changed while awaiting review';
        if (mode === 'malformed') return { assessments: {} };
        return connectionGoalReviewOutput(payload);
      },
    ]);
    await assert.rejects(
      reviewWorkflowConnectionGoals({ ...input, model, signal: abort.signal }),
    );
    assert.equal(model.requests.length, mode === 'cancel' ? 0 : 1);
  }
});

test('changed review evidence is input failure, including malformed output, and cannot become another goal-replanning attempt', async () => {
  for (const malformed of [false, true]) {
    const { input, fixture, description, session } = context();
    const candidate = {
      session,
      review: createWorkflowConnectionGoalReview({
        ...input,
        proposal: proposal(description, 'contradicted'),
      }),
    };
    const model = recoveryQueueModel([
      () => {
        candidate.review.assessments[0].reason =
          'Changed independently during the model call';
        return malformed
          ? { goals: 'invalid' }
          : {
              goals: fixture.goals.filter(
                (goal) => goal.kind !== 'independent',
              ),
            };
      },
    ]);
    let failure;
    try {
      await planWorkflowConnectionGoals({
        ...fixture.broken,
        model,
        rejectedGoalReviews: [candidate],
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.diagnostic.stage, 'input-validation');
    assert.equal(failure?.diagnostic.code, 'PLANNING_INPUT_INVALID');
    assert.equal(
      createWorkflowConnectionGoalRejection({
        ...fixture.broken,
        error: failure,
      }),
      undefined,
    );
    if (malformed) assert.ok(failure.cause instanceof AggregateError);
    assert.equal(model.requests.length, 1);
  }
});
