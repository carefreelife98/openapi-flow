import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { approveWorkflowDraft, createWorkflowDraft } from '@openapi-flow/core';
import {
  draftConversationFixture,
  nativeCountConversationModel,
  apiRootConversationModel,
  conversationTurn,
  conversationBoundary,
  conversationSemantic,
  conversationEvidence,
} from './fixtures/workflow-draft-conversation-fixture.mjs';

const resume = (boundary, action, fields = {}) =>
  new Command({ resume: { action, token: boundary.token, ...fields } });

test('existing completed drafts support selection review, exact scoped edits, final review, adoption and a second natural-language turn', async () => {
  let count = 4;
  const fixture = await draftConversationFixture({
    respond: nativeCountConversationModel(() => count),
  });
  const { graph, config, calls, draft } = fixture;
  const original = globalThis.structuredClone(draft);
  const selected = await graph.invoke(
    conversationTurn(draft, 'turn-1', 'Change config count to 4 only.', true),
    config,
  );
  const selection = conversationBoundary(selected);
  assert.equal(selection.phase, 'selection');
  assert.equal(calls.length, 1);
  assert.deepEqual(selected.draft, original);
  const reviewed = await graph.invoke(resume(selection, 'approve'), config);
  const final = conversationBoundary(reviewed);
  assert.equal(final.phase, 'candidate');
  assert.equal(calls.length, 4);
  assert.deepEqual(reviewed.draft, original);
  assert.equal(
    reviewed.candidate.result.draft.nativeNodes.find(
      (node) => node.id === 'config',
    ).parameters.count,
    4,
  );
  assert.equal(reviewed.candidate.preview.revision, 1);
  const applied = await graph.invoke(resume(final, 'approve'), config);
  assert.equal(applied.phase, 'complete');
  assert.equal(applied.draft.revision, 2);
  assert.deepEqual(applied.draft.apiCalls, original.apiCalls);
  assert.deepEqual(applied.draft.edges, original.edges);
  assert.deepEqual(
    applied.draft.nativeNodes.find((node) => node.id === 'sibling'),
    original.nativeNodes.find((node) => node.id === 'sibling'),
  );
  assert.equal(applied.artifact.revision, applied.draft.revision);
  assert.match(applied.artifact.guide, /2/);
  assert.ok(
    applied.draft.approvals.some((approval) =>
      approval.nodeIds.includes('config'),
    ),
  );
  assert.equal(calls.length, 4);
  count = 9;
  const secondSelection = await graph.invoke(
    conversationTurn(applied.draft, 'turn-2', 'Change config count to 9 only.'),
    config,
  );
  const secondCandidate = await graph.invoke(
    resume(conversationBoundary(secondSelection), 'approve'),
    config,
  );
  const second = await graph.invoke(
    resume(conversationBoundary(secondCandidate), 'approve'),
    config,
  );
  assert.equal(second.phase, 'complete');
  assert.equal(second.draft.revision, 4);
  assert.equal(
    second.draft.nativeNodes.find((node) => node.id === 'config').parameters
      .count,
    9,
  );
  assert.equal(calls.length, 8);
  assert.deepEqual(second.requestIds, ['turn-1', 'turn-2']);
  assert.deepEqual(draft, original);
});

test('canonical native field deferral checkpoints no value generation and a later literal edit clears only its owner', async () => {
  let deferring = true;
  const literal = nativeCountConversationModel(0);
  const fixture = await draftConversationFixture({
    allowRuntimeParameters: true,
    includeExplanations: true,
    respond(call) {
      if (
        deferring &&
        call.name === 'select_draft_native_parameter_edit_targets'
      )
        return {
          decision: {
            status: 'targets',
            targets: [
              {
                kind: 'defer',
                pointer: '/count',
                ...conversationEvidence(call),
              },
            ],
          },
        };
      if (
        deferring &&
        call.name === 'generate_draft_native_parameter_edit_values'
      )
        throw new Error('A defer-only edit must not ask the model for values');
      return literal(call);
    },
  });
  const { graph, config, draft, calls } = fixture;
  const selected = await graph.invoke(
    conversationTurn(
      draft,
      'defer-native-field',
      'Supply only config count at execution. Keep all other values.',
      true,
    ),
    config,
  );
  const reviewed = await graph.invoke(
    resume(conversationBoundary(selected), 'approve'),
    config,
  );
  assert.equal(conversationBoundary(reviewed).phase, 'candidate');
  assert.equal(calls.length, 3);
  const checkpoint = await graph.getState(config);
  assert.ok(
    checkpoint.values.resolutions.some(
      (result) =>
        result.kind === 'native-parameters' &&
        result.edits.some(
          (edit) => edit.kind === 'defer' && edit.pointer === '/count',
        ),
    ),
  );
  const applied = await graph.invoke(
    resume(conversationBoundary(reviewed), 'approve'),
    config,
  );
  assert.equal(applied.phase, 'complete');
  assert.equal(calls.length, 3);
  const node = applied.draft.nativeNodes.find((node) => node.id === 'config');
  assert.deepEqual(node.parameters, {
    enabled: false,
    nested: { value: 'unchanged' },
  });
  assert.deepEqual(node.runtimeParameters, { pointers: ['/count'] });
  assert.equal(applied.artifact.inputSlots.length, 1);
  assert.equal(applied.artifact.inputSlots[0].targetPointer, '/count');
  assert.equal(applied.artifact.runtimeInputsReady, false);
  assert.deepEqual(
    applied.draft.nativeNodes.find((node) => node.id === 'sibling'),
    draft.nativeNodes.find((node) => node.id === 'sibling'),
  );
  deferring = false;
  const second = await graph.invoke(
    conversationTurn(
      applied.draft,
      'set-native-field',
      'Set config count to 0 now. Keep other fields unchanged.',
    ),
    config,
  );
  const candidate = await graph.invoke(
    resume(conversationBoundary(second), 'approve'),
    config,
  );
  const done = await graph.invoke(
    resume(conversationBoundary(candidate), 'approve'),
    config,
  );
  assert.equal(done.phase, 'complete');
  assert.equal(calls.length, 7);
  assert.equal(
    calls.filter(
      (call) => call.name === 'generate_draft_native_parameter_edit_values',
    ).length,
    1,
  );
  const selection = calls
    .filter(
      (call) => call.name === 'select_draft_native_parameter_edit_targets',
    )
    .at(-1);
  assert.deepEqual(selection.payload.runtimeParameters, {
    pointers: ['/count'],
  });
  assert.deepEqual(
    done.draft.nativeNodes.find((node) => node.id === 'config').parameters,
    draft.nativeNodes.find((node) => node.id === 'config').parameters,
  );
  assert.equal(
    Object.hasOwn(
      done.draft.nativeNodes.find((node) => node.id === 'config'),
      'runtimeParameters',
    ),
    false,
  );
  assert.deepEqual(done.artifact.inputSlots, []);
  assert.deepEqual(done.draft.apiCalls, draft.apiCalls);
  assert.deepEqual(done.draft.edges, draft.edges);
});

test('new native ownership is checkpointed before typed values, survives an explicit resume and retains review evidence', async () => {
  let failValues = true;
  const fixture = await draftConversationFixture({
    allowRuntimeParameters: true,
    includeExplanations: true,
    respond(call) {
      const evidence = conversationEvidence(call);
      const selectedSources = {
        sourceMessageIds: evidence.sources.map((source) => source.messageId),
        explanation: evidence.explanation,
      };
      if (call.name === 'analyze_workflow_draft_edit')
        return {
          decisions: [
            conversationSemantic(call, {
              kind: 'add-native-node',
              capability: 'typed-context',
            }),
          ],
        };
      if (call.name === 'select_draft_native_node_parameter_ownership')
        return {
          decision: {
            status: 'runtime-fields',
            pointers: ['/count'],
            ...selectedSources,
          },
        };
      if (call.name === 'generate_draft_native_node_addition') {
        assert.equal(
          Object.hasOwn(call.payload.parametersSchema.properties, 'count'),
          false,
        );
        if (failValues)
          throw new Error(
            'Explicit fixture transport failure after saved ownership',
          );
        return {
          decision: {
            status: 'provided',
            parameters: { enabled: false, nested: { value: 'new' } },
            ...selectedSources,
          },
        };
      }
      if (call.name === 'plan_draft_connection_edit')
        return { decisions: [{ kind: 'keep-connections', ...evidence }] };
      throw new Error(`Unexpected addition stage ${call.name}`);
    },
  });
  const { graph, config, draft, calls } = fixture;
  const selected = await graph.invoke(
    conversationTurn(
      draft,
      'new-mixed-native',
      'Add another typed context with enabled false and nested value new. Supply only its count at execution; keep existing nodes.',
      true,
    ),
    config,
  );
  await assert.rejects(
    graph.invoke(resume(conversationBoundary(selected), 'approve'), config),
    /Explicit fixture transport failure/,
  );
  const checkpoint = await graph.getState(config);
  assert.ok(checkpoint.next.includes('native-addition'));
  assert.deepEqual(checkpoint.values.draft, draft);
  assert.deepEqual(
    checkpoint.values.bundles[0].nativeAdditionOwnership.runtimeParameters,
    { pointers: ['/count'] },
  );
  const ownershipKey = Object.keys(checkpoint.values.stageResults).find((key) =>
    key.startsWith('native-addition-ownership:'),
  );
  assert.ok(ownershipKey);
  assert.ok(
    checkpoint.values.stageResults[ownershipKey].contract.decision.explanation,
  );
  failValues = false;
  const reviewed = await graph.invoke(null, config);
  const boundary = conversationBoundary(reviewed);
  assert.equal(boundary.phase, 'candidate');
  assert.deepEqual(
    boundary.planningResults.stageResults[ownershipKey],
    checkpoint.values.stageResults[ownershipKey],
  );
  const applied = await graph.invoke(resume(boundary, 'approve'), config);
  assert.equal(applied.phase, 'complete');
  assert.equal(
    calls.filter(
      (call) => call.name === 'select_draft_native_node_parameter_ownership',
    ).length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.name === 'generate_draft_native_node_addition')
      .length,
    2,
  );
  assert.deepEqual(
    applied.draft.nativeNodes.slice(0, draft.nativeNodes.length),
    draft.nativeNodes,
  );
  assert.equal(applied.draft.nativeNodes.at(-1).parameters.count, undefined);
  assert.deepEqual(applied.draft.nativeNodes.at(-1).runtimeParameters, {
    pointers: ['/count'],
  });
  assert.deepEqual(applied.draft.apiCalls, draft.apiCalls);
  assert.deepEqual(applied.draft.edges, draft.edges);
  assert.equal(applied.artifact.inputSlots[0].targetPointer, '/count');
});

test('repeated malformed or stale approvals preserve one current interrupt and never replay model stages', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    respond: nativeCountConversationModel(4),
  });
  let result = await graph.invoke(
    conversationTurn(
      draft,
      'review-errors',
      'Change config count to 4 only.',
      true,
    ),
    config,
  );
  const originalToken = conversationBoundary(result).token;
  for (let index = 0; index < 4; index++) {
    result = await graph.invoke(
      new Command({
        resume:
          index % 2
            ? { action: 'approve', token: 'stale' }
            : { action: 'approve' },
      }),
      config,
    );
    assert.equal(calls.length, 1);
    assert.ok(conversationBoundary(result).issues.length);
    assert.equal(conversationBoundary(result).token, originalToken);
    const stored = await graph.getState(config);
    assert.equal(stored.tasks[0].interrupts.length, 1);
    assert.ok(stored.tasks[0].interrupts[0].response_schema);
    assert.deepEqual(stored.values.draft, draft);
  }
  const candidate = await graph.invoke(
    resume(conversationBoundary(result), 'approve'),
    config,
  );
  const count = calls.length;
  const rejected = await graph.invoke(
    new Command({ resume: { action: 'approve', token: originalToken } }),
    config,
  );
  assert.equal(calls.length, count);
  assert.equal(conversationBoundary(rejected).phase, 'candidate');
  assert.ok(conversationBoundary(rejected).issues.length);
  const done = await graph.invoke(
    resume(conversationBoundary(candidate), 'approve'),
    config,
  );
  assert.equal(done.phase, 'complete');
});

test('cancellation before selection or after preview keeps canonical content unchanged', async () => {
  for (const phase of ['selection', 'candidate']) {
    const { graph, config, calls, draft } = await draftConversationFixture({
      respond: nativeCountConversationModel(4),
    });
    let result = await graph.invoke(
      conversationTurn(
        draft,
        `cancel-${phase}`,
        'Change config count to 4 only.',
        true,
      ),
      config,
    );
    if (phase === 'candidate')
      result = await graph.invoke(
        resume(conversationBoundary(result), 'approve'),
        config,
      );
    const count = calls.length;
    const cancelled = await graph.invoke(
      resume(conversationBoundary(result), 'cancel'),
      config,
    );
    assert.equal(cancelled.phase, 'cancelled');
    assert.deepEqual(cancelled.draft, draft);
    assert.equal(calls.length, count);
    assert.equal(cancelled.artifact, undefined);
  }
});

test('a revision at final review supersedes only the pending plan, without adopting it or rewriting the old draft', async () => {
  let count = 4;
  const { graph, config, calls, draft } = await draftConversationFixture({
    respond: nativeCountConversationModel(() => count),
  });
  const first = await graph.invoke(
    conversationTurn(
      draft,
      'supersede',
      'Change config count to 4 only.',
      true,
    ),
    config,
  );
  const oldCandidate = await graph.invoke(
    resume(conversationBoundary(first), 'approve'),
    config,
  );
  const oldPlanId = oldCandidate.plan.id;
  count = 8;
  const revised = await graph.invoke(
    resume(conversationBoundary(oldCandidate), 'revise', {
      message: {
        id: 'revision-message',
        text: 'Use 8 instead of 4; keep everything else unchanged.',
      },
    }),
    config,
  );
  assert.equal(conversationBoundary(revised).phase, 'selection');
  assert.notEqual(revised.plan.id, oldPlanId);
  assert.deepEqual(revised.draft, draft);
  assert.ok(
    revised.events.some(
      (event) => event.kind === 'superseded' && event.id === oldPlanId,
    ),
  );
  const newCandidate = await graph.invoke(
    resume(conversationBoundary(revised), 'approve'),
    config,
  );
  assert.equal(
    newCandidate.candidate.result.draft.nativeNodes.find(
      (node) => node.id === 'config',
    ).parameters.count,
    8,
  );
  const complete = await graph.invoke(
    resume(conversationBoundary(newCandidate), 'approve'),
    config,
  );
  assert.equal(complete.draft.revision, 2);
  assert.equal(calls.length, 8);
});

test('automatic review policy adopts valid changes but never fabricates human approvals', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: nativeCountConversationModel(4),
  });
  const result = await graph.invoke(
    conversationTurn(
      draft,
      'automatic',
      'Change config count to 4 only.',
      true,
    ),
    config,
  );
  assert.equal(result.phase, 'complete');
  assert.equal(result.__interrupt__, undefined);
  assert.equal(result.draft.revision, 1);
  assert.deepEqual(result.draft.approvals, []);
  assert.equal(result.artifact.draftReadiness.reviewed, false);
  assert.equal(calls.length, 4);
});

test('an empty draft creates an OAS-backed API from a short request and typed answer without a second extraction model call', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: apiRootConversationModel(),
  });
  let result = await graph.invoke(
    conversationTurn(
      draft,
      'api-start',
      'Create an independent replacement API lookup.',
      true,
    ),
    config,
  );
  let boundary = conversationBoundary(result);
  assert.equal(boundary.kind, 'draft-questions');
  const question = boundary.questions[0];
  assert.equal(question.requirement.targetPointer, '/path/id');
  assert.deepEqual(
    calls.map((call) => call.name),
    ['analyze_workflow_draft_edit', 'generate_draft_api_call_arguments'],
  );
  for (let index = 0; index < 4; index++) {
    result = await graph.invoke(
      resume(boundary, 'answer-inputs', {
        messageId: `bad-${index}`,
        answers: [{ requirementId: question.id, value: 123 }],
      }),
      config,
    );
    boundary = conversationBoundary(result);
    assert.ok(boundary.issues.length);
    assert.equal(calls.length, 2);
    const stored = await graph.getState(config);
    assert.equal(stored.tasks[0].interrupts.length, 1);
  }
  const complete = await graph.invoke(
    resume(boundary, 'answer-inputs', {
      messageId: 'typed-answer',
      answers: [{ requirementId: question.id, value: 'member-01' }],
    }),
    config,
  );
  assert.equal(complete.phase, 'complete');
  assert.deepEqual(complete.draft.apiCalls[0].values, {
    path: { id: 'member-01' },
  });
  assert.equal(
    calls.filter((call) => call.name === 'generate_draft_api_call_arguments')
      .length,
    1,
  );
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((call) => call.name === 'plan_draft_connection_edit'),
    false,
  );
  assert.equal(complete.artifact.inputSlots.length, 0);
  assert.deepEqual(complete.draft.edges, []);
});

test('independent planning finishes while an API input waits; an explicit runtime-input policy creates slots without dummy values', async () => {
  const fixture = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: apiRootConversationModel({ includePassThrough: true }),
  });
  const { graph, config, calls, draft } = fixture;
  const pending = await graph.invoke(
    conversationTurn(
      draft,
      'independent',
      'Add an API lookup and an independent pass-through.',
      true,
    ),
    config,
  );
  const boundary = conversationBoundary(pending);
  assert.deepEqual(pending.draft.apiCalls, []);
  assert.ok(
    pending.resolutions.some(
      (resolution) => resolution.kind === 'native-literal',
    ),
  );
  assert.equal(
    calls.some((call) => call.name === 'generate_draft_native_node_addition'),
    false,
  );
  const question = boundary.questions.find(
    (question) => question.kind === 'api-input',
  );
  const complete = await graph.invoke(
    resume(boundary, 'answer-inputs', {
      messageId: 'provided-input',
      answers: [{ requirementId: question.id, value: 'independent-id' }],
    }),
    config,
  );
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.draft.nativeNodes.length, 1);
  assert.equal(complete.draft.apiCalls.length, 1);
  assert.equal(calls.length, 4);
  const runtime = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    allowRuntimeInputs: true,
    respond: apiRootConversationModel(),
  });
  const deferred = await runtime.graph.invoke(
    conversationTurn(
      runtime.draft,
      'runtime-input',
      'Create a lookup with editable runtime input.',
      true,
    ),
    runtime.config,
  );
  assert.equal(deferred.phase, 'complete');
  assert.deepEqual(deferred.draft.apiCalls[0].values, {});
  assert.equal(deferred.artifact.inputSlots[0].targetPointer, '/path/id');
  assert.equal(deferred.artifact.runtimeInputsReady, false);
});

test('thread IDs isolate pending answers and new turns cannot overwrite a persisted draft or silently rebase revisions', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: apiRootConversationModel(),
  });
  const first = await graph.invoke(
    conversationTurn(draft, 'same-id', 'Create a lookup.', true),
    config,
  );
  const otherConfig = { ...config, configurable: { thread_id: randomUUID() } };
  const second = await graph.invoke(
    conversationTurn(draft, 'same-id', 'Create a lookup.', true),
    otherConfig,
  );
  const question = conversationBoundary(first).questions[0];
  const complete = await graph.invoke(
    resume(conversationBoundary(first), 'answer-inputs', {
      messageId: 'only-first',
      answers: [{ requirementId: question.id, value: 'first-thread' }],
    }),
    config,
  );
  assert.deepEqual((await graph.getState(otherConfig)).values.draft, draft);
  assert.deepEqual(second.resolutions, []);
  const count = calls.length;
  await assert.rejects(
    graph.invoke(
      conversationTurn(
        complete.draft,
        'overwrite',
        'Do not accept replacement state.',
        true,
      ),
      config,
    ),
    /initialDraft is allowed only/,
  );
  assert.equal(calls.length, count);
});

test('a transport failure remains visible and leaves a checkpoint at the failed model stage, with no retry or draft mutation', async () => {
  const original = new Error('Synthetic original transport failure');
  const respond = nativeCountConversationModel(4);
  const { graph, config, calls, draft } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: (call) => {
      if (call.name === 'generate_draft_native_parameter_edit_values')
        throw original;
      return respond(call);
    },
  });
  await assert.rejects(
    graph.invoke(
      conversationTurn(
        draft,
        'transport-failure',
        'Change config count to 4 only.',
        true,
      ),
      config,
    ),
    (error) => error === original,
  );
  assert.equal(
    calls.filter(
      (call) => call.name === 'generate_draft_native_parameter_edit_values',
    ).length,
    1,
  );
  const stored = await graph.getState(config);
  assert.deepEqual(stored.values.draft, draft);
  assert.ok(stored.next.includes('native-values'));
});

test('a stale request or changed canonical revision cannot be approved as the previous candidate', async () => {
  const { graph, config, calls, draft, context } =
    await draftConversationFixture({
      respond: nativeCountConversationModel(4),
    });
  await assert.rejects(
    graph.invoke(
      {
        input: {
          request: {
            id: 'stale',
            text: 'Change config.',
            expectedRevision: 99,
          },
          initialDraft: draft,
        },
      },
      config,
    ),
    /Stale conversation request revision/,
  );
  assert.equal(calls.length, 0);
  const first = await graph.invoke(
    conversationTurn(draft, 'actual', 'Change config count to 4 only.', true),
    config,
  );
  const candidate = await graph.invoke(
    resume(conversationBoundary(first), 'approve'),
    config,
  );
  const boundary = conversationBoundary(candidate);
  const changed = approveWorkflowDraft({
    draft,
    context,
    expectedRevision: draft.revision,
    nodeIds: ['source'],
  });
  await graph.updateState(config, { draft: changed });
  const rejected = await graph.invoke(resume(boundary, 'approve'), config);
  assert.ok(conversationBoundary(rejected).issues.length);
  assert.equal(calls.length, 4);
  assert.deepEqual(rejected.draft, changed);
});

test('a same-plan API detail edit waits for the replacement argument question instead of reading its old contract', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond(call) {
      if (call.name === 'analyze_workflow_draft_edit') {
        const candidate = call.payload.candidates.find(
          (entry) => entry.operation.path === '/replacement/{id}',
        );
        return {
          decisions: [
            conversationSemantic(call, {
              kind: 'replace-api-operation',
              nodeId: 'independent',
              operation: candidate.candidateId,
            }),
            conversationSemantic(call, {
              kind: 'revise-api-inputs',
              nodeId: 'independent',
            }),
          ],
        };
      }
      if (call.name === 'plan_draft_api_call_bindings')
        return {
          decision: {
            status: 'provided',
            mappings: [],
            sourceMessageIds: call.payload.messages.map(
              (message) => message.id,
            ),
          },
        };
      if (call.name === 'generate_draft_api_call_arguments')
        return {
          values: {},
          sourceMessageIds: call.payload.messages.map((message) => message.id),
        };
      throw new Error(`Unresolved replacement must not run ${call.name}`);
    },
  });
  const pending = await graph.invoke(
    conversationTurn(
      draft,
      'replace-and-edit',
      'Replace independent and ask for its new input.',
      true,
    ),
    config,
  );
  assert.deepEqual(pending.draft, draft);
  assert.deepEqual(
    conversationBoundary(pending).questions.map((question) => question.kind),
    ['api-input'],
  );
  assert.equal(
    calls.some((call) => call.name === 'select_draft_api_input_edit_targets'),
    false,
  );
});

test('API-only input edits use separate target and value stages without reselecting operations', async () => {
  const { graph, config, calls, draft } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: (call) => {
      const message = call.payload.messages.at(-1);
      const sources = [{ kind: 'message', messageId: message.id }];
      if (call.name === 'analyze_workflow_draft_edit')
        return {
          decisions: [
            conversationSemantic(call, {
              kind: 'revise-api-inputs',
              nodeId: 'independent',
            }),
          ],
        };
      if (call.name === 'select_draft_api_input_edit_targets')
        return { targets: [{ kind: 'set', pointer: '/path/id', sources }] };
      if (call.name === 'generate_draft_api_input_edit_values')
        return {
          values: {
            'value-1': {
              status: 'provided',
              value: 'new-id',
              source: {
                messageId: message.id,
                sourceFormat: 'text',
                sourceText: 'new-id',
              },
            },
          },
        };
      throw new Error(`Unexpected input edit stage ${call.name}`);
    },
  });
  const result = await graph.invoke(
    conversationTurn(
      draft,
      'input-edit',
      'Change independent id to new-id only.',
      true,
    ),
    config,
  );
  assert.equal(result.phase, 'complete');
  assert.equal(
    result.draft.apiCalls.find((call) => call.id === 'independent').values.path
      .id,
    'new-id',
  );
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'analyze_workflow_draft_edit',
      'select_draft_api_input_edit_targets',
      'generate_draft_api_input_edit_values',
    ],
  );
});

test('optional explanations and original per-stage results survive actual checkpoint serialization', async () => {
  const { graph, config, draft } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    includeExplanations: true,
    respond: nativeCountConversationModel(4),
  });
  const result = await graph.invoke(
    conversationTurn(
      draft,
      'explained',
      'Change config count to 4 only.',
      true,
    ),
    config,
  );
  assert.equal(result.phase, 'complete');
  assert.ok(result.plan.steps[0].decision.explanation.reason);
  const stored = (await graph.getState(config)).values;
  const valueStage = Object.entries(stored.stageResults).find(([key]) =>
    key.startsWith('native-values:'),
  )[1];
  assert.ok(valueStage.values.values['parameter-1'].explanation.reason);
  assert.equal(
    valueStage.values.values['parameter-1'].sources[0].quote,
    'Change config count to 4 only.',
  );
  assert.ok(stored.connectionResult.proposal.decisions[0].explanation.reason);
  assert.deepEqual(stored.stageResults, result.stageResults);
  assert.equal(Object.values(stored.stageResults).length, 2);
});

test('review and question interrupts expose original planning results only when explanations are enabled', async () => {
  for (const includeExplanations of [false, true]) {
    for (const needsInput of [false, true]) {
      const respond = nativeCountConversationModel(4);
      const { graph, config, calls, draft } = await draftConversationFixture({
        includeExplanations,
        respond: (call) =>
          needsInput &&
          call.name === 'generate_draft_native_parameter_edit_values'
            ? {
                values: {
                  'parameter-1': {
                    status: 'needs-input',
                    message: 'Which count should this node use?',
                    ...conversationEvidence(call),
                  },
                },
              }
            : respond(call),
      });
      let state = await graph.invoke(
        conversationTurn(
          draft,
          'visible-evidence',
          'Change config count.',
          true,
        ),
        config,
      );
      for (const phase of [
        'selection',
        needsInput ? 'questions' : 'candidate',
      ]) {
        const boundary = conversationBoundary(state);
        assert.equal(boundary.phase ?? state.phase, phase);
        assert.equal(
          Object.hasOwn(boundary, 'planningResults'),
          includeExplanations,
        );
        if (includeExplanations) {
          assert.deepEqual(boundary.planningResults.plan, state.plan);
          assert.deepEqual(
            boundary.planningResults.stageResults,
            state.stageResults,
          );
          assert.deepEqual(
            boundary.planningResults.inputAnswerHistory,
            state.inputAnswerHistory,
          );
          assert.deepEqual(
            boundary.planningResults.connectionResult,
            state.connectionResult,
          );
          assert.deepEqual(
            (await graph.getState(config)).values.stageResults,
            boundary.planningResults.stageResults,
          );
        }
        if (phase === 'selection')
          state = await graph.invoke(resume(boundary, 'approve'), config);
      }
      assert.equal(calls.length, needsInput ? 3 : 4);
      assert.deepEqual(state.draft, draft);
    }
  }
});

test('changing shown stage or routing evidence invalidates the old approval without another model call', async () => {
  for (const target of ['stageResults', 'connectionResult']) {
    const { graph, config, calls, draft } = await draftConversationFixture({
      includeExplanations: true,
      respond: nativeCountConversationModel(4),
    });
    const selected = await graph.invoke(
      conversationTurn(
        draft,
        `changed-${target}`,
        'Change config count to 4 only.',
        true,
      ),
      config,
    );
    const candidate = await graph.invoke(
      resume(conversationBoundary(selected), 'approve'),
      config,
    );
    const boundary = conversationBoundary(candidate);
    const changed = globalThis.structuredClone(candidate[target]);
    if (target === 'stageResults')
      Object.values(changed).find(
        (result) => result.values?.values,
      ).values.values['parameter-1'].explanation.reason =
        'Changed display reason';
    else
      changed.proposal.decisions[0].explanation.reason =
        'Changed display reason';
    await graph.updateState(config, { [target]: changed });
    const rejected = await graph.invoke(resume(boundary, 'approve'), config);
    const current = conversationBoundary(rejected);
    assert.equal(current.phase, 'candidate');
    assert.ok(current.issues.length);
    assert.notEqual(current.token, boundary.token);
    assert.deepEqual(rejected.draft, draft);
    assert.equal(calls.length, 4);
  }
});

test('an explicitly empty OAS context can create a registered native-only workflow without fabricated API materials', async () => {
  const fixture = await draftConversationFixture({
    empty: true,
    reviewPolicy: 'automatic',
    respond: (call) => {
      if (call.name === 'analyze_workflow_draft_edit') {
        assert.deepEqual(call.payload.candidates, []);
        return {
          decisions: [
            conversationSemantic(call, {
              kind: 'add-native-node',
              capability: 'pass-through',
            }),
          ],
        };
      }
      if (call.name === 'plan_draft_connection_edit')
        return {
          decisions: [
            {
              kind: 'keep-connections',
              sources: [
                {
                  kind: 'message',
                  messageId: 'native-only',
                },
              ],
            },
          ],
        };
      throw new Error(`No other model stage is needed: ${call.name}`);
    },
  });
  fixture.dependencies.context.operations = [];
  const result = await fixture.graph.invoke(
    conversationTurn(
      fixture.draft,
      'native-only',
      'Create one independent pass-through.',
      true,
    ),
    fixture.config,
  );
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.draft.apiCalls, []);
  assert.equal(result.draft.nativeNodes[0].capability, 'pass-through');
  assert.equal(
    result.artifact.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
    false,
  );
  assert.equal(fixture.calls.length, 1);
  assert.equal(
    fixture.calls.some((call) => call.name === 'plan_draft_connection_edit'),
    false,
  );
});

test('requirement text, state and scope require explicit typed confirmation and never trigger a second semantic model call', async () => {
  const fixture = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: (call) => {
      assert.equal(call.name, 'analyze_workflow_draft_edit');
      return {
        decisions: [
          conversationSemantic(call, {
            kind: 'revise-requirement',
            requirementId: 'purpose',
          }),
        ],
      };
    },
  });
  const { revision, approvals, requirementHistory, ...content } = fixture.draft;
  assert.ok(Array.isArray(requirementHistory));
  assert.equal(revision, 0);
  assert.deepEqual(approvals, []);
  const draft = createWorkflowDraft({
    context: fixture.context,
    content: {
      ...content,
      requirements: [
        {
          id: 'purpose',
          text: 'Original purpose.',
          state: 'confirmed',
          scope: { kind: 'workflow' },
          sourceMessageIds: ['initial'],
        },
      ],
    },
  });
  let result = await fixture.graph.invoke(
    conversationTurn(
      draft,
      'requirement-edit',
      'Change the purpose statement and its scope.',
      true,
    ),
    fixture.config,
  );
  const first = conversationBoundary(result);
  const question = first.questions.find((item) => item.kind === 'requirement');
  assert.equal(question.requirementEdit.requirement.id, 'purpose');
  result = await fixture.graph.invoke(
    resume(first, 'answer-requirement', {
      messageId: 'invalid-scope',
      stepId: question.stepId,
      requirement: {
        text: 'Verified purpose.',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: ['imagined'] },
      },
    }),
    fixture.config,
  );
  assert.ok(conversationBoundary(result).issues.length);
  assert.deepEqual(result.draft, draft);
  assert.equal(fixture.calls.length, 1);
  const complete = await fixture.graph.invoke(
    resume(conversationBoundary(result), 'answer-requirement', {
      messageId: 'typed-purpose',
      stepId: question.stepId,
      requirement: {
        text: 'Verified purpose.',
        state: 'confirmed',
        scope: { kind: 'nodes', nodeIds: ['source'] },
      },
    }),
    fixture.config,
  );
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.draft.requirements[0].text, 'Verified purpose.');
  assert.deepEqual(complete.draft.requirements[0].scope, {
    kind: 'nodes',
    nodeIds: ['source'],
  });
  assert.deepEqual(complete.draft.apiCalls, draft.apiCalls);
  assert.equal(fixture.calls.length, 1);
  assert.equal(
    complete.stageResults[`requirement-answer:${question.stepId}`]
      .sourceMessageId,
    'typed-purpose',
  );
});
