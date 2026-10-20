import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

/** User-supplied replacement literals, not patched model outputs or expected operation hints. */
export async function verifyCanonicalItemInputEdits({
  fixture,
  initial,
  directory,
}) {
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
  return completed;

  async function save(name, checkpoint) {
    await writeFile(
      new URL(`${name}.json`, directory),
      JSON.stringify(checkpoint, null, 2),
    );
  }
}
