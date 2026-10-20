import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from '@langchain/langgraph';
import {
  applyDraftChangeSet,
  approveWorkflowDraft,
  inspectDraftReadiness,
  describeWorkflowDraftEditContext,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftRequirementEdit,
  createWorkflowDraftRequirementAnswerSchema,
  createWorkflowDraftEditCandidateContext,
  assembleWorkflowDraftEdit,
  stageWorkflowDraftEdit,
  describeWorkflowDraftClarificationOwnership,
} from '@openapi-flow/core';
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import {
  workflowDraftFixture,
  scopedRequirement,
} from './fixtures/workflow-draft-fixture.mjs';
import {
  requirementRestorationModel,
  runRequirementRestorationConversation,
  requirementRestorationConversation,
} from './fixtures/workflow-draft-requirement-restoration-fixture.mjs';

async function fixture() {
  const base = await workflowDraftFixture([scopedRequirement('confirmed')]);
  const context = {
    ...base.context,
    messages: [
      ...base.context.messages,
      { id: 'withdraw', text: 'Withdraw only purpose.' },
      {
        id: 'restore',
        text: 'Restore only purpose with an explicit typed answer.',
      },
    ],
  };
  const draft = applyDraftChangeSet({
    draft: base.draft,
    context,
    changeSet: {
      baseRevision: 0,
      changes: [
        {
          kind: 'remove-requirement',
          requirementId: 'purpose',
          sourceMessageIds: ['withdraw'],
        },
      ],
    },
  }).draft;
  return { ...base, context, draft, requestMessageIds: ['restore'] };
}

function planFor(
  input,
  requirementId = 'purpose',
  kind = 'restore-requirement',
) {
  return createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind,
          requirementId,
          instruction: input.context.messages.at(-1).text,
          sources: [
            {
              kind: 'message',
              messageId: 'restore',
              quote: input.context.messages.at(-1).text,
            },
          ],
        },
      ],
    },
  });
}

function resolution(
  plan,
  scope = { kind: 'nodes', nodeIds: ['c'] },
  state = 'confirmed',
) {
  return {
    kind: 'requirement',
    stepId: plan.steps[0].id,
    answerMessageId: 'typed-restore',
    text: 'Newly confirmed purpose, not copied historical text.',
    state,
    scope,
  };
}

test('restore is offered only for a latest removed history head, never active, unknown or already restored IDs', async () => {
  const input = await fixture();
  const described = describeWorkflowDraftEditContext(input);
  assert.deepEqual(described.draft.requirements, []);
  assert.deepEqual(
    described.removedRequirements.map((item) => item.id),
    ['purpose'],
  );
  described.removedRequirements[0].text = 'changed copy';
  assert.notEqual(
    input.draft.requirementHistory.at(-1).before.text,
    'changed copy',
  );
  assert.throws(() => planFor(input, 'invented'));
  assert.throws(() => planFor({ ...input, draft: createActive(input) }));
  const plan = planFor(input);
  const edit = { ...input, plan, resolutions: [resolution(plan)] };
  const result = assembleWorkflowDraftEdit(edit);
  const candidateContext = createWorkflowDraftEditCandidateContext(edit);
  assert.deepEqual(
    describeWorkflowDraftEditContext({
      draft: result.draft,
      context: candidateContext,
      requestMessageIds: ['restore'],
    }).removedRequirements,
    [],
  );
  assert.throws(() =>
    planFor({ ...input, draft: result.draft, context: candidateContext }),
  );
});

function createActive(input) {
  return {
    ...input.draft,
    requirements: input.content.requirements,
    revision: 0,
    approvals: [],
    requirementHistory: [input.draft.requirementHistory[0]],
  };
}

test('staged restoration awaits every required human field and never materializes historical values', async () => {
  const input = await fixture();
  const plan = planFor(input);
  const staged = stageWorkflowDraftEdit({ ...input, plan, resolutions: [] });
  assert.deepEqual(staged.pendingResolutionStepIds, [plan.steps[0].id]);
  assert.deepEqual(staged.content.requirements, []);
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, plan, resolutions: [] }),
    /Missing draft edit resolution/,
  );
  const description = describeWorkflowDraftRequirementEdit({
    ...input,
    plan,
    stepId: plan.steps[0].id,
  });
  assert.equal(description.action, 'restore');
  const schema = createWorkflowDraftRequirementAnswerSchema(description);
  for (const missing of ['text', 'state', 'scope', 'answerMessageId']) {
    const answer = resolution(plan);
    delete answer.stepId;
    delete answer.kind;
    delete answer[missing];
    assert.throws(() => schema.parse(answer));
  }
  const answer = resolution(plan);
  answer.scope = { kind: 'nodes', nodeIds: ['imagined'] };
  assert.throws(() =>
    createWorkflowDraftEditCandidateContext({
      ...input,
      plan,
      resolutions: [answer],
    }),
  );
  assert.deepEqual(input.draft.requirements, []);
});

test('restored history and approval impact derive from the explicit current answer; graph materials remain exact', async () => {
  const input = await fixture();
  input.draft = approveWorkflowDraft({
    ...input,
    expectedRevision: input.draft.revision,
    nodeIds: ['a', 'b', 'c'],
  });
  const plan = planFor(input);
  const edit = { ...input, plan, resolutions: [resolution(plan)] };
  const candidateContext = createWorkflowDraftEditCandidateContext(edit);
  const result = assembleWorkflowDraftEdit(edit);
  assert.equal(result.draft.requirementHistory.at(-1).kind, 'restored');
  assert.equal(
    result.draft.requirementHistory.at(-1).previousEntryId,
    input.draft.requirementHistory.at(-1).id,
  );
  assert.deepEqual(result.draft.requirements[0].sourceMessageIds, [
    'restore',
    'typed-restore',
  ]);
  assert.equal(result.draft.requirements[0].text, resolution(plan).text);
  assert.deepEqual(result.draft.apiCalls, input.draft.apiCalls);
  assert.deepEqual(result.draft.edges, input.draft.edges);
  assert.deepEqual(result.draft.nativeNodes, input.draft.nativeNodes);
  const readiness = inspectDraftReadiness({
    draft: result.draft,
    context: candidateContext,
  });
  assert.equal(readiness.nodes.find((n) => n.nodeId === 'a').reviewed, true);
  assert.equal(readiness.nodes.find((n) => n.nodeId === 'b').reviewed, true);
  assert.equal(readiness.nodes.find((n) => n.nodeId === 'c').reviewed, false);
  const changed = JSON.parse(JSON.stringify(result.draft));
  changed.requirementHistory.at(-1).previousEntryId = 'invented';
  assert.throws(() =>
    inspectDraftReadiness({ draft: changed, context: candidateContext }),
  );
});

test('restoring deferred intent blocks only its explicit scope and cannot conflict with another restoration decision', async () => {
  const input = await fixture();
  const plan = planFor(input);
  const edit = {
    ...input,
    plan,
    resolutions: [
      resolution(plan, { kind: 'nodes', nodeIds: ['c'] }, 'deferred'),
    ],
  };
  const candidateContext = createWorkflowDraftEditCandidateContext(edit);
  const result = assembleWorkflowDraftEdit(edit);
  const readiness = inspectDraftReadiness({
    draft: result.draft,
    context: candidateContext,
  });
  assert.equal(
    readiness.nodes.find((n) => n.nodeId === 'a').planningStatus,
    'ready',
  );
  assert.equal(
    readiness.nodes.find((n) => n.nodeId === 'c').planningStatus,
    'blocked-by-decision',
  );
  assert.throws(
    () =>
      createWorkflowDraftEditPlan({
        ...input,
        options: plan.options,
        proposal: {
          decisions: [
            plan.steps[0].decision,
            {
              ...plan.steps[0].decision,
              instruction: 'A conflicting second restoration.',
            },
          ],
        },
      }),
    /repeats or conflicts/,
  );
});

test('official host reviews restoration, rejects malformed scope, accepts fresh typed fields and makes one semantic call only', async () => {
  const model = requirementRestorationModel();
  const result = await runRequirementRestorationConversation(model);
  assert.equal(model.calls.length, 1);
  const call = model.calls[0];
  assert.deepEqual(call.payload.draft.requirements, []);
  assert.deepEqual(
    call.payload.draft.removedRequirements.map((item) => item.id),
    ['purpose'],
  );
  const encoded = JSON.stringify(call.schema);
  assert.ok(encoded.includes('restore-requirement'));
  assert.equal(encoded.includes('restoration-answer'), false);
  assert.equal(result.final.artifact.triggerConnected, true);
  assert.equal(result.final.draft.requirementHistory.at(-1).kind, 'restored');
});

test('semantic model cannot fabricate a restored state, replacement values or prior history evidence', async () => {
  const input = await fixture();
  for (const extra of [
    { text: 'copied' },
    { state: 'confirmed' },
    { scope: { kind: 'workflow' } },
    { history: [] },
  ]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            return {
              decisions: [
                {
                  kind: 'restore-requirement',
                  requirementId: 'purpose',
                  instruction: 'Restore purpose.',
                  sources: [{ kind: 'message', messageId: 'restore' }],
                  ...extra,
                },
              ],
            };
          },
        };
      },
    };
    await assert.rejects(
      analyzeWorkflowDraftEdit({
        ...input,
        model,
        options: { includeExplanations: false },
      }),
      /invalid/,
    );
  }
});

test('restoration owns only its typed requirements question, not a duplicate semantic or API-input concern', async () => {
  const input = await fixture();
  const seed = planFor(input);
  const concern = {
    kind: 'needs-clarification',
    instruction: 'Confirm replacement text, state and scope.',
    sources: seed.steps[0].decision.sources,
    owner: { kind: 'planning-step', decisionIndex: 0, stage: 'requirements' },
  };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: seed.options,
    proposal: { decisions: [seed.steps[0].decision, concern] },
  });
  const allOwners = describeWorkflowDraftClarificationOwnership({
    ...input,
    plan,
  });
  assert.equal(allOwners.length, 1);
  assert.equal(allOwners[0].owner.kind, 'planning-step');
  const owned = describeWorkflowDraftClarificationOwnership({
    ...input,
    plan,
    stage: 'requirements',
  });
  assert.equal(owned.length, 1);
  assert.equal(owned[0].owner.stepId, plan.steps[0].id);
  assert.throws(() =>
    createWorkflowDraftEditPlan({
      ...input,
      options: seed.options,
      proposal: {
        decisions: [
          seed.steps[0].decision,
          { ...concern, owner: { ...concern.owner, stage: 'api-arguments' } },
        ],
      },
    }),
  );
});

test('automatic review still pauses for explicit restoration fields and never invents a historical default', async () => {
  const model = requirementRestorationModel();
  const f = requirementRestorationConversation(model, 'automatic');
  const pending = await f.graph.invoke(
    {
      input: {
        initialDraft: f.draft,
        request: {
          id: 'auto-restore',
          text: 'Restore purpose only; ask for explicit text, state and scope.',
          expectedRevision: f.draft.revision,
        },
      },
    },
    f.config,
  );
  assert.equal(model.calls.length, 1);
  assert.deepEqual(pending.draft.requirements, []);
  const question = pending.questions.find(
    (entry) => entry.kind === 'requirement',
  );
  assert.equal(question.requirementEdit.action, 'restore');
  const complete = await f.graph.invoke(
    new Command({
      resume: {
        token: pending.__interrupt__[0].value.token,
        action: 'answer-requirement',
        messageId: 'auto-restore-answer',
        stepId: question.stepId,
        requirement: {
          text: 'Explicitly deferred restored purpose.',
          state: 'deferred',
          scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
        },
      },
    }),
    f.config,
  );
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.artifact.triggerConnected, false);
  assert.equal(complete.draft.requirementHistory.at(-1).kind, 'restored');
  assert.equal(model.calls.length, 1);
});

test('an in-flight revision change rejects restoration instead of rebasing or changing the supplied authoritative draft', async () => {
  const input = await fixture();
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          input.draft.revision++;
          return {
            decisions: [
              {
                kind: 'restore-requirement',
                requirementId: 'purpose',
                instruction: 'Restore purpose only.',
                sources: [{ kind: 'message', messageId: 'restore' }],
              },
            ],
          };
        },
      };
    },
  };
  await assert.rejects(
    analyzeWorkflowDraftEdit({
      ...input,
      model,
      options: { includeExplanations: false },
    }),
    (error) => {
      assert.equal(error.failure.stage, 'proposal-validation');
      assert.match(error.cause.message, /changed during model invocation/);
      return true;
    },
  );
  assert.deepEqual(input.draft.requirements, []);
});
