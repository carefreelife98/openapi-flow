import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { createApiEnumEditFixture } from './fixtures/workflow-draft-api-enum-edit-fixture.mjs';
import {
  textInputSource,
  jsonInputSource,
} from './fixtures/api-input-source-selection-fixture.mjs';
import {
  conversationSemantic,
  conversationEvidence,
  conversationBoundary,
  conversationTurn,
} from './fixtures/workflow-draft-conversation-fixture.mjs';
import { extractDraftConversationInputAnswers } from '../examples/langgraph-workflow/dist/graph/draft-conversation/extract-draft-conversation-input-answers.js';
import { resolveDraftConversationApiInputEditAnswerExtraction } from '../examples/langgraph-workflow/dist/graph/draft-conversation/resolve-draft-conversation-api-input-edit-answer-extraction.js';

async function fixture(includeExplanations = false) {
  const input = await createApiEnumEditFixture({
    pointers: ['/body/sort', '/body/note'],
    text: '정렬 방식과 메모를 바꿔줘.',
    includeExplanations,
  });
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          const call = {
            name: options.name,
            schema,
            options,
            payload: JSON.parse(messages[1].content),
            messages,
          };
          calls.push(call);
          if (call.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                conversationSemantic(call, {
                  kind: 'revise-api-inputs',
                  nodeId: 'source',
                }),
              ],
            };
          if (call.name === 'select_draft_api_input_edit_targets')
            return {
              targets: ['/body/sort', '/body/note'].map((pointer) => ({
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
                  {
                    status: 'needs-input',
                    ...(includeExplanations
                      ? { explanation: conversationEvidence(call).explanation }
                      : {}),
                  },
                ]),
              ),
            };
          if (call.name === 'extract_api_input_answers') {
            let answers = [];
            if (call.payload.reply.includes('조회수')) {
              const choice = call.payload.enumChoices[0];
              answers = [
                {
                  requirementId: choice.requirementId,
                  source: {
                    kind: 'oas-enum',
                    candidateId: choice.candidates.find(
                      (item) => item.value === 'VIEWS',
                    ).id,
                    intent: textInputSource(call.payload, '조회수 순'),
                  },
                  reason:
                    '조회수 순으로 정렬하려는 요청에 맞는 OAS 후보입니다.',
                },
              ];
            } else if (call.payload.reply.includes('0007')) {
              answers = [
                {
                  requirementId: call.payload.questions[0].id,
                  source: jsonInputSource(call.payload, '"0007"'),
                  ...(includeExplanations
                    ? { reason: '메모 원문을 선택했습니다.' }
                    : {}),
                },
              ];
            }
            return {
              answers,
              ...(includeExplanations
                ? {
                    reason: '이번 답변이 지정한 현재 수정 입력만 선택했습니다.',
                  }
                : {}),
            };
          }
          if (call.name === 'plan_draft_connection_edit')
            return {
              decisions: [
                { kind: 'keep-connections', ...conversationEvidence(call) },
              ],
            };
          throw new Error(`Unexpected natural edit stage ${call.name}`);
        },
      };
    },
  };
  const dependencies = {
    context: input.context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Pending API edit prose',
    reviewPolicy: 'review',
    includeExplanations,
    selectOasEnums: true,
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: randomUUID() },
    recursionLimit: 150,
  };
  const resume = (state, response) =>
    graph.invoke(
      new Command({
        resume: { token: conversationBoundary(state).token, ...response },
      }),
      config,
    );
  const selection = await graph.invoke(
    conversationTurn(
      input.draft,
      'edit-request',
      '정렬 방식과 메모를 바꿔줘.',
      true,
    ),
    config,
  );
  const pending = await resume(selection, { action: 'approve' });
  return { ...input, calls, dependencies, graph, config, resume, pending };
}

for (const includeExplanations of [false, true])
  test(`actual LangGraph resumes pending edit prose without regenerating targets/values, explanations=${includeExplanations}`, async () => {
    const f = await fixture(includeExplanations);
    const original = globalThis.structuredClone(f.pending.stageResults);
    const oldDraft = globalThis.structuredClone(f.pending.draft);
    const plan = globalThis.structuredClone(f.pending.plan);
    const stepId = conversationBoundary(f.pending).questions[0].stepId;
    assert(
      conversationBoundary(f.pending).actions.includes('reply-api-input-edits'),
    );
    const count = f.calls.length;
    let state = f.pending;
    for (const response of [
      { token: 'stale', stepId },
      { stepId: 'foreign' },
      { stepId, text: '' },
    ]) {
      state = await f.resume(state, {
        action: 'reply-api-input-edits',
        messageId: randomUUID(),
        text: '조회수 순으로 해줘.',
        ...response,
      });
      assert(state.issues.length);
      assert.equal(f.calls.length, count);
    }
    const noAnswer = await f.resume(state, {
      action: 'reply-api-input-edits',
      stepId,
      messageId: 'unknown-answer',
      text: '모르겠어.',
    });
    assert.deepEqual(noAnswer.questions, f.pending.questions);
    assert.deepEqual(noAnswer.stageResults, original);
    assert.equal(noAnswer.inputAnswerHistory.length, 1);
    assert.equal(noAnswer.apiInputEditAnswerHistory.length, 0);
    const partial = await f.resume(noAnswer, {
      action: 'reply-api-input-edits',
      stepId,
      messageId: 'sort-answer',
      text: '조회수 순으로 해줘.',
    });
    assert.deepEqual(partial.draft, oldDraft);
    assert.deepEqual(partial.plan, plan);
    assert.deepEqual(
      partial.questions.map((question) => question.apiInputEditTarget.pointer),
      ['/body/note'],
    );
    const key = `api-input-values:${stepId}`;
    assert.deepEqual(partial.stageResults[key].values, original[key].values);
    assert.equal(partial.inputAnswerHistory[1].kind, 'api-input-edit');
    assert.equal(partial.inputAnswerHistory[1].stepId, stepId);
    assert.equal(partial.inputAnswerHistory[1].analysis.sources.length, 0);
    assert.equal(partial.apiInputEditAnswerHistory.length, 0);
    const questionReceipt = conversationBoundary(partial).enumSelections[0];
    assert.equal(questionReceipt.value, 'VIEWS');
    assert.equal(questionReceipt.sourceText, '조회수 순');
    assert.equal(questionReceipt.messageId, 'sort-answer');
    const beforeCompletionCalls = f.calls.length;
    const question = partial.questions[0];
    const candidate = await f.resume(
      partial,
      includeExplanations
        ? {
            action: 'reply-api-input-edits',
            stepId,
            messageId: 'note-natural',
            text: '메모는 "0007"이야.',
          }
        : {
            action: 'answer-api-input-edits',
            stepId,
            messageId: 'note-typed',
            confirmedAnswers: {
              contractId: question.apiInputEditContractId,
              answers: [
                { targetId: question.apiInputEditTarget.id, value: '0007' },
              ],
            },
          },
    );
    assert.equal(conversationBoundary(candidate).phase, 'candidate');
    assert.deepEqual(conversationBoundary(candidate).enumSelections, [
      questionReceipt,
    ]);
    assert.deepEqual(candidate.draft, oldDraft);
    assert.deepEqual(candidate.stageResults[key].values, original[key].values);
    assert.equal(
      f.calls
        .slice(beforeCompletionCalls)
        .filter((call) => call.name === 'extract_api_input_answers').length,
      includeExplanations ? 1 : 0,
    );
    const stale = await f.resume(candidate, {
      action: 'approve',
      token: conversationBoundary(partial).token,
    });
    assert(stale.issues.length);
    const complete = await f.resume(stale, { action: 'approve' });
    assert.equal(complete.phase, 'complete');
    assert.deepEqual(complete.draft.apiCalls[0].values.body, {
      sort: 'VIEWS',
      note: '0007',
      untouched: 'kept',
    });
    assert.equal(
      f.calls.filter((call) => call.name === 'analyze_workflow_draft_edit')
        .length,
      1,
    );
    assert.equal(
      f.calls.filter(
        (call) => call.name === 'select_draft_api_input_edit_targets',
      ).length,
      1,
    );
    assert.equal(
      f.calls.filter(
        (call) => call.name === 'generate_draft_api_input_edit_values',
      ).length,
      1,
    );
    assert.equal(
      complete.messages.find((message) => message.id === 'sort-answer').text,
      '조회수 순으로 해줘.',
    );
  });

test('natural edit extraction is revalidated against actual step, original pending contract, question token, reply and code-owned values', async () => {
  const f = await fixture();
  const stepId = f.pending.questions[0].stepId;
  const state = {
    ...f.pending,
    response: {
      action: 'reply-api-input-edits',
      stepId,
      token: conversationBoundary(f.pending).token,
      messageId: 'captured-answer',
      text: '조회수 순으로 해줘.',
    },
  };
  const update = await extractDraftConversationInputAnswers(
    state,
    f.dependencies,
  );
  const captured = { ...state, ...update };
  assert.equal(
    resolveDraftConversationApiInputEditAnswerExtraction(
      captured,
      f.dependencies,
    ).answers[0].value,
    'VIEWS',
  );
  for (const mutate of [
    (s) => {
      s.inputAnswerExtraction.kind = 'api-input';
    },
    (s) => {
      s.inputAnswerExtraction.stepId = 'foreign';
    },
    (s) => {
      s.inputAnswerExtraction.planId = 'foreign';
    },
    (s) => {
      s.inputAnswerExtraction.analysis.answers[0].value = 'NEW';
    },
    (s) => {
      s.inputAnswerExtraction.analysis.enumSelections[0].candidate.value =
        'NEW';
    },
    (s) => {
      s.response.text = '다른 답변';
    },
    (s) => {
      s.questions[0].apiInputEditTarget.pointer = '/body/untouched';
    },
    (s) => {
      s.bundles[0].apiInputContract.targets[0].pointer = '/body/untouched';
    },
  ]) {
    const changed = globalThis.structuredClone(captured);
    mutate(changed);
    assert.throws(() =>
      resolveDraftConversationApiInputEditAnswerExtraction(
        changed,
        f.dependencies,
      ),
    );
  }
  assert.throws(() =>
    resolveDraftConversationApiInputEditAnswerExtraction(captured, {
      ...f.dependencies,
      selectOasEnums: false,
    }),
  );
});
