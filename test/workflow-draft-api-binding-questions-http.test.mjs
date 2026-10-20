import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planWorkflowDraftApiCallBindings } from '@openapi-flow/langchain';
import {
  apiCallPlanningFixture,
  apiCallEvidence,
} from './fixtures/workflow-draft-api-call-planning-fixture.mjs';
const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI wire schema bounds typed questions to selected request roots and contains no generated UI fields', async () => {
  let output;
  const requests = [];
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    requests.push(JSON.parse(text));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'typed-binding-wire',
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
    for (const includeExplanations of [false, true]) {
      const input = await apiCallPlanningFixture(
        'add-api-call',
        'replacement',
        includeExplanations,
      );
      output = {
        decision: {
          status: 'needs-clarification',
          mappings: [],
          questions: [
            {
              kind: 'choose-source',
              targetPointer: '/path/id',
              candidates: [{ sourceNodeId: 'source', sourcePointer: '/value' }],
            },
          ],
          ...apiCallEvidence(input),
        },
      };
      const result = await planWorkflowDraftApiCallBindings({
        ...input,
        model,
      });
      assert.equal(result.status, 'needs-clarification');
      const request = requests.at(-1),
        wire = request.response_format.json_schema;
      assert.equal(wire.strict, true);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.schema);
      assert.equal(validate(output), true);
      const bad = globalThis.structuredClone(output);
      bad.decision.questions[0].targetPointer = '/query/owner';
      assert.equal(validate(bad), false);
      const message = globalThis.structuredClone(output);
      message.decision.message = 'Ask about a different API';
      assert.equal(validate(message), false);
      for (const field of [
        'targetSchemas',
        'choices',
        'label',
        'operation',
        'questionId',
      ])
        assert(!JSON.stringify(wire.schema).includes(`"${field}"`));
      const payload = JSON.parse(request.messages[1].content);
      assert.deepEqual(payload.requestInputRoots, ['/path/id']);
      assert(payload.requestSchema.properties.path.properties.id);
      assert.equal(result.questions[0].nodeId, input.plan.steps[0].newNodeId);
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
