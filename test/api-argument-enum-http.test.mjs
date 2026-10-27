import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  createApiCatalog,
  resolveApiOperations,
  OpenApiFlowError,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

test('real ChatOpenAI transport exposes typed literal/source paths then only original enum/source IDs', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'wire-enum',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Wire enum fixture', version: '1' },
        paths: {
          '/ranking': {
            get: {
              parameters: [
                {
                  name: 'sort',
                  in: 'query',
                  schema: {
                    type: 'string',
                    enum: ['NEW', 'VIEWS'],
                    default: 'NEW',
                  },
                },
              ],
              responses: { 200: { description: 'Response' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const requests = [];
  let rejectEnumRequest = false;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const wire = body.tools[0].function;
    const payload = JSON.parse(
      body.messages.find((message) => message.role === 'user').content,
    );
    const output =
      wire.name === 'generate_api_arguments'
        ? {
            literalInputs: { state: 'not-provided' },
            requestedInputs: ['/query/sort'],
          }
        : {
            answers: [
              {
                requirementId: payload.questions[0].id,
                source: {
                  kind: 'oas-enum',
                  candidateId: payload.enumChoices[0].candidates.find(
                    (item) => item.value === 'VIEWS',
                  ).id,
                  intent: textInputSource(payload, '조회수'),
                },
                reason: '조회수 의도를 원본 OAS에서 선택했습니다.',
              },
            ],
          };
    requests.push({ body, payload, output });
    if (rejectEnumRequest && wire.name === 'extract_api_input_answers') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: 'private enum provider failure',
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'enum-source-wire',
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
                  id: 'enum-tool',
                  type: 'function',
                  function: {
                    name: wire.name,
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
      apiKey: 'loopback-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const result = await generateApiArguments({
      callId: 'ranking-read',
      operation,
      bindings: [],
      scenario: '조회수 순으로 조회해줘.',
      purpose: '랭킹 조회',
      selectOasEnums: true,
      model,
    });
    assert.deepEqual(result.values, { query: { sort: 'VIEWS' } });
    assert.equal(requests.length, 2);
    assert.deepEqual(
      requests.map(({ body }) => body.tools[0].function.name),
      ['generate_api_arguments', 'extract_api_input_answers'],
    );
    for (const { body, output } of requests) {
      const ajv = new Ajv2020({ strict: false });
      const schema = body.tools[0].function.parameters;
      assert.equal(
        ajv.validateSchema(schema),
        true,
        JSON.stringify(ajv.errors),
      );
      assert.equal(ajv.compile(schema)(output), true);
    }
    assert.equal(requests[1].payload.purpose, '랭킹 조회');
    assert.equal(requests[1].payload.reply, '조회수 순으로 조회해줘.');
    assert.equal(
      result.enumInterpretation.analysis.enumSelections[0].candidate.value,
      'VIEWS',
    );
    assert.equal(Object.hasOwn(result, 'literalGeneration'), false);
    assert.equal(
      Object.hasOwn(requests[0].body.tools[0].function, 'strict'),
      false,
    );
    assert.equal(requests[1].body.tools[0].function.strict, true);
    rejectEnumRequest = true;
    await assert.rejects(
      generateApiArguments({
        callId: 'ranking-read',
        operation,
        bindings: [],
        scenario: '조회수 순으로 조회해줘.',
        purpose: '랭킹 조회',
        selectOasEnums: true,
        model,
      }),
      (error) => {
        assert.ok(error instanceof OpenApiFlowError);
        assert.equal(error.diagnostic.code, 'MODEL_INVOCATION_FAILED');
        assert.equal(error.diagnostic.operation, 'analyzeApiInputAnswers');
        assert.equal(error.diagnostic.stage, 'model-invocation');
        assert.equal(error.diagnostic.httpStatus, 400);
        assert.equal(error.cause.status, 400);
        assert.equal(JSON.stringify(error).includes('private'), false);
        return true;
      },
    );
    assert.equal(
      requests.length,
      4,
      'Exactly one literal call and one enum call per invocation',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
