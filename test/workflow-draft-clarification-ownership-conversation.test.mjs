import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pendingRequirementScopeFixture,
  pendingRequirementScopeModel,
  runPendingRequirementScope,
  beginPendingRequirementScope,
  resumePendingRequirementScope,
} from './fixtures/workflow-draft-requirement-scope-fixture.mjs';

test('owned API and replacement-field concerns use existing typed questions and finish the same plan without generic workflow blockers', async () => {
  const model = pendingRequirementScopeModel('api', { ownedConcerns: true });
  const f = await pendingRequirementScopeFixture({ model });
  const { state, checkpoints } = await runPendingRequirementScope(f);
  const initial = checkpoints[0].state;
  assert.deepEqual(initial.questions.map((question) => question.kind).sort(), [
    'api-input',
    'requirement',
  ]);
  assert.equal(initial.__interrupt__[0].value.clarificationOwnership.length, 2);
  assert.equal(state.draft.requirements.length, 1);
  assert.equal(
    state.plan.steps.filter(
      (step) => step.decision.kind === 'needs-clarification',
    ).length,
    2,
  );
  assert.deepEqual(
    model.calls.map((call) => call.name),
    [
      'analyze_workflow_draft_edit',
      'plan_draft_api_call_bindings',
      'generate_draft_api_call_arguments',
      'plan_draft_connection_edit',
    ],
  );
  for (const call of model.calls.slice(1)) {
    assert.equal(
      call.payload.planningClarifications.length,
      call.name === 'generate_draft_api_call_arguments' ? 1 : 0,
    );
    if (call.payload.planningClarifications.length === 0) continue;
    assert.equal(
      call.payload.planningClarifications[0].owner.stepId,
      initial.plan.steps[0].id,
    );
    assert.deepEqual(
      call.payload.planningClarifications[0].sources,
      initial.plan.steps[2].decision.sources,
    );
  }
  assert.equal(
    new Set(checkpoints.map((entry) => entry.state.plan.id)).size,
    1,
  );
  const routing = model.calls.find(
    (call) => call.name === 'plan_draft_connection_edit',
  );
  assert.deepEqual(routing.payload.apiInstances[0].values, {
    path: { id: 'fixture-record' },
  });
});

test('an owned concern never invents missing native producer material or bypasses final review', async () => {
  const model = pendingRequirementScopeModel('native', { ownedConcerns: true });
  const f = await pendingRequirementScopeFixture({ kind: 'native', model });
  let state = await beginPendingRequirementScope(f);
  assert.deepEqual(state.questions.map((question) => question.kind).sort(), [
    'native-materials',
    'requirement',
  ]);
  const question = state.questions.find(
    (question) => question.kind === 'requirement',
  );
  state = await resumePendingRequirementScope(f, state, {
    action: 'answer-requirement',
    messageId: 'typed-owned-native',
    stepId: question.stepId,
    requirement: {
      text: 'Use the selected native role after its producer is supplied.',
      state: 'confirmed',
      scope: { kind: 'nodes', nodeIds: [state.plan.steps[0].newNodeId] },
    },
  });
  assert.deepEqual(state.issues, []);
  assert.deepEqual(
    state.questions.map((question) => question.kind),
    ['native-materials'],
  );
  assert.equal(state.candidate, undefined);
  assert.equal(state.artifact, undefined);
  assert.equal(model.calls.length, 1);
  state = await resumePendingRequirementScope(f, state, { action: 'approve' });
  assert.ok(state.issues.length);
  assert.deepEqual(state.draft, f.draft);
});
