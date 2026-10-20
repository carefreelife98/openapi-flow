import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planNativeNodes } from '@openapi-flow/langchain';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual native tool wire keeps typed implementation schemas and distinguishes explained additions/no-additions without empty tuples or generated evidence', async () => {
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
        id: 'native-reason-wire',
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
                  id: 'native-tool',
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
    for (const mode of ['disabled', 'additions', 'no-additions', 'runtime']) {
      const { input, nodes, explained } = nativePlanningRecordFixture();
      input.entrypoint = describeN8nManualTrigger();
      const includeExplanations = mode !== 'disabled';
      output =
        mode === 'disabled'
          ? { nativeNodes: nodes, gaps: [] }
          : mode === 'no-additions'
            ? {
                decision: {
                  noAdditionalNodesReason: '준비된 재료만 유지합니다.',
                  gaps: [],
                },
              }
            : mode === 'runtime'
              ? {
                  decision: {
                    additions: [
                      {
                        node: {
                          id: 'runtime',
                          capability: input.capabilities[0].name,
                          parameterSource: 'workflow-input',
                        },
                        reason: '실행할 때 전체 값이 필요합니다.',
                      },
                    ],
                    gaps: [],
                  },
                }
              : explained;
      const result = await planNativeNodes({
        ...input,
        model,
        includeExplanations,
        allowRuntimeParameters: mode === 'runtime',
      });
      const request = requests.at(-1),
        wire = request.tools[0].function;
      assert.equal(wire.name, 'plan_native_nodes');
      assert.equal(wire.strict, true);
      assert.equal(
        wire.parameters.$schema,
        'https://json-schema.org/draft/2020-12/schema',
      );
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.parameters);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      assert.equal(validate({ ...output, evidence: [] }), false);
      assert.equal(
        JSON.stringify(wire.parameters).includes('"prefixItems":[]'),
        false,
      );
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.scenario, input.scenario);
      assert.deepEqual(payload.entrypoint, input.entrypoint);
      assert.equal(
        Object.hasOwn(wire.parameters.properties, 'entrypoint'),
        false,
      );
      assert.deepEqual(
        payload.capabilities[0].parameterSources,
        mode === 'runtime' ? ['literal', 'workflow-input'] : ['literal'],
      );
      assert.equal(Object.hasOwn(payload, 'model'), false);
      assert.equal(Object.hasOwn(payload, 'nativePlanning'), false);
      if (includeExplanations) {
        const variants = wire.parameters.properties.decision.anyOf;
        assert.equal(variants.length, 2);
        assert.equal(variants[0].properties.additions.minItems, 1);
        assert.deepEqual(
          Object.keys(variants[0].properties.additions.items.properties),
          ['node', 'reason'],
        );
        assert.equal(
          Object.hasOwn(variants[1].properties, 'nativeNodes'),
          false,
        );
        assert.equal(
          validate({ decision: { additions: [], gaps: [] } }),
          false,
        );
        if (mode === 'additions') {
          const missing = globalThis.structuredClone(output);
          delete missing.decision.additions[0].reason;
          assert.equal(validate(missing), false);
          const wrong = globalThis.structuredClone(output);
          wrong.decision.additions[0].node.parameters.count = '0';
          assert.equal(validate(wrong), false);
        }
      } else assert.ok(wire.parameters.properties.nativeNodes);
      assert.equal(
        Object.hasOwn(result, 'nativePlanning'),
        includeExplanations,
      );
    }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
