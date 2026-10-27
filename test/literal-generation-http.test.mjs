import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { generateApiArguments } from '@openapi-flow/langchain';
import { literalGenerationFixture } from './fixtures/literal-generation-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('real ChatOpenAI wire schema selects source IDs only for multiple explicit messages', async () => {
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
        id: 'literal-message-fixture',
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
                  id: 'literal-message',
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
    const fixture = await literalGenerationFixture();
    for (const count of [1, 2]) {
      const literalSourceMessages = [
        { id: 'request', text: 'Use quantity 2.' },
        ...(count === 2
          ? [{ id: 'answer', text: 'Keep all other values absent.' }]
          : []),
      ];
      output = {
        literalInputs: {
          state: 'provided',
          values: { body: { quantity: 2 } },
          literalSources: [
            {
              targetPointer: '/body/quantity',
              sourceFormat: 'json',
              sourceText: '2',
              ...(count === 2 ? { messageId: 'request' } : {}),
            },
          ],
        },
        requestedInputs: [],
      };
      const result = await generateApiArguments({
        ...fixture,
        scenario: JSON.stringify({
          requests: literalSourceMessages.map((item) => item.text),
        }),
        literalSourceMessages,
        model,
      });
      const wire = requests.at(-1).tools[0].function.parameters;
      const ajv = new Ajv2020({ strict: false });
      assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
      const validate = ajv.compile(wire);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      const changed = globalThis.structuredClone(output);
      changed.literalInputs.literalSources[0].messageId = 'invented';
      assert.equal(validate(changed), false);
      if (count === 2) {
        delete changed.literalInputs.literalSources[0].messageId;
        assert.equal(validate(changed), false);
      }
      assert.equal(result.literalSources[0].messageId, 'request');
      assert.deepEqual(result.values.body, {
        id: 'confirmed-original',
        quantity: 2,
      });
      assert.deepEqual(
        JSON.parse(requests.at(-1).messages[1].content).literalSourceMessages,
        literalSourceMessages,
      );
    }
    assert.equal(requests.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('real ChatOpenAI literal schema preserves OAS value types/ownership and asks only for values plus an optional short reason', async () => {
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
        id: 'literal-reason-fixture',
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
                  id: 'literal-values',
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
    const input = await literalGenerationFixture();
    for (const includeExplanations of [false, true]) {
      output = {
        values: {
          body: {
            quantity: 2,
            enabled: false,
            notes: null,
            tags: ['unchanged'],
          },
        },
        ...(includeExplanations
          ? { explanation: { reason: '역할에 명시한 값만 추출했습니다.' } }
          : {}),
      };
      const result = await generateApiArguments({
        ...input,
        model,
        includeExplanations,
      });
      const request = requests.at(-1);
      const wire = request.tools[0].function;
      assert.equal(wire.name, 'generate_api_arguments');
      assert.equal(wire.strict, undefined);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.parameters);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      assert.equal(validate({ ...output, values: {} }), true);
      assert.equal(
        validate({ ...output, values: { body: { quantity: '2' } } }),
        false,
      );
      assert.equal(
        validate({ ...output, values: { body: { id: 'confirmed-original' } } }),
        false,
      );
      assert.equal(
        Object.hasOwn(wire.parameters.properties, 'explanation'),
        includeExplanations,
      );
      if (includeExplanations) {
        assert.equal(validate({ values: {} }), false);
        assert.equal(
          validate({ ...output, explanation: { reason: 'why', evidence: [] } }),
          false,
        );
        assert.deepEqual(
          Object.keys(wire.parameters.properties.explanation.properties),
          ['reason'],
        );
      }
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.purpose, input.purpose);
      assert.deepEqual(
        payload.literalInputSchema.properties.values,
        wire.parameters.properties.values,
      );
      assert.equal(
        Object.hasOwn(payload.literalInputSchema.properties, 'explanation'),
        false,
      );
      assert.equal(
        JSON.stringify(payload).includes('confirmed-original'),
        false,
      );
      assert.equal(Object.hasOwn(payload, 'confirmedInputs'), false);
      assert.equal(Object.hasOwn(payload, 'bindings'), false);
      assert.equal(result.values.body.quantity, 2);
      assert.equal(result.values.body.id, 'confirmed-original');
      assert.equal(
        Object.hasOwn(result, 'literalGeneration'),
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
