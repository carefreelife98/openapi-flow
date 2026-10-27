import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { analyzeApiRequestMediaType } from '@openapi-flow/langchain';
import { requestMediaDecisionFixture } from './fixtures/request-media-decisions-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('real ChatOpenAI media wire constrains only declared choice/null and optional same-call reason, never final policy or sources', async () => {
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
        id: 'request-media-fixture',
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
                  id: 'format-choice',
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
    const f = await requestMediaDecisionFixture();
    for (const includeExplanations of [false, true]) {
      output = {
        requestMediaType: null,
        ...(includeExplanations
          ? { explanation: { reason: '형식 미지정' } }
          : {}),
      };
      const result = await analyzeApiRequestMediaType({
        ...f,
        model,
        includeExplanations,
      });
      const request = requests.at(-1);
      const tool = request.tools[0].function;
      assert.equal(tool.name, 'select_api_request_media_type');
      assert.equal(tool.strict, true);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(tool.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(tool.parameters);
      assert.equal(validate(output), true);
      assert.equal(
        validate({ ...output, requestMediaType: 'application/xml' }),
        false,
      );
      assert.equal(validate({ ...output, policy: 'invented-policy' }), false);
      assert.equal(validate({ ...output, evidence: [] }), false);
      assert.equal(
        Object.hasOwn(tool.parameters.properties, 'explanation'),
        includeExplanations,
      );
      if (includeExplanations) {
        assert.equal(validate({ requestMediaType: null }), false);
        assert.deepEqual(
          Object.keys(tool.parameters.properties.explanation.properties),
          ['reason'],
        );
      }
      const payload = JSON.parse(request.messages[1].content);
      assert.deepEqual(
        payload.operation.requestBody,
        f.operation.operation.requestBody,
      );
      assert.equal(Object.hasOwn(payload.operation, 'responses'), false);
      assert.equal(result.kind, 'documented-default');
      assert.equal(result.assessment.requestMediaType, null);
      assert.equal(result.requestMediaType, 'application/json');
      assert.equal(
        Object.hasOwn(result.assessment, 'explanation'),
        includeExplanations,
      );
    }
    for (const explanation of [
      undefined,
      null,
      { reason: 10 },
      { reason: 'why', evidence: [] },
    ]) {
      output = {
        requestMediaType: 'application/x-www-form-urlencoded',
        ...(explanation === undefined ? {} : { explanation }),
      };
      const result = await analyzeApiRequestMediaType({
        ...f,
        model,
        includeExplanations: true,
      });
      assert.equal(result.kind, 'model-selection');
      assert.equal(
        result.requestMediaType,
        'application/x-www-form-urlencoded',
      );
      assert.equal(Object.hasOwn(result.assessment, 'explanation'), false);
    }
    output = { requestMediaType: 'application/xml' };
    await assert.rejects(
      analyzeApiRequestMediaType({ ...f, model, includeExplanations: true }),
    );
    assert.equal(requests.length, 7);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
