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
  createNativeOutputProjectionCapability,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { nativeComparisonFixture } from './fixtures/native-comparison-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('actual ChatOpenAI wires carry explicit measurement units without model-generated code or changed source values', async () => {
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
      let fieldVariants = 0;
      function inspectFields(value) {
        if (value === null || typeof value !== 'object') return;
        if (value.properties?.name && value.properties?.pointer) {
          fieldVariants++;
          if (Object.hasOwn(value.properties, 'measurement'))
            assert.ok(
              value.required.includes('measurement'),
              'The measured variant must require its unit',
            );
        }
        for (const child of Object.values(value)) inspectFields(child);
      }
      inspectFields(wire);
      assert.ok(
        fieldVariants >= 2,
        'Copy and measured fields must have distinct strict object alternatives',
      );
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      const wrong = globalThis.structuredClone(output);
      const parameters =
        tool === undefined
          ? wrong.decision.parameters
          : wrong.nativeNodes[0].parameters;
      parameters.sourceNodeId = 'a-future-unconfigured-role';
      assert.equal(validate(wrong), false);
      parameters.sourceNodeId = f.source.nodeId;
      parameters.fields[0].pointer = '/not-declared';
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
      scenario:
        'Copy original code and values. Add code length in UTF-16 code units and count array items as separate derived fields.',
      capabilities: [
        producer,
        createNativeOutputProjectionCapability({ sources: [f.source] }),
      ],
      preparedNativeNodes: [
        {
          id: f.source.nodeId,
          capability: producer.name,
          parameters: f.rows[0],
        },
      ],
    };
    const parameters = {
      sourceNodeId: f.source.nodeId,
      fields: [
        { name: 'originalCode', pointer: '/item/code' },
        { name: 'originalValues', pointer: '/item/values' },
        {
          name: 'codeLength',
          pointer: '/item/code',
          measurement: 'utf16-code-units',
        },
        {
          name: 'valueCount',
          pointer: '/item/values',
          measurement: 'array-items',
        },
      ],
    };
    const proposed = {
      id: 'summary',
      capability: 'project-native-output',
      parameters,
    };
    output = { nativeNodes: [proposed], gaps: [] };
    const oneCall = await planNativeNodes({ ...input, model });
    assert.deepEqual(oneCall.nativeNodes, [proposed]);
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: 'project-native-output',
            purpose:
              'Keep original fields and explicitly requested length measurements',
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
    output = { decision: { status: 'provided', parameters } };
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
