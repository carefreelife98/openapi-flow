import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import {
  planNativeNodes,
  selectNativeNodeInstances,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { nativeRuntimeInputFixture } from './fixtures/native-runtime-input-fixture.mjs';

test('actual tool schema and model capability materials agree on runtime parameter ownership', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const calls = [];
  let output;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push(JSON.parse(body));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'native-runtime-http',
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
                  id: 'native-output',
                  type: 'function',
                  function: {
                    name: 'plan_native_nodes',
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
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    for (const allowed of [false, true]) {
      output = {
        nativeNodes: [
          allowed
            ? {
                id: fixture.draft.nativeNodes[0].id,
                capability: fixture.draft.nativeNodes[0].capability,
                parameterSource: 'workflow-input',
              }
            : {
                id: 'merge',
                capability: 'merge-append',
                parameters: { numberInputs: 2 },
              },
        ],
        gaps: [],
      };
      await planNativeNodes({
        planId: `wire-${allowed}`,
        scenario: 'Use supplied declared contracts only.',
        model,
        capabilities: fixture.context.capabilities,
        allowRuntimeParameters: allowed,
      });
      const request = calls.at(-1);
      assert.equal(request.tools[0].function.name, 'plan_native_nodes');
      assert.equal(request.tools[0].function.strict, true);
      const variants =
        request.tools[0].function.parameters.properties.nativeNodes.items.anyOf;
      const materials = JSON.parse(request.messages[1].content).capabilities;
      for (const capability of materials) {
        const wireAllows = variants.some(
          (variant) =>
            variant.properties.capability.const === capability.name &&
            variant.properties.parameterSource?.const === 'workflow-input',
        );
        assert.equal(
          wireAllows,
          capability.parameterSources.includes('workflow-input'),
        );
      }
      assert.equal(
        materials
          .find((capability) => capability.name === 'runtime-context')
          .parameterSources.includes('workflow-input'),
        allowed,
      );
      assert.deepEqual(
        materials.find((capability) => capability.name === 'merge-append')
          .parameterSources,
        ['literal'],
      );
    }
    assert.equal(calls.length, 2);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('staged standalone calls transmit role-only then exact remaining-value JSON Schemas through ChatOpenAI', async () => {
  const fixture = await nativeRuntimeInputFixture();
  const calls = [];
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const outputs = [
    {
      instances: [
        {
          capability: 'runtime-context',
          purpose: 'actual context',
          parameterSource: 'workflow-fields',
          pointers: ['/count', '/marker'],
        },
      ],
      gaps: [],
    },
    {
      decision: {
        status: 'provided',
        parameters: {
          id: 'actual/id',
          enabled: false,
          nested: { 'a.b': [null, 'literal', 2] },
        },
      },
    },
  ];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    calls.push(parsed);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'native-stages-http',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(outputs[calls.length - 1]),
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
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const input = {
      planId: 'staged-wire',
      scenario:
        'Keep id actual/id, enabled false and nested values null, literal, 2; supply count and marker at execution.',
      capabilities: fixture.context.capabilities,
      allowRuntimeParameters: true,
    };
    const selected = await selectNativeNodeInstances({ ...input, model });
    const result = await generateNativeNodeParameters({
      ...input,
      model,
      selection: selected,
      nodeId: selected.instances[0].id,
    });
    assert.equal(result.status, 'ready');
    assert.equal(calls.length, 2);
    for (const [index, call] of calls.entries()) {
      assert.equal(call.response_format.type, 'json_schema');
      assert.equal(call.response_format.json_schema.strict, true);
      const validate = new Ajv2020({ strict: false }).compile(
        call.response_format.json_schema.schema,
      );
      assert.equal(
        validate(outputs[index]),
        true,
        JSON.stringify(validate.errors),
      );
    }
    const choice =
      calls[0].response_format.json_schema.schema.properties.instances.items;
    const materials = JSON.parse(calls[0].messages[1].content).capabilities;
    for (const material of materials) {
      const wireSources = choice.anyOf
        .filter(
          (variant) => variant.properties.capability.const === material.name,
        )
        .map((variant) => variant.properties.parameterSource.const);
      assert.deepEqual(wireSources, material.parameterSources);
    }
    assert.equal(JSON.stringify(choice).includes('"parameters"'), false);
    const values =
      calls[1].response_format.json_schema.schema.properties.decision.anyOf[0]
        .properties.parameters;
    assert.deepEqual(values.required, ['id', 'enabled', 'nested']);
    assert.equal(Object.hasOwn(values.properties, 'count'), false);
    assert.equal(Object.hasOwn(values.properties, 'marker'), false);
    const validate = new Ajv2020({ strict: false }).compile(
      calls[1].response_format.json_schema.schema,
    );
    assert.equal(
      validate({
        decision: {
          status: 'provided',
          parameters: { ...outputs[1].decision.parameters, count: 0 },
        },
      }),
      false,
    );
    assert.deepEqual(result.node.parameters, outputs[1].decision.parameters);
    assert.deepEqual(result.node.runtimeParameters, {
      pointers: ['/count', '/marker'],
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
