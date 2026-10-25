import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowDraft,
  inspectDraftReadiness,
  OpenApiFlowError,
} from '@openapi-flow/core';
import { draftConversationOutcomeSchema } from '@openapi-flow/example-langgraph-workflow';
import {
  draftConversationFixture,
  conversationTurn,
  conversationSemantic,
  apiRootConversationModel,
} from './fixtures/workflow-draft-conversation-fixture.mjs';
import { compileDraftConversationExport } from '../examples/langgraph-workflow/dist/graph/draft-conversation/compile-draft-conversation-export.js';

function nativeOrNoChange(call) {
  assert.equal(call.name, 'analyze_workflow_draft_edit');
  const message = call.payload.messages.at(-1).text;
  const decision =
    message === 'Add one pass-through.'
      ? { kind: 'add-native-node', capability: 'pass-through' }
      : message === 'Remove the only node.'
        ? { kind: 'remove-node', nodeId: call.payload.draft.nativeNodes[0].id }
        : { kind: 'no-change' };
  return { decisions: [conversationSemantic(call, decision)] };
}

test('empty no-change has a typed no-workflow outcome, no export or adoption claim and no invented semantic classification', async () => {
  for (const reviewPolicy of ['automatic', 'review']) {
    const f = await draftConversationFixture({
      empty: true,
      reviewPolicy,
      includeExplanations: true,
      respond: nativeOrNoChange,
    });
    const original = globalThis.structuredClone(f.draft);
    for (const [index, text] of [
      'The requested history API is unavailable; do not substitute.',
      'Do not create anything.',
    ].entries()) {
      const result = await f.graph.invoke(
        conversationTurn(f.draft, `empty-${index}`, text, index === 0),
        f.config,
      );
      assert.equal(result.phase, 'no-workflow');
      assert.deepEqual(result.outcome, {
        kind: 'no-workflow',
        draftId: f.draft.id,
        revision: 0,
        changeStatus: 'no-change',
        reason: 'no-api-or-native-instances',
        unresolvedRequirementIds: [],
      });
      assert.equal(result.artifact, undefined);
      assert.deepEqual(result.draft, original);
      assert.deepEqual(result.questions, []);
      assert.equal(result.plan.steps[0].decision.instruction, text);
      assert.ok(result.plan.steps[0].decision.explanation);
      assert.equal(
        result.events.some((event) =>
          ['exported', 'adopted'].includes(event.kind),
        ),
        false,
      );
      assert.ok(result.events.some((event) => event.kind === 'unchanged'));
      assert.ok(result.events.some((event) => event.kind === 'no-workflow'));
      assert.equal(f.calls.length, index + 1);
      assert.equal(
        inspectDraftReadiness({
          draft: result.draft,
          context: { ...f.context, messages: result.messages },
        }).designReady,
        false,
      );
    }
  }
});

test('a new request after no-workflow clears the terminal outcome and can produce a normal workflow', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const empty = await f.graph.invoke(
    conversationTurn(f.draft, 'empty', 'Keep the draft empty.', true),
    f.config,
  );
  const updates = [];
  for await (const update of await f.graph.stream(
    conversationTurn(empty.draft, 'create', 'Add one pass-through.'),
    { ...f.config, streamMode: 'updates' },
  ))
    updates.push(update);
  assert.equal(
    updates.find((update) => update.acceptTurn).acceptTurn.outcome,
    undefined,
  );
  assert.equal(updates.find((update) => update.adopt).adopt.phase, 'exporting');
  assert.equal(
    updates.find((update) => update.adopt).adopt.artifact,
    undefined,
  );
  const done = (await f.graph.getState(f.config)).values;
  assert.equal(done.phase, 'complete');
  assert.equal(done.outcome.kind, 'workflow-exported');
  assert.equal(done.outcome.changeStatus, 'changed');
  assert.equal(done.outcome.revision, done.draft.revision);
  assert.equal(done.artifact.triggerConnected, true);
  assert.equal(f.calls.length, 2);
});

test('removing every node produces no-workflow and clears the old artifact without calling it an export', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const first = await f.graph.invoke(
    conversationTurn(f.draft, 'create', 'Add one pass-through.', true),
    f.config,
  );
  const done = await f.graph.invoke(
    conversationTurn(first.draft, 'delete', 'Remove the only node.'),
    f.config,
  );
  assert.equal(done.phase, 'no-workflow');
  assert.equal(done.outcome.changeStatus, 'changed');
  assert.equal(done.artifact, undefined);
  assert.deepEqual(done.draft.nativeNodes, []);
  const currentEvents = done.events.slice(first.events.length);
  assert.ok(currentEvents.some((event) => event.kind === 'adopted'));
  assert.equal(
    currentEvents.some((event) => event.kind === 'exported'),
    false,
  );
  assert.equal(currentEvents.at(-1).kind, 'no-workflow');
});

test('a deliberate no-op on a populated draft retains its revision and distinguishes change from output', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const first = await f.graph.invoke(
    conversationTurn(f.draft, 'create', 'Add one pass-through.', true),
    f.config,
  );
  const done = await f.graph.invoke(
    conversationTurn(first.draft, 'keep', 'Keep the draft unchanged.'),
    f.config,
  );
  assert.equal(done.phase, 'complete');
  assert.equal(done.outcome.kind, 'workflow-exported');
  assert.equal(done.outcome.changeStatus, 'no-change');
  assert.deepEqual(done.draft, first.draft);
  assert.deepEqual(done.artifact.workflow, first.artifact.workflow);
  const events = done.events.slice(first.events.length);
  assert.ok(events.some((event) => event.kind === 'unchanged'));
  assert.equal(
    events.some((event) => event.kind === 'adopted'),
    false,
  );
  assert.equal(events.at(-1).kind, 'exported');
});

test('an exported template is not claimed execution-ready when required values or deployment are absent', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    allowRuntimeInputs: true,
    respond: apiRootConversationModel(),
  });
  const done = await f.graph.invoke(
    conversationTurn(
      f.draft,
      'template',
      'Create a lookup with editable runtime input.',
      true,
    ),
    f.config,
  );
  assert.equal(done.phase, 'complete');
  assert.equal(done.outcome.kind, 'workflow-exported');
  for (const field of [
    'runtimeInputsReady',
    'deploymentConfigured',
    'triggerConnected',
  ])
    assert.equal(done.outcome[field], done.artifact[field]);
  assert.equal(done.outcome.runtimeInputsReady, false);
  assert.equal(done.outcome.deploymentConfigured, false);
});

test('SDK export errors and calls before adoption are surfaced without a completed outcome or state mutation', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const done = await f.graph.invoke(
    conversationTurn(f.draft, 'create', 'Add one pass-through.', true),
    f.config,
  );
  assert.throws(
    () => compileDraftConversationExport(done, f.dependencies),
    /exporting phase after adoption/,
  );
  const exporting = {
    ...done,
    phase: 'exporting',
    artifact: undefined,
    outcome: undefined,
  };
  const events = globalThis.structuredClone(exporting.events);
  assert.throws(
    () =>
      compileDraftConversationExport(exporting, {
        ...f.dependencies,
        name: '',
      }),
    /template.name must be non-empty/,
  );
  assert.equal(exporting.phase, 'exporting');
  assert.equal(exporting.outcome, undefined);
  assert.equal(exporting.artifact, undefined);
  assert.deepEqual(exporting.events, events);
  assert.throws(
    () =>
      compileDraftConversationExport(
        { ...exporting, candidate: undefined },
        f.dependencies,
      ),
    /original candidate/,
  );
});

test('an empty draft reports only the original unresolved requirement IDs, not guessed API gaps', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const context = {
    ...f.context,
    messages: [{ id: 'source', text: 'An unresolved user decision.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'empty-with-requirement',
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      requirements: [
        {
          id: 'requirement',
          text: 'Unresolved decision',
          state: 'deferred',
          scope: { kind: 'workflow' },
          sourceMessageIds: ['source'],
        },
      ],
    },
  });
  const update = compileDraftConversationExport(
    {
      draft,
      messages: context.messages,
      events: [],
      candidate: { result: { status: 'no-change', draft } },
      phase: 'exporting',
    },
    { ...f.dependencies, context },
  );
  assert.equal(update.phase, 'no-workflow');
  assert.deepEqual(update.outcome.unresolvedRequirementIds, ['requirement']);
  assert.equal(update.artifact, undefined);
  assert.equal(update.outcome.reason, 'no-api-or-native-instances');
});

test('the actual graph preserves an exporting checkpoint without a stale artifact after an SDK failure', async () => {
  const f = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: nativeOrNoChange,
  });
  const first = await f.graph.invoke(
    conversationTurn(f.draft, 'create', 'Add one pass-through.', true),
    f.config,
  );
  const pending = await f.graph.invoke(
    conversationTurn(first.draft, 'keep', 'Keep the draft unchanged.'),
    { ...f.config, interruptAfter: ['adopt'] },
  );
  assert.equal(pending.phase, 'exporting');
  assert.equal(pending.artifact, undefined);
  assert.equal(pending.outcome, undefined);
  assert.deepEqual(pending.draft, first.draft);
  const capability = f.context.capabilities.find(
    (entry) => entry.name === 'pass-through',
  );
  assert.ok(capability);
  const compile = capability.compile;
  const failure = new Error('Injected native SDK compilation failure');
  const modelCalls = f.calls.length;
  capability.compile = () => {
    throw failure;
  };
  try {
    await assert.rejects(f.graph.invoke(null, f.config), (error) => {
      assert.ok(error instanceof OpenApiFlowError);
      assert.equal(error.diagnostic.code, 'N8N_COMPILATION_FAILED');
      assert.equal(error.diagnostic.operation, 'compileN8nWorkflowTemplate');
      assert.equal(error.cause, failure);
      assert.equal(error.message, failure.message);
      return true;
    });
    const failed = await f.graph.getState(f.config);
    assert.equal(failed.values.phase, 'exporting');
    assert.equal(failed.values.outcome, undefined);
    assert.equal(failed.values.artifact, undefined);
    assert.deepEqual(failed.values.draft, pending.draft);
    assert.deepEqual(failed.values.events, pending.events);
    assert.deepEqual(failed.next, ['export']);
    assert.equal(f.calls.length, modelCalls);
  } finally {
    capability.compile = compile;
  }
  const done = await f.graph.invoke(null, f.config);
  assert.equal(done.phase, 'complete');
  assert.equal(done.outcome.kind, 'workflow-exported');
  assert.equal(done.outcome.changeStatus, 'no-change');
  assert.deepEqual(done.draft, pending.draft);
  assert.deepEqual(done.artifact.workflow, first.artifact.workflow);
  assert.equal(f.calls.length, modelCalls);
});

test('the public outcome schema rejects ambiguous mixed outcomes and false readiness fields on no-workflow', () => {
  const empty = {
    kind: 'no-workflow',
    draftId: 'draft',
    revision: 0,
    changeStatus: 'no-change',
    reason: 'no-api-or-native-instances',
    unresolvedRequirementIds: [],
  };
  assert.deepEqual(draftConversationOutcomeSchema.parse(empty), empty);
  for (const extra of [
    { triggerConnected: true },
    { workflow: {} },
    { kind: 'api-unavailable' },
    { changeStatus: 'assumed-complete' },
  ])
    assert.equal(
      draftConversationOutcomeSchema.safeParse({ ...empty, ...extra }).success,
      false,
    );
});
