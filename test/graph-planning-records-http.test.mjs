import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  planWorkflowGraph,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import {
  graphPlanningFixture,
  explainGraphOutput,
  graphPlannerInput,
} from './fixtures/graph-planning-record-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('both actual ChatOpenAI graph wires retain typed schemas and offer reasons without model-built evidence or fixed empty arrays', async () => {
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
        id: 'combined-graph-wire',
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
                  id: 'graph-tool',
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
    for (const mode of ['executable', 'reviewable'])
      for (const enabled of [false, true])
        for (const registry of ['native', 'empty']) {
          const fixture = graphPlanningFixture(mode),
            input = fixture.input;
          let proposal = fixture.output;
          if (registry === 'empty') {
            input.materials = input.materials.slice(0, 1);
            input.capabilities = [];
            proposal = {
              edges: [],
              ...(mode === 'reviewable'
                ? { additionalGaps: [], blockedCalls: [] }
                : { gaps: [] }),
            };
          }
          output = enabled ? explainGraphOutput(proposal) : proposal;
          const result = await (
            mode === 'reviewable'
              ? planReviewableWorkflowGraph
              : planWorkflowGraph
          )({
            ...graphPlannerInput(input),
            model,
            includeExplanations: enabled,
          });
          const wire = requests.at(-1).tools[0].function;
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
            Object.hasOwn(wire.parameters.properties, 'additionalNativeNodes'),
            registry === 'native',
          );
          if (registry === 'native') {
            const candidates =
              wire.parameters.properties.additionalNativeNodes.items.anyOf;
            assert.ok(
              candidates.some(
                (s) => s.properties.capability.const === 'merge-append',
              ),
            );
            assert.equal(
              Object.hasOwn(candidates[0].properties, 'reason'),
              enabled,
            );
          }
          for (const key of [
            'starts',
            'nativeNodes',
            'values',
            'evidence',
            'verification',
            'mode',
          ])
            assert.equal(Object.hasOwn(wire.parameters.properties, key), false);
          assert.equal(validate({ ...output, evidence: [] }), false);
          if (enabled) {
            const wrong = globalThis.structuredClone(output);
            delete wrong.reason;
            assert.equal(validate(wrong), false);
          }
          assert.equal(Object.hasOwn(result, 'graphPlanning'), enabled);
        }
    assert.equal(requests.length, 8);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
