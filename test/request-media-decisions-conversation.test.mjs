import assert from 'node:assert/strict';
import test from 'node:test';
import { validateApiRequestMediaTypeDecision } from '@openapi-flow/core';
import {
  requestMediaConversationFixture,
  requestMediaConversationModel,
} from './fixtures/request-media-decisions-fixture.mjs';

for (const choice of ['application/x-www-form-urlencoded', null])
  for (const includeExplanations of [false, true])
    test(`canonical conversation retains the media assessment and code resolution at its actual stage: ${choice}, explanations=${includeExplanations}`, async () => {
      const model = requestMediaConversationModel(choice);
      const f = await requestMediaConversationFixture({
        model,
        includeExplanations,
      });
      const scenario =
        choice === null
          ? f.scenario
          : `${f.scenario} 요청 형식은 application/x-www-form-urlencoded야.`;
      const state = await f.graph.invoke(
        {
          input: {
            initialDraft: f.draft,
            request: {
              id: 'media-request',
              text: scenario,
              expectedRevision: 0,
            },
          },
        },
        f.config,
      );
      assert.equal(state.phase, 'complete');
      const media = Object.values(state.stageResults).find(
        (result) => result.kind === 'request-media',
      );
      assert.ok(media);
      assert.equal(
        media.decision.kind,
        choice === null ? 'documented-default' : 'model-selection',
      );
      assert.equal(media.decision.assessment.requestMediaType, choice);
      const suppliedScenario = model.calls.find(
        (call) => call.name === 'select_api_request_media_type',
      ).payload.scenario;
      assert.equal(
        Object.hasOwn(media.decision.assessment, 'explanation'),
        includeExplanations,
      );
      if (includeExplanations) {
        assert.ok(media.decision.assessment.explanation.reason);
        assert.equal(
          media.decision.assessment.explanation.evidence[0].text,
          suppliedScenario,
        );
      }
      assert.equal(
        JSON.parse(suppliedScenario).messages.find(
          (message) => message.id === 'media-request',
        ).text,
        scenario,
      );
      validateApiRequestMediaTypeDecision({
        operation: f.operation,
        scenario: suppliedScenario,
        decision: media.decision,
      });
      assert.equal(
        state.draft.apiCalls[0].requestMediaType,
        choice === null ? 'application/json' : choice,
      );
      assert.deepEqual(state.draft.apiCalls[0].values, {
        body: { label: 'fixture-label', count: 3 },
      });
      assert.equal(
        model.calls.filter(
          (call) => call.name === 'select_api_request_media_type',
        ).length,
        1,
      );
      const stored = (await f.graph.getState(f.config)).values;
      assert.deepEqual(stored.stageResults, state.stageResults);
    });
