import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

/** Expected operations are assertions, never supplied to the model as selections. */
export async function verifyCanonicalPriceFollowUps({
  fixture,
  initial,
  directory,
  responseGuard = false,
  runtimeStopMessage = false,
}) {
  const original = globalThis.structuredClone(initial.draft.apiCalls[0]);
  const completed = [];
  let state = initial;
  for (const turn of [
    {
      id: 'add-price',
      text: responseGuard
        ? '조회 결과의 code가 숫자 0이면 그 결과의 상품번호로 가격 정보도 확인하고, 아니면 오류로 중단해줘.' +
          (runtimeStopMessage
            ? ' 오류 메시지는 지금 정하지 않고 n8n 실행 전에 내가 입력할게.'
            : '')
        : '조회 결과의 상품번호로 가격 정보도 확인해줘.',
    },
    {
      id: 'remove-price',
      text: '방금 붙인 가격 확인은 취소하고 처음 조회만 남겨줘.',
    },
  ]) {
    state = await fixture.graph.invoke(
      {
        input: {
          request: {
            ...turn,
            expectedRevision: state.draft.revision,
          },
        },
      },
      fixture.config,
    );
    await save(`${turn.id}-selection`, state);
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
    state = await fixture.resume(state, { action: 'approve' });
    // Preserve unexpected questions or failures instead of filling model output.
    await save(`${turn.id}-planned`, state);
    if (responseGuard && !runtimeStopMessage && state.phase === 'questions') {
      assert.equal(state.questions.length, 1);
      const question = state.questions[0];
      const owner = state.plan.steps.find(
        (step) => step.id === question.stepId,
      );
      assert.equal(question.kind, 'message');
      assert.equal(owner?.decision.kind, 'add-native-node');
      assert.equal(owner.decision.capability, 'stop-and-error');
      // This is a new, explicit fixture-user message, not generated parameters
      // patched into a model response. The host owns the normal revise path.
      state = await fixture.resume(state, {
        action: 'revise',
        message: {
          id: 'guard-error-message',
          text: '오류 메시지는 "상품 조회 결과가 성공이 아닙니다."로 해줘.',
        },
      });
      await save(`${turn.id}-message-selection`, state);
      assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
      state = await fixture.resume(state, { action: 'approve' });
      await save(`${turn.id}-message-planned`, state);
    }
    assert.equal(
      state.__interrupt__?.[0]?.value.phase,
      'candidate',
      `Follow-up ${turn.id} did not produce a candidate; see its unchanged checkpoint`,
    );
    state = await fixture.resume(state, { action: 'approve' });
    await save(`${turn.id}-complete`, state);
    assert.equal(state.phase, 'complete');
    assert.equal(state.artifact.triggerConnected, true);
    assert.deepEqual(
      state.draft.apiCalls.find((call) => call.id === original.id),
      original,
      'An unrelated follow-up must preserve the original API instance and values',
    );
    const paths = state.draft.apiCalls.map((call) => {
      const operation = fixture.context.operations.find(
        (entry) =>
          entry.key.documentId === call.operation.documentId &&
          entry.key.operationRef === call.operation.operationRef,
      );
      assert.ok(operation);
      return operation.path;
    });
    assert.deepEqual(
      paths.sort(),
      turn.id === 'add-price'
        ? ['/item/core/getItemInfo', '/item/partial/getItemPriceInfo']
        : ['/item/core/getItemInfo'],
    );
    if (turn.id === 'add-price') {
      const price = state.draft.apiCalls.find((call) =>
        fixture.context.operations.some(
          (operation) =>
            operation.key.documentId === call.operation.documentId &&
            operation.key.operationRef === call.operation.operationRef &&
            operation.path === '/item/partial/getItemPriceInfo',
        ),
      );
      assert.deepEqual(price.bindings, [
        {
          kind: 'node-output',
          sourceNodeId: original.id,
          sourcePointer: '/result/gdNo',
          targetPointer: '/query/gdNo',
        },
      ]);
      if (responseGuard) {
        assert.ok(
          state.draft.nativeNodes.some((node) => node.capability === 'if'),
        );
        if (runtimeStopMessage) {
          const deferred = state.draft.nativeNodes.filter(
            (node) => node.runtimeParameters !== undefined,
          );
          assert.equal(deferred.length, 1);
          assert.equal(deferred[0].capability, 'stop-and-error');
          assert.deepEqual(deferred[0].parameters, {});
          if (deferred[0].runtimeParameters !== true)
            assert.deepEqual(deferred[0].runtimeParameters, {
              pointers: ['/message'],
            });
          assert.equal(state.artifact.inputSlots.length, 1);
          assert.equal(
            state.artifact.inputSlots[0].kind,
            'native-parameters-input',
          );
          assert.equal(state.artifact.inputSlots[0].nodeId, deferred[0].id);
          assert.equal(state.artifact.runtimeInputsReady, false);
        }
        assert.ok(
          state.draft.nativeNodes.some(
            (node) => node.capability === 'stop-and-error',
          ),
        );
      }
    }
    if (responseGuard && turn.id === 'remove-price')
      assert.deepEqual(state.draft.nativeNodes, initial.draft.nativeNodes);
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
