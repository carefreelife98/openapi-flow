import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pendingRequirementScopeFixture,
  beginPendingRequirementScope,
  resumePendingRequirementScope,
  runPendingRequirementScope,
} from './fixtures/workflow-draft-requirement-scope-fixture.mjs';

test('a typed requirement answer may target an allocated API identity while its real required input is still pending', async () => {
  const f = await pendingRequirementScopeFixture();
  let state = await beginPendingRequirementScope(f);
  const step = state.plan.steps.find(
    (step) => step.decision.kind === 'add-api-call',
  );
  const question = state.questions.find(
    (question) => question.kind === 'requirement',
  );
  assert.ok(state.questions.some((question) => question.kind === 'api-input'));
  assert.equal(state.candidate, undefined);
  assert.equal(state.draft.apiCalls.length, 0);
  state = await resumePendingRequirementScope(f, state, {
    action: 'answer-requirement',
    messageId: 'typed-new-role-purpose',
    stepId: question.stepId,
    requirement: {
      text: 'The new record lookup is the confirmed purpose.',
      state: 'confirmed',
      scope: { kind: 'nodes', nodeIds: [step.newNodeId] },
    },
  });
  assert.deepEqual(state.issues, []);
  assert.equal(
    state.questions.some((question) => question.kind === 'requirement'),
    false,
  );
  assert.ok(state.questions.some((question) => question.kind === 'api-input'));
  assert.equal(state.candidate, undefined);
  assert.equal(state.draft.apiCalls.length, 0);
});

test('explicit API input completes the same reviewed plan without semantic, binding or argument model replay', async () => {
  const f = await pendingRequirementScopeFixture();
  const result = await runPendingRequirementScope(f);
  assert.deepEqual(
    f.model.calls.map((call) => call.name),
    [
      'analyze_workflow_draft_edit',
      'plan_draft_api_call_bindings',
      'generate_draft_api_call_arguments',
      'plan_draft_connection_edit',
    ],
  );
  assert.equal(
    new Set(result.checkpoints.map((entry) => entry.state.plan.id)).size,
    1,
  );
  assert.equal(result.state.draft.apiCalls.length, 1);
  assert.equal(result.state.artifact.triggerConnected, false);
  assert.deepEqual(
    result.state.artifact.deploymentRequirements.map((entry) => entry.fields),
    [['baseUrl']],
  );
});

test('a selected native identity accepts typed scope while missing producer material remains a real blocking question', async () => {
  const f = await pendingRequirementScopeFixture({ kind: 'native' });
  let state = await beginPendingRequirementScope(f);
  const step = state.plan.steps.find(
    (step) => step.decision.kind === 'add-native-node',
  );
  const question = state.questions.find(
    (question) => question.kind === 'requirement',
  );
  assert.ok(
    question.requirementEdit.nodes.some((node) => node.id === step.newNodeId),
  );
  const plan = globalThis.structuredClone(state.plan);
  state = await resumePendingRequirementScope(f, state, {
    action: 'answer-requirement',
    messageId: 'typed-native-purpose',
    stepId: question.stepId,
    requirement: {
      text: 'Split the selected API array once its producer is supplied.',
      state: 'confirmed',
      scope: { kind: 'nodes', nodeIds: [step.newNodeId] },
    },
  });
  assert.deepEqual(state.issues, []);
  assert.equal(
    state.questions.some((question) => question.kind === 'requirement'),
    false,
  );
  assert.ok(
    state.questions.some((question) => question.kind === 'native-materials'),
  );
  assert.deepEqual(state.plan, plan);
  assert.deepEqual(state.draft, f.draft);
  assert.equal(state.candidate, undefined);
  assert.equal(state.artifact, undefined);
  assert.equal(f.model.calls.length, 1);
});
