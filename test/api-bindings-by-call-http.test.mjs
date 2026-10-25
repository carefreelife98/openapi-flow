import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planApiBindingsByCall } from '@openapi-flow/langchain';
import { materials, bindingPlan } from './fixtures/request-binding-fixture.mjs';
import { createApiBindingSourceDecisionFixture } from './fixtures/api-binding-source-decision-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('real ChatOpenAI sends valid per-call tool schemas and retrieved original sources over HTTP', async () => {
  const validator = new Ajv2020({ strict: false });
  let requests = 0;
  let serverFailure;
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      const tool = body.tools[0].function;
      assert.equal(validator.validateSchema(tool.parameters), true);
      assert.equal(tool.strict, true);
      assert.equal(Object.hasOwn(tool.parameters.properties, 'calls'), false);
      assert.equal(Object.hasOwn(tool.parameters.properties, 'callId'), false);
      if (tool.name === 'select_api_binding_sources') {
        const decision = tool.parameters.properties.decision;
        assert.ok(Array.isArray(decision.anyOf));
        assert.equal(Object.hasOwn(decision, 'oneOf'), false);
        for (const branch of decision.anyOf) {
          assert.equal(typeof branch.properties.kind.const, 'string');
          assert.equal(branch.additionalProperties, false);
        }
      }
      const context = JSON.parse(body.messages[1].content);
      const target = bindingPlan.calls.find(
        (call) => call.callId === context.target.nodeId,
      );
      assert.ok(target);
      const reason = 'Only original response data is bound to this target.';
      const output =
        tool.name === 'select_api_binding_sources'
          ? createApiBindingSourceDecisionFixture({
              sourceNodeIds: [
                ...new Set(
                  target.bindings.map((binding) => binding.sourceNodeId),
                ),
              ],
              gaps: [],
              reason,
            })
          : {
              bindings: target.bindings.map(
                ({ targetPointer, sourceNodeId, sourcePointer }) => ({
                  targetPointer,
                  sourceNodeId,
                  sourcePointer,
                }),
              ),
              gaps: [],
              reason,
            };
      if (tool.name === 'plan_api_call_bindings') {
        assert.ok(
          context.apiSources.every((source) =>
            Object.hasOwn(source, 'responses'),
          ),
        );
        assert.equal(
          context.apiSources.some(
            (source) => source.nodeId === context.target.nodeId,
          ),
          false,
        );
      }
      requests++;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          id: `binding-${requests}`,
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
                    id: `call-${requests}`,
                    type: 'function',
                    function: {
                      name: tool.name,
                      arguments: JSON.stringify(output),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    } catch (error) {
      serverFailure = error;
      response.writeHead(500);
      response.end('{}');
    }
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
    const plan = await planApiBindingsByCall({
      scenario:
        'Use the source ID and unchanged branch outputs in the summary body.',
      materials,
      concurrency: 2,
      includeExplanations: true,
      model,
    });
    if (serverFailure) throw serverFailure;
    assert.deepEqual(plan.calls, bindingPlan.calls);
    assert.deepEqual(plan.gaps, []);
    assert.equal(requests, 8);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
