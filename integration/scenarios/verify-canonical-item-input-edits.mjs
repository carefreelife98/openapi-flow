import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

/** User-supplied replacement literals, not patched model outputs or expected operation hints. */
export async function verifyCanonicalItemInputEdits({
  fixture,
  initial,
  directory,
  typedPendingEdit = false,
  readModelCallCount,
}) {
  if (typedPendingEdit)
    assert.equal(
      typeof readModelCallCount,
      'function',
      'Typed-edit evaluation requires an actual model-call observer',
    );
  const original = globalThis.structuredClone(initial.draft.apiCalls[0]);
  const completed = [];
  let state = initial;
  for (const turn of [
    {
      id: 'edit-item-number',
      text: '상품번호를 문자열 "fixture-edited-03"로 바꿔줘.',
      gdNo: 'fixture-edited-03',
    },
    {
      id: 'restore-item-number',
      text: '상품번호를 문자열 "fixture-canonical-01"로 다시 바꿔줘.',
      gdNo: 'fixture-canonical-01',
    },
  ]) {
    state = await fixture.graph.invoke(
      {
        input: {
          request: {
            id: turn.id,
            text: turn.text,
            expectedRevision: state.draft.revision,
          },
        },
      },
      fixture.config,
    );
    await save(`${turn.id}-selection`, state);
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
    state = await fixture.resume(state, { action: 'approve' });
    await save(`${turn.id}-planned`, state);
    assert.equal(
      state.__interrupt__?.[0]?.value.phase,
      'candidate',
      'Preserve unexpected questions instead of inventing an answer',
    );
    state = await fixture.resume(state, { action: 'approve' });
    await save(`${turn.id}-complete`, state);
    assert.equal(state.phase, 'complete');
    assert.equal(state.artifact.triggerConnected, true);
    const expected = globalThis.structuredClone(original);
    expected.values.query.gdNo = turn.gdNo;
    assert.deepEqual(state.draft.apiCalls, [expected]);
    assert.deepEqual(state.draft.nativeNodes, initial.draft.nativeNodes);
    assert.deepEqual(state.draft.edges, initial.draft.edges);
    completed.push({ id: turn.id, result: state });
  }
  if (typedPendingEdit) {
    const id = 'ask-edited-item-number';
    state = await fixture.graph.invoke(
      {
        input: {
          request: {
            id,
            text: '상품번호를 바꾸고 싶어. 새 번호는 직접 입력할 테니 먼저 물어봐.',
            expectedRevision: state.draft.revision,
          },
        },
      },
      fixture.config,
    );
    await save(`${id}-selection`, state);
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
    state = await fixture.resume(state, { action: 'approve' });
    await save(`${id}-questions`, state);
    const boundary = state.__interrupt__?.[0]?.value;
    assert.equal(
      boundary?.kind,
      'draft-questions',
      'The model must create an actual input question; the driver never invents one',
    );
    assert.equal(boundary.questions.length, 1);
    const [question] = boundary.questions;
    assert.equal(question.kind, 'api-input-edit');
    assert.equal(question.apiInputEditTarget.pointer, '/query/gdNo');
    const before = globalThis.structuredClone(state.draft);
    const originalMessages = globalThis.structuredClone(state.messages);
    const callsBefore = readModelCallCount();
    state = await fixture.resume(state, {
      action: 'answer-api-input-edits',
      messageId: 'explicit-edited-item-number',
      stepId: question.stepId,
      confirmedAnswers: {
        contractId: question.apiInputEditContractId,
        answers: [{ targetId: question.apiInputEditTarget.id, value: '0007' }],
      },
    });
    await save(`${id}-candidate`, state);
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'candidate');
    assert.deepEqual(state.draft, before);
    assert.deepEqual(
      state.messages,
      originalMessages,
      'Typed answers must not manufacture model messages',
    );
    assert.equal(
      readModelCallCount(),
      callsBefore,
      'An explicit value answer must not replay any model stage',
    );
    state = await fixture.resume(state, { action: 'approve' });
    await save(`${id}-complete`, state);
    assert.equal(state.phase, 'complete');
    assert.equal(state.artifact.triggerConnected, true);
    const expected = globalThis.structuredClone(original);
    expected.values.query.gdNo = '0007';
    assert.deepEqual(state.draft.apiCalls, [expected]);
    assert.deepEqual(state.draft.nativeNodes, initial.draft.nativeNodes);
    assert.deepEqual(state.draft.edges, initial.draft.edges);
    assert.equal(readModelCallCount(), callsBefore);
    assert.equal(
      state.apiInputEditAnswerHistory.at(-1).messageId,
      'explicit-edited-item-number',
    );
    completed.push({ id, result: state });
  }
  return completed;

  async function save(name, checkpoint) {
    await writeFile(
      new URL(`${name}.json`, directory),
      JSON.stringify(checkpoint, null, 2),
    );
  }
}
