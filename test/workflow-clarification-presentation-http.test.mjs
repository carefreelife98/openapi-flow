import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import { workflowClarificationFixture } from './fixtures/workflow-clarification-fixture.mjs';
import { expandLocalSchemaReferences } from './fixtures/expand-local-schema-references.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const Ajv = require('ajv').default;

test('real LangChain HTTP preserves strict wire guidance but never promotes presentation errors into requirement failures', async () => {
  const requests = [];
  let output,
    responseStatus = 200;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(responseStatus, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        responseStatus === 200
          ? {
              id: 'clarification-presentation-fixture',
              object: 'chat.completion',
              created: 1,
              model: 'gpt-4o',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: JSON.stringify(output),
                  },
                },
              ],
            }
          : { error: { message: 'Controlled upstream unavailable' } },
      ),
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
    const input = await workflowClarificationFixture();
    const source = { kind: 'message', messageId: input.context.messages[0].id };
    const makeOutput = (explanation) => ({
      statements: [
        {
          text: input.context.messages[0].text,
          sources: [source],
          ...(explanation === undefined ? {} : { explanation }),
        },
      ],
      categories: [],
    });
    const invoke = () =>
      clarifyWorkflowRequirements({
        ...input,
        options: { includeExplanations: true, includeSuggestions: false },
        model,
      });
    output = makeOutput({
      reason: '명시된 조회 요청입니다.',
      evidence: [source],
    });
    const validRound = await invoke();
    assert.equal(
      validRound.statements[0].explanation.reason,
      '명시된 조회 요청입니다.',
    );
    const wire = requests[0].response_format.json_schema;
    assert.equal(wire.name, 'clarify_workflow_requirements');
    assert.equal(wire.strict, true);
    const ajv = new Ajv({ strict: false });
    assert.equal(
      ajv.validateSchema(wire.schema),
      true,
      JSON.stringify(ajv.errors),
    );
    const validate = ajv.compile(wire.schema);
    assert.equal(validate(output), true);
    const described = expandLocalSchemaReferences(wire.schema);
    const statement = described.properties.statements.items;
    assert(statement.required.includes('explanation'));
    assert.equal(
      statement.properties.explanation.properties.reason.type,
      'string',
    );
    assert.equal(
      Object.hasOwn(statement.properties.sources.items.properties, 'quote'),
      false,
    );

    // Missing/wrong types violate wire guidance; whitespace is still a JSON Schema string.
    for (const explanation of [
      undefined,
      null,
      { reason: 42, evidence: [source] },
      { reason: ' \n ', evidence: [source] },
    ]) {
      output = makeOutput(explanation);
      assert.equal(validate(output), typeof explanation?.reason === 'string');
      const round = await invoke();
      assert.equal(round.statements[0].explanation, undefined);
      assert.equal(round.statements[0].text, input.context.messages[0].text);
      assert.deepEqual(
        round.statements[0].sources,
        input.proposal.statements[0].sources,
      );
      assert.deepEqual(round.categories, []);
    }
    output = makeOutput({
      reason: null,
      evidence: [{ ...source, messageId: 'not-supplied' }],
    });
    await assert.rejects(invoke(), /model workflow requirements is invalid/);
    output = makeOutput(undefined);
    output.statements[0].sources[0] = { ...source, messageId: 'not-supplied' };
    await assert.rejects(invoke(), /model workflow requirements is invalid/);
    responseStatus = 503;
    await assert.rejects(invoke());
    assert.equal(
      requests.length,
      8,
      'No repair, retry or extra explanation call',
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
