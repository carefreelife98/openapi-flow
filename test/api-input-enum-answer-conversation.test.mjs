import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalInputReplyFixture,
  pauseCanonicalInputReply,
} from './fixtures/canonical-input-reply-fixture.mjs';
import { clarificationSpec } from './fixtures/api-clarification-fixture.mjs';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';
import { describeDraftConversationEnumSelections } from '../examples/langgraph-workflow/dist/graph/draft-conversation/draft-conversation-context.js';
import { extractDraftConversationInputAnswers } from '../examples/langgraph-workflow/dist/graph/draft-conversation/extract-draft-conversation-input-answers.js';
import { resolveDraftConversationInputAnswerExtraction } from '../examples/langgraph-workflow/dist/graph/draft-conversation/resolve-draft-conversation-input-answer-extraction.js';

for (const includeExplanations of [false, true])
  test(`pending enum prose reply retains plan/question provenance and appears at question and review boundaries, explanations=${includeExplanations}`, async () => {
    const spec = globalThis.structuredClone(clarificationSpec);
    spec.paths['/members/{id}'].get.parameters[0].schema = {
      type: 'string',
      enum: ['NEW', 'VIEWS'],
    };
    const fixture = await canonicalInputReplyFixture({
      spec,
      includeExplanations,
      twoInputs: true,
      selectOasEnums: true,
      extract(call) {
        return [
          {
            requirementId: call.payload.questions.find(
              (question) => question.targetPointer === '/path/id',
            ).id,
            source: {
              kind: 'oas-enum',
              candidateId: call.payload.enumChoices[0].candidates.find(
                (item) => item.value === 'NEW',
              ).id,
              intent: textInputSource(call.payload, '최신순'),
            },
            reason: '최신순을 OAS 후보에서 선택했습니다.',
          },
        ];
      },
    });
    const { pending } = await pauseCanonicalInputReply(
      fixture,
      '조회 워크플로우를 만들어줘.',
    );
    const originalPlan = globalThis.structuredClone(pending.plan);
    const count = fixture.calls.length;
    const state = {
      ...pending,
      response: {
        action: 'reply-inputs',
        token: pending.__interrupt__[0].value.token,
        messageId: 'enum-answer',
        text: '최신순으로 해줘.',
      },
    };
    const extracted = await extractDraftConversationInputAnswers(
      state,
      fixture.dependencies,
    );
    const captured = { ...state, ...extracted };
    assert.equal(
      resolveDraftConversationInputAnswerExtraction(captured, true).answers[0]
        .value,
      'NEW',
    );
    assert.throws(
      () => resolveDraftConversationInputAnswerExtraction(captured, false),
      /differs/,
    );
    for (const mutate of [
      (s) => {
        s.inputAnswerExtraction.planId = 'other';
      },
      (s) => {
        s.inputAnswerExtraction.analysis.enumSelections[0].candidate.value =
          'VIEWS';
      },
      (s) => {
        s.response.token = 'stale';
      },
    ]) {
      const changed = globalThis.structuredClone(captured);
      mutate(changed);
      assert.throws(() =>
        resolveDraftConversationInputAnswerExtraction(changed, true),
      );
    }
    const partial = await fixture.resume(pending, {
      action: 'reply-inputs',
      messageId: 'enum-answer',
      text: '최신순으로 해줘.',
    });
    assert.deepEqual(partial.plan, originalPlan);
    assert.deepEqual(
      partial.questions.map((question) => question.requirement.targetPointer),
      ['/header/tenant'],
    );
    assert.equal(partial.__interrupt__[0].value.enumSelections[0].value, 'NEW');
    assert.equal(
      partial.__interrupt__[0].value.enumSelections[0].sourceText,
      '최신순',
    );
    assert.equal(partial.inputAnswerHistory[0].planId, originalPlan.id);
    assert.deepEqual(
      fixture.calls.slice(count).map((call) => call.name),
      ['extract_api_input_answers', 'extract_api_input_answers'],
    );
    const review = await fixture.resume(partial, {
      action: 'answer-inputs',
      messageId: 'tenant-answer',
      answers: [
        {
          requirementId: partial.questions[0].requirement.id,
          value: 'tenant-01',
        },
      ],
    });
    const receipt = review.__interrupt__[0].value.enumSelections[0];
    assert.equal(receipt.messageId, 'enum-answer');
    assert.equal(receipt.value, 'NEW');
    assert.deepEqual(
      describeDraftConversationEnumSelections({
        ...review,
        plan: { ...review.plan, id: 'new-plan' },
      }),
      [],
    );
    const complete = await fixture.resume(review, { action: 'approve' });
    assert.equal(complete.phase, 'complete');
    assert.deepEqual(complete.draft.apiCalls[0].values, {
      path: { id: 'NEW' },
      header: { tenant: 'tenant-01' },
    });
    assert.equal(complete.inputAnswerHistory[0].analysis.sources.length, 0);
    assert.equal(
      fixture.calls.filter(
        (call) => call.name === 'generate_draft_api_call_arguments',
      ).length,
      1,
    );
  });
