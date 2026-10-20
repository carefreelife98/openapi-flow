import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDraftChangeSet,
  approveWorkflowDraft,
  validateWorkflowDraft,
  describeWorkflowDraftRequirementHistory,
  describeWorkflowPlanningContext,
  createWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
  createWorkflowDraftEditCandidateContext,
  createWorkflowDraft,
  describeWorkflowDraftApiCallPlanning,
} from '@openapi-flow/core';
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import {
  workflowDraftFixture,
  scopedRequirement,
} from './fixtures/workflow-draft-fixture.mjs';

async function fixture() {
  const base = await workflowDraftFixture([scopedRequirement('confirmed')]);
  const context = {
    ...base.context,
    messages: [
      ...base.context.messages,
      { id: 'edit-1', text: 'Defer the purpose on b.' },
      { id: 'withdraw', text: 'Withdraw the purpose requirement only.' },
      { id: 'restore', text: 'Restore the explicit confirmed purpose for c.' },
    ],
  };
  return { ...base, context };
}
function update(input, changes) {
  return applyDraftChangeSet({
    ...input,
    changeSet: { baseRevision: input.draft.revision, changes },
  });
}
function plan(input, decisions) {
  const message = input.context.messages.find(
    (entry) => entry.id === 'withdraw',
  );
  return createWorkflowDraftEditPlan({
    ...input,
    requestMessageIds: [message.id],
    options: { includeExplanations: false },
    proposal: {
      decisions: decisions.map((decision) => ({
        ...decision,
        instruction: message.text,
        sources: [
          { kind: 'message', messageId: message.id, quote: message.text },
        ],
      })),
    },
  });
}

test('canonical requirement history is created by code, serializes unchanged and has no missing-history fallback', async () => {
  const input = await fixture();
  const [entry] = input.draft.requirementHistory;
  assert.equal(entry.kind, 'created');
  assert.equal(entry.revision, 0);
  assert.equal(Object.hasOwn(entry, 'previousEntryId'), false);
  assert.deepEqual(entry.after, input.draft.requirements[0]);
  assert.deepEqual(entry.evidence, [
    {
      kind: 'message',
      messageId: 'request-1',
      quote: input.context.messages[0].text,
    },
  ]);
  validateWorkflowDraft({
    ...input,
    draft: JSON.parse(JSON.stringify(input.draft)),
  });
  const description = describeWorkflowDraftRequirementHistory(input);
  assert.deepEqual(description.current, [
    { requirementId: 'purpose', entryId: entry.id },
  ]);
  description.entries[0].after.text = 'Mutated copy';
  assert.notEqual(input.draft.requirementHistory[0].after.text, 'Mutated copy');
  const missing = globalThis.structuredClone(input.draft);
  delete missing.requirementHistory;
  assert.throws(
    () => validateWorkflowDraft({ ...input, draft: missing }),
    /requirementHistory|Invalid input/,
  );
});

test('revision, withdrawal and restoration preserve exact past states and invalidate only affected approvals', async () => {
  const input = await fixture();
  const original = globalThis.structuredClone(input.draft);
  const approved = approveWorkflowDraft({
    ...input,
    expectedRevision: 0,
    nodeIds: ['a', 'b', 'c'],
  });
  const changed = update({ ...input, draft: approved }, [
    {
      kind: 'set-requirement',
      requirement: {
        ...approved.requirements[0],
        text: 'Needs review on b',
        state: 'deferred',
        scope: { kind: 'nodes', nodeIds: ['b'] },
        sourceMessageIds: ['edit-1'],
      },
    },
  ]);
  assert.deepEqual(changed.draft.requirements[0].sourceMessageIds, ['edit-1']);
  assert.deepEqual(
    changed.draft.requirementHistory[1].before,
    original.requirements[0],
  );
  assert.deepEqual(
    changed.draft.requirementHistory.map((entry) => entry.revision),
    [0, 2],
  );
  assert.deepEqual(changed.draft.approvals[0].invalidatedNodeIds, ['a', 'b']);
  assert.deepEqual(changed.impact.preservedNodeIds, ['c']);
  const removed = update({ ...input, draft: changed.draft }, [
    {
      kind: 'remove-requirement',
      requirementId: 'purpose',
      sourceMessageIds: ['withdraw'],
    },
  ]);
  assert.deepEqual(removed.draft.requirements, []);
  assert.equal(removed.draft.requirementHistory.at(-1).kind, 'removed');
  assert.equal(
    removed.draft.requirementHistory.at(-1).evidence[0].messageId,
    'withdraw',
  );
  assert.equal(
    describeWorkflowDraftRequirementHistory({ ...input, draft: removed.draft })
      .removed[0].requirementId,
    'purpose',
  );
  const restored = update({ ...input, draft: removed.draft }, [
    {
      kind: 'set-requirement',
      requirement: {
        ...original.requirements[0],
        text: 'Confirmed for c',
        scope: { kind: 'nodes', nodeIds: ['c'] },
        sourceMessageIds: ['restore'],
      },
    },
  ]);
  assert.deepEqual(
    restored.draft.requirementHistory.map((entry) => entry.kind),
    ['created', 'revised', 'removed', 'restored'],
  );
  for (const [index, entry] of restored.draft.requirementHistory.entries())
    if (index)
      assert.equal(
        entry.previousEntryId,
        restored.draft.requirementHistory[index - 1].id,
      );
  assert.deepEqual(restored.draft.apiCalls, original.apiCalls);
  assert.deepEqual(input.draft, original);
});

test('ordered changes in one atomic transaction retain every actual requirement transition and reject invented sources', async () => {
  const input = await fixture();
  const original = globalThis.structuredClone(input.draft);
  const changed = update(input, [
    {
      kind: 'set-requirement',
      requirement: {
        ...input.draft.requirements[0],
        text: 'Pending',
        state: 'deferred',
        sourceMessageIds: ['edit-1'],
      },
    },
    {
      kind: 'remove-requirement',
      requirementId: 'purpose',
      sourceMessageIds: ['withdraw'],
    },
    {
      kind: 'set-requirement',
      requirement: {
        ...input.draft.requirements[0],
        text: 'Final state',
        sourceMessageIds: ['restore'],
      },
    },
  ]);
  assert.deepEqual(
    changed.draft.requirementHistory.map((entry) => entry.revision),
    [0, 1, 1, 1],
  );
  assert.equal(changed.draft.requirementHistory[2].before.text, 'Pending');
  for (const sourceMessageIds of [
    undefined,
    [],
    ['imagined'],
    ['withdraw', 'withdraw'],
  ])
    assert.throws(() =>
      update(input, [
        {
          kind: 'remove-requirement',
          requirementId: 'purpose',
          sourceMessageIds,
        },
      ]),
    );
  assert.deepEqual(input.draft, original);
});

test('history rejects edited quotes, predecessors, snapshots, ordering and inconsistent live projections', async () => {
  const input = await fixture();
  const changed = update(input, [
    {
      kind: 'set-requirement',
      requirement: {
        ...input.draft.requirements[0],
        text: 'Changed',
        sourceMessageIds: ['edit-1'],
      },
    },
  ]).draft;
  const mutations = [
    (draft) => {
      draft.requirementHistory[0].evidence[0].quote = 'Invented';
    },
    (draft) => {
      draft.requirementHistory[1].previousEntryId = 'stale';
    },
    (draft) => {
      draft.requirementHistory[1].before.text = 'Invented';
    },
    (draft) => {
      draft.requirementHistory[1].after.sourceMessageIds = ['withdraw'];
    },
    (draft) => {
      draft.requirementHistory[1].revision = draft.revision + 1;
    },
    (draft) => {
      draft.requirementHistory.reverse();
    },
    (draft) => {
      draft.requirementHistory.push(draft.requirementHistory[1]);
    },
    (draft) => {
      draft.requirements[0].text = 'Not in history';
    },
    (draft) => {
      draft.requirementHistory = [];
    },
    (draft) => {
      draft.id = 'different-workflow';
    },
  ];
  for (const mutate of mutations) {
    const draft = globalThis.structuredClone(changed);
    mutate(draft);
    assert.throws(
      () => validateWorkflowDraft({ ...input, draft }),
      /history|Requirement/,
    );
  }
  const alteredMessages = input.context.messages.map((message) =>
    message.id === 'request-1'
      ? { ...message, text: 'Changed original source' }
      : message,
  );
  assert.throws(
    () =>
      validateWorkflowDraft({
        ...input,
        draft: changed,
        context: { ...input.context, messages: alteredMessages },
      }),
    /history/,
  );
});

test('active planning messages exclude retired evidence while complete audit sources remain valid and immutable', async () => {
  const input = await fixture();
  const context = { ...input.context, planningMessageIds: ['withdraw'] };
  validateWorkflowDraft({ ...input, context });
  assert.deepEqual(describeWorkflowPlanningContext(context).messages, [
    context.messages.find((entry) => entry.id === 'withdraw'),
  ]);
  for (const planningMessageIds of [['imagined'], ['withdraw', 'withdraw']])
    assert.throws(() =>
      validateWorkflowDraft({
        ...input,
        context: { ...context, planningMessageIds },
      }),
    );
  const edit = plan({ ...input, context }, [
    { kind: 'add-api-call', operation: input.context.operations[0].key },
  ]);
  const description = describeWorkflowDraftApiCallPlanning({
    ...input,
    context,
    plan: edit,
    requestMessageIds: ['withdraw'],
    resolutions: [],
    repairs: [],
    stepId: edit.steps[0].id,
  });
  assert.deepEqual(
    description.messages.map((entry) => entry.id),
    ['withdraw'],
  );
  assert.deepEqual(description.backgroundMessages, []);
  assert.equal(input.context.messages.length, 4);
});

test('an excluded audit message retains valid empty text without weakening the selected model evidence contract', async () => {
  const base = await workflowDraftFixture([scopedRequirement('confirmed')]);
  const context = {
    ...base.context,
    messages: [
      { id: 'request-1', text: '' },
      { id: 'current', text: 'Only current evidence is model input.' },
    ],
    planningMessageIds: ['current'],
  };
  const draft = createWorkflowDraft({ content: base.content, context });
  validateWorkflowDraft({ draft, context });
  assert.equal(draft.requirementHistory[0].evidence[0].quote, '');
  assert.deepEqual(describeWorkflowPlanningContext(context).messages, [
    context.messages[1],
  ]);
  assert.throws(
    () =>
      describeWorkflowPlanningContext({
        ...context,
        planningMessageIds: ['request-1'],
      }),
    /selected message request-1 requires non-empty text/,
  );
  assert.throws(
    () =>
      describeWorkflowPlanningContext({
        ...context,
        planningMessageIds: undefined,
      }),
    /context.messages/,
  );
  assert.deepEqual(
    describeWorkflowPlanningContext({ ...context, planningMessageIds: [] })
      .messages,
    [],
  );
});

test('one model may select only an existing withdrawn requirement; code removes it without regenerating nodes', async () => {
  const input = await fixture();
  const context = { ...input.context, planningMessageIds: ['withdraw'] };
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          assert.deepEqual(
            payload.messages.map((entry) => entry.id),
            ['withdraw'],
          );
          return {
            decisions: [
              {
                kind: 'remove-requirement',
                requirementId: 'purpose',
                instruction: 'Withdraw only purpose',
                sources: [{ kind: 'message', messageId: 'withdraw' }],
              },
            ],
          };
        },
      };
    },
  };
  const edit = await analyzeWorkflowDraftEdit({
    ...input,
    context,
    requestMessageIds: ['withdraw'],
    options: { includeExplanations: false },
    model,
  });
  const result = assembleWorkflowDraftEdit({
    ...input,
    context,
    plan: edit,
    requestMessageIds: ['withdraw'],
    resolutions: [],
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.draft.requirements, []);
  assert.equal(result.draft.requirementHistory.at(-1).kind, 'removed');
  assert.deepEqual(result.draft.apiCalls, input.draft.apiCalls);
  assert.deepEqual(result.draft.edges, input.draft.edges);
  assert.throws(() =>
    plan(input, [{ kind: 'remove-requirement', requirementId: 'imagined' }]),
  );
  assert.throws(
    () =>
      plan(input, [
        { kind: 'remove-requirement', requirementId: 'purpose' },
        { kind: 'revise-requirement', requirementId: 'purpose' },
      ]),
    /conflicts/,
  );
  await assert.rejects(() =>
    analyzeWorkflowDraftEdit({
      ...input,
      context,
      requestMessageIds: ['request-1'],
      options: { includeExplanations: false },
      model,
    }),
  );
});

test('typed requirement answers become exact audit receipts without changing the original planning fingerprint', async () => {
  const input = await fixture();
  const edit = plan(input, [
    { kind: 'revise-requirement', requirementId: 'purpose' },
  ]);
  const resolutions = [
    {
      stepId: edit.steps[0].id,
      kind: 'requirement',
      answerMessageId: 'explicit-answer',
      text: 'Typed replacement',
      state: 'confirmed',
      scope: { kind: 'nodes', nodeIds: ['c'] },
    },
  ];
  const prepared = {
    ...input,
    plan: edit,
    requestMessageIds: ['withdraw'],
    resolutions,
  };
  const context = createWorkflowDraftEditCandidateContext(prepared);
  const receipt = context.messages.find(
    (entry) => entry.id === 'explicit-answer',
  );
  assert.deepEqual(JSON.parse(receipt.text).requirement, {
    text: 'Typed replacement',
    state: 'confirmed',
    scope: { kind: 'nodes', nodeIds: ['c'] },
  });
  assert.deepEqual(
    describeWorkflowPlanningContext(context),
    describeWorkflowPlanningContext(input.context),
  );
  const result = assembleWorkflowDraftEdit(prepared);
  validateWorkflowDraft({ draft: result.draft, context });
  assert.deepEqual(result.draft.requirements[0].sourceMessageIds, [
    'withdraw',
    'explicit-answer',
  ]);
  assert.deepEqual(
    result.draft.requirementHistory[1].evidence.map((entry) => entry.messageId),
    ['withdraw', 'explicit-answer'],
  );
  assert.deepEqual(
    result.draft.requirementHistory[0].evidence.map((entry) => entry.messageId),
    ['request-1'],
  );
  assert.throws(
    () =>
      createWorkflowDraftEditCandidateContext({
        ...prepared,
        resolutions: [{ ...resolutions[0], answerMessageId: 'withdraw' }],
      }),
    /conflicts/,
  );
  assert.throws(() =>
    createWorkflowDraftEditCandidateContext({
      ...prepared,
      resolutions: [{ ...resolutions[0], answerMessageId: undefined }],
    }),
  );
  assert.deepEqual(input.draft.requirements[0].sourceMessageIds, ['request-1']);
});
