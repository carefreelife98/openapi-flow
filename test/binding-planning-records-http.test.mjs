import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planApiBindings } from '@openapi-flow/langchain';
import { bindingPlan } from './fixtures/request-binding-fixture.mjs';
import {
  bindingPlanningFixture,
  explainedBindingProposal,
} from './fixtures/binding-planning-record-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI binding wire preserves strict pointer enums and requests only per-call reasons when enabled', async () => {
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
        id: 'binding-provenance-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'binding-decision',
                  type: 'function',
                  function: {
                    name: body.tools[0].function.name,
                    arguments: JSON.stringify(output),
                  },
                },
              ],
            },
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
      output = includeExplanations
        ? explainedBindingProposal()
        : globalThis.structuredClone(bindingPlan);
      const input = bindingPlanningFixture();
      const result = await planApiBindings({
        ...input,
        model,
        includeExplanations,
      });
      const request = requests.at(-1),
        wire = request.tools[0].function;
      assert.equal(wire.name, 'plan_api_bindings');
      assert.equal(wire.strict, true);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.parameters);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      const wrong = globalThis.structuredClone(output);
      wrong.calls[1].bindings[0].sourceNodeId = 'absent';
      assert.equal(validate(wrong), false);
      const callSchema = wire.parameters.properties.calls.items;
      assert.equal(
        Object.hasOwn(callSchema.properties, 'reason'),
        includeExplanations,
      );
      assert.deepEqual(Object.keys(wire.parameters.properties), [
        'calls',
        'gaps',
      ]);
      assert.equal(
        Object.hasOwn(
          wire.parameters.properties.gaps.items.properties,
          'reason',
        ),
        false,
      );
      const missing = globalThis.structuredClone(output);
      delete missing.calls[0].reason;
      assert.equal(validate(missing), !includeExplanations);
      assert.equal(validate({ ...output, evidence: [] }), false);
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.scenario, input.scenario);
      assert.deepEqual(
        payload.materials.map((x) => x.purpose),
        input.materials.map((x) => x.purpose),
      );
      assert.equal(Object.hasOwn(payload, 'bindingPlanning'), false);
      assert.deepEqual({ calls: result.calls, gaps: result.gaps }, bindingPlan);
      assert.equal(
        Object.hasOwn(result, 'bindingPlanning'),
        includeExplanations,
      );
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
