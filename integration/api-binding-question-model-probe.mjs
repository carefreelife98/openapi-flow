import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  describeWorkflowDraftApiCallPlanning,
  resolveWorkflowDraftApiCallBindings,
} from '@openapi-flow/core';
import {
  planWorkflowDraftApiCallBindings,
  generateWorkflowDraftApiCallArguments,
} from '@openapi-flow/langchain';
import { nativeParameterEditFixture } from '../test/fixtures/workflow-draft-native-parameter-edit-fixture.mjs';
import { connectionEditPlan } from '../test/fixtures/workflow-draft-connection-edit-fixture.mjs';

/** Probe the public primitive after API selection. This is not a full-model graph or business API execution test. */
export async function verifyApiBindingQuestionModel({
  model,
  collectAnswers,
  label,
}) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.equal(typeof collectAnswers, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const directory = new URL(
    `../.local-artifacts/api-binding-question-probe/${Date.now()}-${process.pid}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const base = await nativeParameterEditFixture(
    '별도 GET /replacement/{id} 호출을 추가해줘. id는 기존 source API 응답의 value 또는 기존 independent API 응답의 value 중 하나에서 받을 거야. 어느 출처로 할지는 아직 선택하지 않았으니, 현재 입력에 관해 물어봐 줘. 기존 노드의 설정이나 연결은 바꾸지 마.',
  );
  const plan = connectionEditPlan(
    base,
    [{ kind: 'add-api-call', operation: base.replacement.key }],
    false,
  );
  const input = { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
  try {
    const original = globalThis.structuredClone(input.draft);
    const description = describeWorkflowDraftApiCallPlanning(input);
    const pending = await planWorkflowDraftApiCallBindings({ ...input, model });
    await writeFile(
      new URL('model-result.json', directory),
      JSON.stringify(pending, null, 2),
    );
    assert.equal(
      pending.status,
      'needs-clarification',
      'The actual ambiguous source must produce a real typed question; the driver never fabricates one',
    );
    assert(
      pending.questions.every(
        (question) => question.targetPointer === '/path/id',
      ),
    );
    assert(
      pending.questions.every(
        (question) => question.path === '/replacement/{id}',
      ),
    );
    const answers = await collectAnswers({
      questions: globalThis.structuredClone(pending.questions),
    });
    await writeFile(
      new URL('explicit-operator-answers.json', directory),
      JSON.stringify(answers, null, 2),
    );
    const ready = resolveWorkflowDraftApiCallBindings({
      ...input,
      fingerprint: description.fingerprint,
      proposal: pending.proposal,
      answers,
    });
    assert.equal(ready.status, 'ready');
    const generated = await generateWorkflowDraftApiCallArguments({
      ...input,
      bindingPlan: ready,
      model,
    });
    assert.equal(generated.status, 'ready');
    assert.deepEqual(generated.arguments.values, {});
    assert.deepEqual(input.draft, original);
    await writeFile(
      new URL('ready.json', directory),
      JSON.stringify({ bindingPlan: ready, arguments: generated }, null, 2),
    );
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          questionCount: pending.questions.length,
          answers,
          bindings: ready.bindings,
          businessApiCalls: 0,
          scope:
            'One actual binding-model question for an already selected API; explicit operator answer; deterministic binding and wholly-bound argument resolution. No final graph or n8n execution.',
        },
        null,
        2,
      ),
    );
    console.log(`api-binding-question-probe: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          label,
          errorType: error.name,
          httpStatus: error.status,
          ...(error.name?.startsWith('Workflow')
            ? { failure: error.failure }
            : {}),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
