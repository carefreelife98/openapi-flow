import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import { recoveryQueueModel } from './fixtures/initial-connection-recovery-fixture.mjs';
import {
  createWorkflowConnectionSession,
  createWorkflowConnectionOutline,
  describeWorkflowConnectionOutline,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionOutlineStep,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  connectionOutlineFixture,
  connectionOutlineProposal,
} from './fixtures/connection-outline-fixture.mjs';

function prepare() {
  const fixture = connectionOutlineFixture();
  const session = createWorkflowConnectionSession({
    ...fixture.source,
    goals: [
      ...fixture.goals,
      {
        kind: 'route',
        from: 'source',
        output: 'main',
        to: 'detail',
        factIds: ['intent'],
        reason: 'Retain the actual source route.',
      },
      {
        kind: 'semantic',
        factIds: ['intent'],
        reason: 'The final summary must preserve the original results.',
      },
    ],
  });
  const input = { ...fixture.source, session };
  const proposal = connectionOutlineProposal();
  const outline = createWorkflowConnectionOutline({ ...input, proposal });
  return { ...fixture, input, proposal, outline };
}

test('core derives associations for every typed structural goal and preserves all goals globally without model ID coverage', () => {
  const { input, outline, proposal } = prepare();
  const before = JSON.stringify(input);
  assert.deepEqual(
    outline.goalIds,
    input.session.goals.map((goal) => goal.id),
  );
  for (const goal of input.session.goals) {
    const associated = outline.bundles.filter((bundle) =>
      bundle.goalIds.includes(goal.id),
    );
    if (goal.decision.kind === 'semantic') {
      assert.equal(associated.length, 1);
      assert.equal(associated[0].scope, 'global');
      assert.ok(outline.globalGoalIds.includes(goal.id));
    } else {
      assert.ok(associated.length > 0);
      assert.equal(
        outline.globalGoalIds.includes(goal.id),
        ['precedence', 'route'].includes(goal.decision.kind),
      );
    }
  }
  const legacy = globalThis.structuredClone(proposal);
  for (const bundle of legacy.bundles) {
    bundle.goalIds = []; // The original failure: valid goals were not repeated by the model.
    bundle.factIds = [];
    bundle.reason = 'Optional UI trace, never proof of coverage.';
  }
  const accepted = createWorkflowConnectionOutline({
    ...input,
    proposal: legacy,
  });
  assert.equal(accepted.id, outline.id);
  assert.deepEqual(accepted.goalIds, outline.goalIds);
  assert.deepEqual(accepted.globalGoalIds, outline.globalGoalIds);
  assert.deepEqual(
    accepted.bundles.map((bundle) => bundle.goalIds),
    outline.bundles.map((bundle) => bundle.goalIds),
  );
  assert.equal(accepted.bundles[0].reason, legacy.bundles[0].reason);
  assert.equal(JSON.stringify(input), before);
});

test('valid legacy trace IDs need not cover all facts/goals and do not change core-derived associations', () => {
  const { input, proposal, outline } = prepare();
  const annotated = globalThis.structuredClone(proposal);
  annotated.bundles[0].goalIds = [input.session.goals.at(-1).id];
  annotated.bundles[0].factIds = ['intent'];
  annotated.bundles[0].reason = 'Retained evidence annotation.';
  const result = createWorkflowConnectionOutline({
    ...input,
    proposal: annotated,
  });
  assert.deepEqual(result.bundles[0].goalIds, outline.bundles[0].goalIds);
  assert.deepEqual(result.bundles[0].factIds, ['intent']);
  assert.equal(result.bundles[0].reason, annotated.bundles[0].reason);
  for (const [field, value] of [
    ['goalIds', ['unknown-goal']],
    ['goalIds', [input.session.goals[0].id, input.session.goals[0].id]],
    ['factIds', ['unknown-fact']],
    ['factIds', ['intent', 'intent']],
    ['nodeIds', ['source', 'source']],
  ]) {
    const invalid = globalThis.structuredClone(proposal);
    invalid.bundles[0][field] = value;
    assert.throws(
      () => createWorkflowConnectionOutline({ ...input, proposal: invalid }),
      /distinct actual supplied identities/,
    );
  }
});

test('cross-bundle goals stay globally pending and semantic completion cannot be bypassed when all graph bundles finish', () => {
  const { input, outline, patches, plan } = prepare();
  let session = input.session;
  const initial = describeWorkflowConnectionOutline({ ...input, outline });
  const cross = session.goals.find(
    (goal) => goal.decision.kind === 'precedence',
  );
  const semantic = session.goals.find(
    (goal) => goal.decision.kind === 'semantic',
  );
  assert.ok(initial.globalUnmetGoalIds.includes(cross.id));
  assert.ok(initial.globalUnmetGoalIds.includes(semantic.id));
  for (const [index, proposal] of patches.entries()) {
    const result = applyWorkflowConnectionOutlineStep({
      ...input,
      session,
      outline,
      bundleId: outline.bundles[index].id,
      expected: describeWorkflowConnectionStep({ ...input, session }).expected,
      proposal,
    });
    assert.equal(result.status, 'accepted');
    assert.equal(result.inspection.ready, false);
    session = result.session;
  }
  const graphDone = describeWorkflowConnectionOutline({
    ...input,
    session,
    outline,
  });
  assert.deepEqual(graphDone.step.inspection.pendingNodeIds, []);
  assert.deepEqual(graphDone.step.inspection.openBoundaries, []);
  const pending = graphDone.bundles.filter((bundle) => bundle.pending);
  assert.equal(pending.length, 1);
  const globalBundle = outline.bundles.find(
    (bundle) => bundle.id === pending[0].bundleId,
  );
  assert.equal(globalBundle.scope, 'global');
  assert.deepEqual(
    globalBundle.nodeIds,
    graphDone.step.context.nodes.map((node) => node.id),
  );
  assert.deepEqual(globalBundle.goalIds, outline.globalGoalIds);
  assert.deepEqual(graphDone.globalUnmetGoalIds, [semantic.id]);
  assert.deepEqual(graphDone.step.inspection.unmetGoalIds, [semantic.id]);
  assert.throws(
    () => finalizeWorkflowConnectionSession({ ...input, session }),
    /incomplete/,
  );
  const base = {
    ...input,
    session,
    outline,
    bundleId: globalBundle.id,
    expected: graphDone.step.expected,
  };
  const missing = applyWorkflowConnectionOutlineStep({
    ...base,
    proposal: {
      kind: 'request-completion',
      assessments: [],
      reason: 'Request whole-session completion.',
    },
  });
  assert.equal(missing.status, 'rejected');
  const unsatisfied = applyWorkflowConnectionOutlineStep({
    ...base,
    proposal: {
      kind: 'request-completion',
      assessments: [
        {
          goalId: semantic.id,
          satisfied: false,
          nodeIds: ['summary'],
          reason: 'The original-result meaning is not yet established.',
        },
      ],
      reason: 'Keep the unresolved semantic obligation pending.',
    },
  });
  assert.equal(unsatisfied.status, 'accepted');
  assert.equal(unsatisfied.inspection.ready, false);
  const stillPending = describeWorkflowConnectionOutline({
    ...input,
    session: unsatisfied.session,
    outline,
  });
  assert.equal(
    stillPending.bundles.find((bundle) => bundle.bundleId === globalBundle.id)
      .pending,
    true,
  );
  assert.throws(
    () =>
      finalizeWorkflowConnectionSession({
        ...input,
        session: unsatisfied.session,
      }),
    /incomplete/,
  );
  const complete = applyWorkflowConnectionOutlineStep({
    ...base,
    session: unsatisfied.session,
    expected: stillPending.step.expected,
    proposal: {
      kind: 'request-completion',
      assessments: [
        {
          goalId: semantic.id,
          satisfied: true,
          nodeIds: ['summary'],
          reason: 'The summary preserves the original results.',
        },
      ],
      reason: 'Assess the remaining global semantic obligation.',
    },
  });
  assert.equal(complete.status, 'accepted');
  assert.equal(complete.inspection.ready, true);
  assert.deepEqual(complete.session.goals, input.session.goals);
  assert.deepEqual(
    finalizeWorkflowConnectionSession({ ...input, session: complete.session })
      .edges,
    plan.edges,
  );
});

test('stored global goal inventory and derived associations cannot be forged or normalized', () => {
  const { input, outline } = prepare();
  for (const mutate of [
    (value) => {
      value.goalIds.pop();
    },
    (value) => {
      value.globalGoalIds = [];
    },
    (value) => {
      value.bundles[0].goalIds = [];
    },
    (value) => {
      value.goalIds.push('unknown-goal');
    },
    (value) => {
      value.bundles.find((bundle) => bundle.scope === 'global').purpose =
        'Forged global purpose';
    },
    (value) => {
      value.bundles.find((bundle) => bundle.scope === 'global').goalIds = [];
    },
  ]) {
    const invalid = globalThis.structuredClone(outline);
    mutate(invalid);
    assert.throws(
      () => describeWorkflowConnectionOutline({ ...input, outline: invalid }),
      /differs/,
    );
  }
});

test('the existing host step and assessment path can schedule code-owned global work after local graph work finishes', async () => {
  const fixture = prepare();
  let localSteps = 0;
  let globalSelections = 0;
  const model = recoveryQueueModel([
    {
      goals: fixture.input.session.goals.map(({ decision }) => {
        if (decision.kind !== 'route') return decision;
        const { from, output, ...goal } = decision;
        assert.equal(output, 'main');
        return { ...goal, source: { nodeId: from } };
      }),
    },
    fixture.proposal,
    ...fixture.modelPatches,
    ({ payload }) => {
      assert.equal(payload.planningOutline.selectedBundle.scope, 'global');
      assert.deepEqual(payload.goals, fixture.input.session.goals);
      assert.equal(payload.inspection.ready, false);
      const semantic = payload.goals.find(
        (goal) => goal.decision.kind === 'semantic',
      );
      assert.deepEqual(payload.inspection.unmetGoalIds, [semantic.id]);
      return {
        decision: {
          kind: 'request-completion',
          assessments: [
            {
              goalId: semantic.id,
              satisfied: true,
              nodeIds: ['summary'],
              reason:
                'Explicit model assessment of the original-result summary.',
            },
          ],
          reason:
            'Assess the remaining original semantic goal against the complete graph.',
        },
      };
    },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy: {
      maxModelInvocations: 8,
      maxRejectedProposals: 2,
      deadlineMs: 30000,
    },
    outlinePlanning: {
      model,
      selectBundle: (description) => {
        if (localSteps < fixture.patches.length)
          return description.outline.bundles[localSteps++].id;
        const pending = description.bundles.filter((bundle) => bundle.pending);
        assert.equal(
          pending.length,
          1,
          'Global work remains schedulable when all local graph bundles finish',
        );
        const bundle = description.outline.bundles.find(
          (bundle) => bundle.id === pending[0].bundleId,
        );
        assert.equal(bundle.scope, 'global');
        globalSelections++;
        return bundle.id;
      },
    },
  });
  const state = await graph.invoke({});
  assert.equal(state.status, 'complete');
  assert.equal(globalSelections, 1);
  assert.equal(state.session.revision, 4);
  assert.equal(
    model.requests.length,
    6,
    'Completion still requires its explicit model assessment',
  );
  assert.deepEqual(state.session.goals, fixture.input.session.goals);
  assert.deepEqual(state.plan.edges, fixture.plan.edges);
});
