import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { suggestWorkflowReviewFollowUps } from '@openapi-flow/langchain';
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
        assert.equal(Object.hasOwn(payload.boundary, 'key'), false);
        assert.equal(Object.hasOwn(payload.boundary, 'revision'), false);
        assert.equal(Object.hasOwn(payload, 'fingerprint'), false);
      }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
