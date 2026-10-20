import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import { requirementRestorationConversation } from './fixtures/workflow-draft-requirement-restoration-fixture.mjs';

test('actual strict ChatOpenAI schema enumerates removed IDs, excludes active/unknown identities and owns no restored fields', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'restore-wire',
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
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const fixture = requirementRestorationConversation(model);
    const context = {
      ...fixture.context,
      messages: [
        ...fixture.context.messages,
        { id: 'restore', text: 'Restore only the purpose requirement.' },
      ],
    };
    const { default: Ajv } = createRequire(
      new URL('../packages/core/package.json', import.meta.url),
    )('ajv');
    for (const includeExplanations of [false, true]) {
      output = {
        decisions: [
          {
            kind: 'restore-requirement',
            requirementId: 'purpose',
            instruction: 'Restore the purpose requirement only.',
            sources: [{ kind: 'message', messageId: 'restore' }],
            ...(includeExplanations
              ? {
                  explanation: {
                    reason:
                      'The current request explicitly restores this removed requirement.',
                    evidence: [{ kind: 'message', messageId: 'restore' }],
                  },
                }
              : {}),
          },
        ],
      };
      const plan = await analyzeWorkflowDraftEdit({
        draft: fixture.draft,
        context,
        requestMessageIds: ['restore'],
        model,
        options: { includeExplanations },
      });
      const wire = requests.at(-1).response_format.json_schema;
      assert.equal(wire.strict, true);
      const ajv = new Ajv({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      for (const changed of [
        { requirementId: 'unknown' },
        { requirementId: 'unchanged-pass' },
        { text: 'Invented replacement' },
        { state: 'confirmed' },
        { scope: { kind: 'workflow' } },
        { sourceMessageIds: ['prior-withdrawal'] },
      ]) {
        assert.equal(
          validate({ decisions: [{ ...output.decisions[0], ...changed }] }),
          false,
        );
      }
      assert.equal(plan.steps[0].decision.kind, 'restore-requirement');
      assert.deepEqual(plan.steps[0].stages, ['requirements']);
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
