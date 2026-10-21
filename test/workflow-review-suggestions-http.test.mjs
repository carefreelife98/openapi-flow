import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  suggestWorkflowReviewFollowUps,
  WorkflowReviewSuggestionPlanningError,
} from '@openapi-flow/langchain';
import { reviewSuggestionsFixture } from './fixtures/workflow-review-suggestions-fixture.mjs';

const Ajv = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv').default;
test('actual ChatOpenAI follow-up wire contracts use ID-only evidence, exact question enums and optional reason/extension fields', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'follow-up-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(output) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    for (const includeExplanations of [false, true])
      for (const includeExtensions of [false, true]) {
        const input = await reviewSuggestionsFixture({
          includeExplanations,
          includeExtensions,
        });
        output = globalThis.structuredClone(input.proposal);
        output.suggestions[0].sources.push({
          kind: 'message',
          messageId: input.context.messages[0].id,
        });
        const result = await suggestWorkflowReviewFollowUps({
          ...input,
          model,
        });
        assert.equal(
          result.suggestions[0].sources[1].quote,
          input.context.messages[0].text,
        );
        const request = requests.at(-1);
        const wire = request.response_format.json_schema;
        const system = request.messages.find(
          (message) => message.role === 'system',
        )?.content;
        assert.match(
          system,
          /Review material is not evidence of existing user intent/u,
        );
        assert.match(
          system,
          /Never put internal candidate IDs.*user-facing text or reason/u,
        );
        assert.match(system, /same language as the user's request/u);
        assert.equal(wire.name, 'suggest_workflow_review_follow_ups');
        assert.equal(wire.strict, true);
        const ajv = new Ajv({ strict: false });
        assert.equal(
          ajv.validateSchema(wire.schema),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(wire.schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        for (const invalid of [
          { ...output, fingerprint: 'model-owned' },
          { suggestions: [{ ...output.suggestions[0], id: 'invented' }] },
          {
            suggestions: [
              { ...output.suggestions[0], questionIds: ['not-current'] },
            ],
          },
          {
            suggestions: [
              {
                ...output.suggestions[0],
                sources: [
                  {
                    kind: 'message',
                    messageId: input.context.messages[0].id,
                    quote: 'model quote',
                  },
                ],
              },
            ],
          },
        ])
          assert.equal(validate(invalid), false);
        const choices = wire.schema.properties.suggestions.items.anyOf;
        for (const choice of choices) {
          assert.match(
            choice.properties.text.description,
            /internal candidate IDs/u,
          );
          if (includeExplanations)
            assert.match(
              choice.properties.reason.description,
              /unapproved review material/u,
            );
        }
        assert.equal(
          choices.some(
            (choice) => choice.properties.kind.const === 'extend-workflow',
          ),
          includeExtensions,
        );
        assert.ok(
          choices.every(
            (choice) =>
              Object.hasOwn(choice.properties, 'reason') ===
              includeExplanations,
          ),
        );
        const payload = JSON.parse(request.messages[1].content);
        assert.equal(
          payload.boundary.contentRole,
          'review-material-not-user-intent',
        );
        assert.equal(Object.hasOwn(payload.boundary, 'key'), false);
        assert.equal(Object.hasOwn(payload.boundary, 'revision'), false);
        assert.equal(Object.hasOwn(payload, 'fingerprint'), false);
      }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('actual choice follow-up wire schemas select only original identities and derive replies without a repair or retry', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'choice-follow-up-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(output) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    for (const kind of ['single-choice', 'multiple-choice'])
      for (const includeExplanations of [false, true]) {
        const input = await reviewSuggestionsFixture({
          includeExplanations,
          includeExtensions: false,
        });
        const question = input.boundary.questions[0];
        question.answer = {
          kind,
          choices: [
            { id: 'first-original-choice', label: '원래 첫 번째 선택' },
            { id: 'second-original-choice', label: '원래 두 번째 선택' },
          ],
        };
        const before = globalThis.structuredClone(input);
        const choiceIds =
          kind === 'single-choice'
            ? ['second-original-choice']
            : ['second-original-choice', 'first-original-choice'];
        const suggestion = {
          kind: 'answer-choice',
          questionId: question.id,
          choiceIds,
          ...(includeExplanations
            ? { reason: '제공된 원래 선택지입니다.' }
            : {}),
        };
        output = { suggestions: [suggestion] };
        const result = await suggestWorkflowReviewFollowUps({
          ...input,
          model,
        });
        assert.deepEqual(input, before);
        assert.deepEqual(
          result.suggestions[0].choiceReply,
          kind === 'single-choice'
            ? { kind, questionId: question.id, choiceId: choiceIds[0] }
            : { kind, questionId: question.id, choiceIds },
        );
        assert.equal(
          result.suggestions[0].text,
          `${question.message}\n선택: ${kind === 'single-choice' ? '원래 두 번째 선택' : '원래 두 번째 선택, 원래 첫 번째 선택'}`,
        );
        assert.deepEqual(result.suggestions[0].sources, [
          { kind: 'review-question', questionId: question.id },
        ]);
        const request = requests.at(-1);
        const wire = request.response_format.json_schema;
        assert.equal(wire.strict, true);
        const ajv = new Ajv({ strict: false });
        assert.equal(ajv.validateSchema(wire.schema), true);
        const validate = ajv.compile(wire.schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        const variants = wire.schema.properties.suggestions.items.anyOf;
        assert.deepEqual(
          variants.map((variant) => variant.properties.kind.const),
          ['change-request', 'answer-choice'],
        );
        const choice = variants.find(
          (variant) => variant.properties.kind.const === 'answer-choice',
        );
        assert.deepEqual(
          Object.keys(choice.properties).sort(),
          [
            'kind',
            'questionId',
            'choiceIds',
            ...(includeExplanations ? ['reason'] : []),
          ].sort(),
        );
        assert.equal(choice.properties.questionId.const, question.id);
        assert.deepEqual(choice.properties.choiceIds.items.enum, [
          'first-original-choice',
          'second-original-choice',
        ]);
        assert.equal(choice.properties.choiceIds.minItems, 1);
        assert.equal(
          choice.properties.choiceIds.maxItems,
          kind === 'single-choice' ? 1 : 2,
        );
        const payload = JSON.parse(request.messages[1].content);
        assert.deepEqual(payload.boundary.questions, input.boundary.questions);
        for (const invalid of [
          { ...suggestion, questionId: 'not-current' },
          { ...suggestion, choiceIds: ['invented'] },
          { ...suggestion, choiceIds: [] },
          { ...suggestion, text: 'model-owned sentence' },
          { ...suggestion, sources: [] },
          { ...suggestion, choiceReply: {} },
        ])
          assert.equal(validate({ suggestions: [invalid] }), false);
        const callsBefore = requests.length;
        output = {
          suggestions: [
            {
              ...suggestion,
              choiceIds: ['first-original-choice', 'first-original-choice'],
            },
          ],
        };
        await assert.rejects(
          suggestWorkflowReviewFollowUps({ ...input, model }),
          (error) => {
            assert.ok(error instanceof WorkflowReviewSuggestionPlanningError);
            assert.equal(error.failure.stage, 'proposal-schema');
            assert.deepEqual(error.failure.output, output);
            assert.ok(error.cause instanceof Error);
            return true;
          },
        );
        assert.equal(requests.length, callsBefore + 1);
        assert.deepEqual(input, before);
      }
    assert.equal(requests.length, 8);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
