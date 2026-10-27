import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planWorkflowConnections } from '@openapi-flow/langchain';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import {
  connectionPlanningFixture,
  explainConnections,
} from './fixtures/connection-planning-record-fixture.mjs';
import { nativePlanningRecordFixture } from './fixtures/native-planning-record-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI connection wire asks only for optional decision reasons, keeps code-owned fields absent and emits valid explicit 2020-12 schema', async () => {
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
        id: 'connection-wire',
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
                  id: 'connection-tool',
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
    for (const mode of [
      'disabled',
      'explained',
      'native-only',
      'missing-display',
    ]) {
      let { input, proposal } = connectionPlanningFixture();
      if (mode === 'native-only') {
        const fixture = nativePlanningRecordFixture();
        input = {
          scenario: '두 독립 JSON 출력',
          nativeNodes: fixture.nodes,
          capabilities: fixture.input.capabilities,
        };
        proposal = { edges: [], additionalGaps: [] };
      }
      const enabled = mode !== 'disabled';
      input.entrypoint = describeN8nManualTrigger();
      output = enabled ? explainConnections(proposal) : proposal;
      if (mode === 'missing-display') delete output.edges[0].reason;
      const result = await planWorkflowConnections({
        ...input,
        model,
        includeExplanations: enabled,
      });
      const request = requests.at(-1),
        wire = request.tools[0].function;
      assert.deepEqual(
        JSON.parse(request.messages[1].content).entrypoint,
        input.entrypoint,
      );
      assert.equal(
        Object.hasOwn(wire.parameters.properties, 'entrypoint'),
        false,
      );
      assert.equal(wire.name, 'plan_workflow_connections');
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
      assert.equal(
        validate(output),
        mode !== 'missing-display',
        JSON.stringify(validate.errors),
      );
      for (const field of [
        'starts',
        'nativeNodes',
        'additionalNativeNodes',
        'parameters',
        'values',
        'evidence',
      ])
        assert.equal(Object.hasOwn(wire.parameters.properties, field), false);
      assert.equal(
        Object.hasOwn(wire.parameters.properties, 'reason'),
        enabled,
      );
      assert.equal(
        Object.hasOwn(
          wire.parameters.properties.edges.items.properties,
          'reason',
        ),
        enabled,
      );
      assert.equal(
        Object.hasOwn(wire.parameters.properties, 'blockedCalls'),
        mode !== 'native-only',
      );
      assert.equal(
        Object.hasOwn(
          wire.parameters.properties.additionalGaps.items.properties,
          'reason',
        ),
        false,
      );
      assert.equal(validate({ ...output, evidence: [] }), false);
      if (enabled) {
        const missing = globalThis.structuredClone(output);
        delete missing.reason;
        assert.equal(validate(missing), false);
      }
      assert.equal(
        Object.hasOwn(result, 'connectionPlanning'),
        enabled && mode !== 'missing-display',
      );
      if (mode === 'missing-display') {
        assert.ok(result.connectionExplanationIssues.length > 0);
        assert.deepEqual(result.edges, connectionPlanningFixture().plan.edges);
      }
      assert.equal(
        JSON.parse(request.messages[1].content).scenario,
        input.scenario,
      );
    }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
