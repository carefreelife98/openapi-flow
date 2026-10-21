import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from '@langchain/langgraph';
import {
  draftConversationFixture,
  conversationBoundary,
  conversationTurn,
  conversationSemantic,
  conversationEvidence,
} from './fixtures/workflow-draft-conversation-fixture.mjs';

function pendingEditModel(targets, replacement = false) {
  return (call) => {
    if (call.name === 'analyze_workflow_draft_edit') {
      const decisions = [];
      if (replacement) {
        const candidate = call.payload.candidates.find(
          (entry) => entry.operation.path === '/replacement/{id}',
        );
        assert.ok(candidate);
        decisions.push(
          conversationSemantic(call, {
            kind: 'replace-api-operation',
            nodeId: 'independent',
            operation: candidate.candidateId,
          }),
        );
      }
      decisions.push(
        conversationSemantic(call, {
          kind: 'revise-api-inputs',
          nodeId: 'independent',
        }),
      );
      return { decisions };
    }
    if (call.name === 'select_draft_api_input_edit_targets')
      return {
        targets: targets.map((pointer) => ({
          kind: 'set',
          pointer,
          ...conversationEvidence(call),
        })),
      };
    if (call.name === 'generate_draft_api_input_edit_values')
      return {
        values: Object.fromEntries(
          call.payload.targets.map((target) => [
            target.id,
            { status: 'needs-input' },
          ]),
        ),
      };
    if (call.name === 'plan_draft_api_call_bindings')
      return {
        decision: {
          status: 'provided',
          mappings: [],
          sourceMessageIds: call.payload.messages.map((message) => message.id),
        },
      };
    if (call.name === 'generate_draft_api_call_arguments')
      return {
        values: {},
        sourceMessageIds: call.payload.messages.map((message) => message.id),
      };
    if (call.name === 'plan_draft_connection_edit')
      return {
        decisions: [
          { kind: 'keep-connections', ...conversationEvidence(call) },
        ],
      };
    throw new Error(
      `Unexpected typed edit conversation model stage: ${call.name}`,
    );
  };
}

function reply(boundary, question, messageId, values, fields = {}) {
  return new Command({
    resume: {
      action: 'answer-api-input-edits',
      token: boundary.token,
      stepId: question.stepId,
      messageId,
      confirmedAnswers: {
        contractId: question.apiInputEditContractId,
        answers: values.map(([targetId, value]) => ({ targetId, value })),
      },
      ...fields,
    },
  });
}

test('real LangGraph checkpoints retain partial typed edit receipts and finish without another model call or synthetic evidence', async () => {
  const fixture = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: pendingEditModel(['/path/id', '/query/locale']),
  });
  const { graph, config, draft, calls } = fixture;
  const original = globalThis.structuredClone(draft);
  const pending = await graph.invoke(
    conversationTurn(
      draft,
      'edit-pending',
      'Change independent id and locale. Ask for their actual values.',
      true,
    ),
    config,
  );
  const boundary = conversationBoundary(pending);
  assert.ok(boundary.actions.includes('answer-api-input-edits'));
  assert.ok(!boundary.actions.includes('reply-inputs'));
  assert.deepEqual(
    boundary.questions.map((question) => question.kind),
    ['api-input-edit', 'api-input-edit'],
  );
  const [id, locale] = boundary.questions;
  assert.equal(id.apiInputEditTarget.schema.type, 'string');
  assert.match(id.message, /새 값을 입력/);
  const originalValues = globalThis.structuredClone(
    pending.stageResults[`api-input-values:${id.stepId}`].values,
  );
  const partial = await graph.invoke(
    reply(boundary, id, 'id-answer', [[id.apiInputEditTarget.id, '0007']]),
    config,
  );
  assert.deepEqual(partial.draft, original);
  assert.equal(conversationBoundary(partial).questions.length, 1);
  assert.equal(
    conversationBoundary(partial).questions[0].apiInputEditTarget.id,
    locale.apiInputEditTarget.id,
  );
  assert.notEqual(conversationBoundary(partial).token, boundary.token);
  assert.equal(partial.apiInputEditAnswerHistory.length, 1);
  const restored = await graph.getState(config);
  assert.deepEqual(
    restored.values.apiInputEditAnswerHistory,
    partial.apiInputEditAnswerHistory,
  );
  const completed = await graph.invoke(
    reply(conversationBoundary(partial), locale, 'locale-answer', [
      [locale.apiInputEditTarget.id, 'ja-JP'],
    ]),
    config,
  );
  assert.equal(completed.phase, 'complete');
  const call = completed.draft.apiCalls.find(
    (item) => item.id === 'independent',
  );
  assert.equal(call.values.path.id, '0007');
  assert.equal(call.values.query.locale, 'ja-JP');
  assert.deepEqual(
    completed.draft.apiCalls.filter((item) => item.id !== 'independent'),
    original.apiCalls.filter((item) => item.id !== 'independent'),
  );
  assert.deepEqual(completed.messages, pending.messages);
  assert.deepEqual(completed.turnMessages, pending.turnMessages);
  assert.deepEqual(
    completed.stageResults[`api-input-values:${id.stepId}`].values,
    originalValues,
  );
  assert.deepEqual(
    completed.apiInputEditAnswerHistory.map((entry) => entry.messageId),
    ['id-answer', 'locale-answer'],
  );
  assert.ok(
    completed.apiInputEditAnswerHistory.every(
      (entry) => entry.confirmedAnswers.answers.length === 1,
    ),
  );
  assert.equal(
    completed.stageResults[`api-input-values:${id.stepId}`].confirmedAnswers
      .answers.length,
    2,
  );
  assert.equal(completed.artifact.revision, completed.draft.revision);
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'analyze_workflow_draft_edit',
      'select_draft_api_input_edit_targets',
      'generate_draft_api_input_edit_values',
    ],
  );
  assert.deepEqual(draft, original);
});

test('wrong types, duplicate/foreign answers, reused IDs and stale review tokens keep the original draft and ask again without a model retry', async () => {
  const { graph, config, draft, calls } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: pendingEditModel(['/path/id', '/query/locale']),
  });
  const pending = await graph.invoke(
    conversationTurn(
      draft,
      'guarded-edit',
      'Ask for independent id and locale.',
      true,
    ),
    config,
  );
  let boundary = conversationBoundary(pending);
  const [id, locale] = boundary.questions;
  for (const command of [
    reply(boundary, id, 'wrong-type', [[id.apiInputEditTarget.id, 7]]),
    reply(
      boundary,
      id,
      'wrong-contract',
      [[id.apiInputEditTarget.id, '0007']],
      {
        confirmedAnswers: {
          contractId: 'old-contract',
          answers: [{ targetId: id.apiInputEditTarget.id, value: '0007' }],
        },
      },
    ),
    reply(boundary, id, 'duplicate-target', [
      [id.apiInputEditTarget.id, '0007'],
      [id.apiInputEditTarget.id, '0008'],
    ]),
    reply(boundary, id, 'wrong-target', [['not-a-target', '0007']]),
    reply(boundary, id, 'guarded-edit', [[id.apiInputEditTarget.id, '0007']]),
    reply(boundary, id, 'wrong-step', [[id.apiInputEditTarget.id, '0007']], {
      stepId: 'another-step',
    }),
  ]) {
    const rejected = await graph.invoke(command, config);
    assert.ok(conversationBoundary(rejected).issues.length);
    assert.deepEqual(rejected.draft, draft);
    assert.deepEqual(rejected.apiInputEditAnswerHistory, []);
    assert.equal(calls.length, 3);
  }
  const partial = await graph.invoke(
    reply(boundary, id, 'accepted-id', [[id.apiInputEditTarget.id, '0007']]),
    config,
  );
  const rejectedStale = await graph.invoke(
    reply(boundary, locale, 'stale-token', [
      [locale.apiInputEditTarget.id, 'ja-JP'],
    ]),
    config,
  );
  assert.match(conversationBoundary(rejectedStale).issues.join(' '), /토큰/);
  assert.deepEqual(
    rejectedStale.apiInputEditAnswerHistory,
    partial.apiInputEditAnswerHistory,
  );
  boundary = conversationBoundary(rejectedStale);
  const rejectedOverride = await graph.invoke(
    reply(boundary, id, 'override-id', [[id.apiInputEditTarget.id, '0008']]),
    config,
  );
  assert.ok(conversationBoundary(rejectedOverride).issues.length);
  assert.deepEqual(rejectedOverride.draft, draft);
  assert.equal(calls.length, 3);
  const cancelled = await graph.invoke(
    new Command({
      resume: {
        action: 'cancel',
        token: conversationBoundary(rejectedOverride).token,
      },
    }),
    config,
  );
  assert.equal(cancelled.phase, 'cancelled');
  assert.deepEqual(cancelled.draft, draft);
});

test('typed edit completion still waits for final review and preserves the approved draft until adoption', async () => {
  const { graph, config, draft, calls } = await draftConversationFixture({
    respond: pendingEditModel(['/path/id']),
  });
  const selection = await graph.invoke(
    conversationTurn(
      draft,
      'reviewed-edit',
      'Ask for a new independent id.',
      true,
    ),
    config,
  );
  const pending = await graph.invoke(
    new Command({
      resume: {
        action: 'approve',
        token: conversationBoundary(selection).token,
      },
    }),
    config,
  );
  const boundary = conversationBoundary(pending);
  const [question] = boundary.questions;
  const candidate = await graph.invoke(
    reply(boundary, question, 'reviewed-answer', [
      [question.apiInputEditTarget.id, '0007'],
    ]),
    config,
  );
  assert.equal(conversationBoundary(candidate).phase, 'candidate');
  assert.deepEqual(candidate.draft, draft);
  assert.equal(
    candidate.candidate.result.draft.apiCalls.find(
      (item) => item.id === 'independent',
    ).values.path.id,
    '0007',
  );
  assert.equal(calls.length, 3);
  const invalidLateAnswer = await graph.invoke(
    reply(conversationBoundary(candidate), question, 'late-answer', [
      [question.apiInputEditTarget.id, '0008'],
    ]),
    config,
  );
  assert.ok(conversationBoundary(invalidLateAnswer).issues.length);
  assert.deepEqual(invalidLateAnswer.draft, draft);
  assert.equal(calls.length, 3);
  const approved = await graph.invoke(
    new Command({
      resume: {
        action: 'approve',
        token: conversationBoundary(invalidLateAnswer).token,
      },
    }),
    config,
  );
  assert.equal(approved.phase, 'complete');
  assert.equal(
    approved.draft.apiCalls.find((item) => item.id === 'independent').values
      .path.id,
    '0007',
  );
  assert.equal(calls.length, 3);
});

test('a same-plan replacement receives its original required input before a separate typed detail edit uses the new OAS contract', async () => {
  const { graph, config, draft, calls } = await draftConversationFixture({
    reviewPolicy: 'automatic',
    respond: pendingEditModel(['/path/id'], true),
  });
  const original = globalThis.structuredClone(draft);
  const pending = await graph.invoke(
    conversationTurn(
      draft,
      'replace-edit',
      'Replace independent and ask for its required id, then ask for the exact detail-edit value.',
      true,
    ),
    config,
  );
  const first = conversationBoundary(pending);
  assert.deepEqual(
    first.questions.map((question) => question.kind),
    ['api-input'],
  );
  assert.equal(
    calls.some((call) => call.name === 'select_draft_api_input_edit_targets'),
    false,
  );
  const detail = await graph.invoke(
    new Command({
      resume: {
        action: 'answer-inputs',
        token: first.token,
        messageId: 'replacement-input',
        answers: [
          {
            requirementId: first.questions[0].requirement.id,
            value: 'replacement-initial',
          },
        ],
      },
    }),
    config,
  );
  const second = conversationBoundary(detail);
  assert.deepEqual(
    second.questions.map((question) => question.kind),
    ['api-input-edit'],
  );
  assert.deepEqual(detail.draft, draft);
  const [question] = second.questions;
  const finished = await graph.invoke(
    reply(second, question, 'replacement-detail', [
      [question.apiInputEditTarget.id, '0007'],
    ]),
    config,
  );
  assert.equal(finished.phase, 'complete');
  const selected = finished.draft.apiCalls.find(
    (item) => item.id === 'independent',
  );
  assert.equal(
    selected.operation.operationRef,
    '#/paths/~1replacement~1{id}/get',
  );
  assert.deepEqual(selected.values, { path: { id: '0007' } });
  assert.equal(
    calls.filter((call) => call.name === 'analyze_workflow_draft_edit').length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.name === 'generate_draft_api_input_edit_values')
      .length,
    1,
  );
  assert.deepEqual(draft, original);
});
