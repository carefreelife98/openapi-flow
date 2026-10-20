import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalInputReplyFixture,
  pauseCanonicalInputReply,
} from './fixtures/canonical-input-reply-fixture.mjs';
import { resolveDraftConversationInputAnswerExtraction } from '../examples/langgraph-workflow/dist/graph/draft-conversation/resolve-draft-conversation-input-answer-extraction.js';
import { extractDraftConversationInputAnswers } from '../examples/langgraph-workflow/dist/graph/draft-conversation/extract-draft-conversation-input-answers.js';

test('canonical natural reply preserves the selected plan and prior stages, records actual prose and uses one extraction call', async () => {
  for (const includeExplanations of [false, true]) {
    const f = await canonicalInputReplyFixture({ includeExplanations });
    const { pending } = await pauseCanonicalInputReply(f);
    assert.equal(pending.__interrupt__[0].value.kind, 'draft-questions');
    assert.ok(pending.__interrupt__[0].value.actions.includes('reply-inputs'));
    const count = f.calls.length,
      plan = globalThis.structuredClone(pending.plan);
    const candidate = await f.resume(pending, {
      action: 'reply-inputs',
      messageId: 'natural-answer',
      text: '회원번호는 "member-01"이야.',
    });
    assert.equal(candidate.__interrupt__[0].value.phase, 'candidate');
    assert.deepEqual(candidate.plan, plan);
    assert.deepEqual(
      f.calls.slice(count).map((call) => call.name),
      ['extract_api_input_answers'],
    );
    const done = await f.resume(candidate, { action: 'approve' });
    assert.equal(done.phase, 'complete');
    assert.equal(done.draft.apiCalls[0].values.path.id, 'member-01');
    assert.equal(
      done.messages.find((message) => message.id === 'natural-answer').text,
      '회원번호는 "member-01"이야.',
    );
    assert.equal(done.inputAnswerExtraction, undefined);
    assert.equal(done.inputAnswerHistory.length, 1);
    const record = done.inputAnswerHistory[0];
    assert.equal(
      Object.hasOwn(record.analysis, 'extraction'),
      includeExplanations,
    );
    assert.ok(record.analysis.sources.length);
    assert.equal(
      JSON.stringify(done.artifact.workflow).includes('inputAnswerHistory'),
      false,
    );
    assert.equal(
      f.calls.filter((call) => call.name === 'analyze_workflow_draft_edit')
        .length,
      1,
    );
    assert.equal(
      f.calls.filter(
        (call) => call.name === 'generate_draft_api_call_arguments',
      ).length,
      1,
    );
  }
});

test('empty selections keep questions and earlier plan; partial answers retain provenance across direct typed completion', async () => {
  const f = await canonicalInputReplyFixture({ twoInputs: true });
  const { pending } = await pauseCanonicalInputReply(f);
  const empty = await f.resume(pending, {
    action: 'reply-inputs',
    messageId: 'no-answer',
    text: '없어요.',
  });
  assert.ok(empty.issues.length);
  assert.deepEqual(empty.questions, pending.questions);
  assert.deepEqual(empty.plan, pending.plan);
  assert.equal(empty.inputAnswerHistory.length, 1);
  const partial = await f.resume(empty, {
    action: 'reply-inputs',
    messageId: 'member-answer',
    text: '회원번호는 "member-01"이야.',
  });
  assert.equal(partial.inputAnswerHistory.length, 2);
  assert.equal(partial.questions.length, 1);
  assert.equal(
    partial.questions[0].requirement.targetPointer,
    '/header/tenant',
  );
  const before = f.calls.length;
  const candidate = await f.resume(partial, {
    action: 'answer-inputs',
    messageId: 'typed-tenant',
    answers: [
      {
        requirementId: partial.questions[0].requirement.id,
        value: 'tenant-01',
      },
    ],
  });
  assert.equal(f.calls.length, before);
  assert.deepEqual(candidate.inputAnswerHistory, partial.inputAnswerHistory);
  const done = await f.resume(candidate, { action: 'approve' });
  assert.equal(done.draft.apiCalls[0].values.header.tenant, 'tenant-01');
  assert.equal(
    f.calls.filter((call) => call.name === 'extract_api_input_answers').length,
    2,
  );
});

test('stale tokens, empty raw messages, duplicate message IDs and replies at review boundaries never invoke extraction', async () => {
  const f = await canonicalInputReplyFixture();
  const { selected, pending } = await pauseCanonicalInputReply(f);
  const count = f.calls.length;
  let state = pending;
  for (const response of [
    { token: 'stale', messageId: 'stale-answer', text: 'member-01' },
    { messageId: 'empty', text: '' },
    { messageId: 'short-request', text: 'member-01' },
  ]) {
    state = await f.resume(state, { action: 'reply-inputs', ...response });
    assert.ok(state.issues.length);
    assert.equal(f.calls.length, count);
    assert.deepEqual(state.plan, pending.plan);
  }
  const another = await canonicalInputReplyFixture();
  const review = await another.graph.invoke(
    {
      input: {
        initialDraft: another.draft,
        request: {
          id: 'review-only',
          text: '회원 조회를 추가해줘.',
          expectedRevision: 0,
        },
      },
    },
    another.config,
  );
  const rejected = await another.resume(review, {
    action: 'reply-inputs',
    messageId: 'wrong-boundary',
    text: 'member-01',
  });
  assert.ok(rejected.issues.length);
  assert.equal(another.calls.length, 1);
  assert.equal(selected.plan.id, pending.plan.id);
});

test('checkpointed source choices are replayed against original contracts; tampered results and replies fail instead of rebasing', async () => {
  const f = await canonicalInputReplyFixture();
  const { pending } = await pauseCanonicalInputReply(f);
  const state = {
    ...pending,
    response: {
      action: 'reply-inputs',
      token: pending.__interrupt__[0].value.token,
      messageId: 'captured',
      text: '회원번호는 "member-01"이야.',
    },
  };
  const extracted = await extractDraftConversationInputAnswers(
    state,
    f.dependencies,
  );
  const captured = { ...state, ...extracted };
  assert.equal(
    resolveDraftConversationInputAnswerExtraction(captured).answers[0].value,
    'member-01',
  );
  for (const mutate of [
    (s) => {
      s.inputAnswerExtraction.analysis.answers[0].value = 'invented';
    },
    (s) => {
      s.inputAnswerExtraction.analysis.sources[0].occurrences[0].offset++;
    },
    (s) => {
      s.response.text = '다른 답변';
    },
    (s) => {
      s.questions[0].requirement.operation.snapshotId = 'stale';
    },
    (s) => {
      s.inputAnswerExtraction.analysis.unansweredRequirementIds.push(
        'invented',
      );
    },
  ]) {
    const changed = globalThis.structuredClone(captured);
    mutate(changed);
    assert.throws(() => resolveDraftConversationInputAnswerExtraction(changed));
  }
});
