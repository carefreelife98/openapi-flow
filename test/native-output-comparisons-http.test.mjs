import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
} from '@openapi-flow/core';
import {
  planNativeNodes,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import {
  createN8nNativeCapabilities,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { nativeComparisonFixture } from './fixtures/native-comparison-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI one-call and staged wires carry the same real native ID/pointer contract', async () => {
  const f = nativeComparisonFixture();
  const requests = [],
    failures = [];
  let output;
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const tool = body.tools?.[0]?.function;
      let wire, message, finishReason;
      if (tool !== undefined) {
        assert.equal(tool.strict, true);
        wire = tool.parameters;
        finishReason = 'tool_calls';
        message = {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'native-source-tool',
              type: 'function',
              function: { name: tool.name, arguments: JSON.stringify(output) },
            },
          ],
        };
      } else {
        assert.equal(body.response_format?.type, 'json_schema');
        assert.equal(body.response_format.json_schema.strict, true);
        wire = body.response_format.json_schema.schema;
        finishReason = 'stop';
        message = { role: 'assistant', content: JSON.stringify(output) };
      }
      const validate = new Ajv2020({ strict: false }).compile(wire);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      const wrong = globalThis.structuredClone(output);
      const parameters =
        tool === undefined
          ? wrong.decision.parameters
          : wrong.nativeNodes[0].parameters;
      parameters.conditions[0].left.nodeId = 'a-future-unconfigured-role';
      assert.equal(validate(wrong), false);
      parameters.conditions[0].left.nodeId = f.source.nodeId;
      parameters.conditions[0].left.pointer = '/not-declared';
      assert.equal(validate(wrong), false);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'native-comparison-wire',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4o',
          choices: [{ index: 0, finish_reason: finishReason, message }],
        }),
      );
    } catch (error) {
      failures.push(error);
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: { message: 'Synthetic schema verification failed' },
        }),
      );
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
    const producer = createJsonOutputCapability({
      name: 'typed-source',
      description: 'Original typed native item',
      parametersSchema: f.schema,
    });
    const input = {
      planId: 'native-comparison-wire',
      scenario: 'Continue only when the original amount exceeds minus one.',
      capabilities: [producer, ...createN8nNativeCapabilities()],
      preparedNativeNodes: [
        {
          id: f.source.nodeId,
          capability: producer.name,
          parameters: f.rows[0],
        },
      ],
    };
    const proposed = { id: 'gate', capability: 'if', parameters: f.parameters };
    output = { nativeNodes: [proposed], gaps: [] };
    const oneCall = await planNativeNodes({ ...input, model });
    assert.deepEqual(oneCall.nativeNodes, [proposed]);
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: 'if',
            purpose: 'Check amount',
            parameterSource: 'literal',
          },
        ],
        gaps: [],
      },
    });
    const nodeId = selection.instances[0].id;
    const dependencies = resolveNativeInstanceDependencies({
      ...input,
      selection,
      proposal: {
        sourcesByNodeId: { [nodeId]: { sourceNodeIds: [f.source.nodeId] } },
      },
    });
    output = { decision: { status: 'provided', parameters: f.parameters } };
    const staged = await generateNativeNodeParameters({
      ...input,
      selection,
      dependencies,
      nodeId,
      model,
    });
    assert.equal(staged.status, 'ready');
    assert.deepEqual(staged.node.parameters, oneCall.nativeNodes[0].parameters);
    assert.equal(requests.length, 2);
    assert.deepEqual(failures, []);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
