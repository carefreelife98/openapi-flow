import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { inspectApiArgumentRequirements } from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';
import { textInputSource } from './fixtures/api-input-source-selection-fixture.mjs';

function countEnumItems(schema) {
  if (schema === null || typeof schema !== 'object') return 0;
  return (
    (Array.isArray(schema.enum) ? schema.enum.length : 0) +
    Object.values(schema).reduce(
      (count, value) => count + countEnumItems(value),
      0,
    )
  );
}

test('actual ChatOpenAI transport sends a valid ID-only pending-enum schema with per-question candidates and required intent/reason', async () => {
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const { operation } = await clarificationOperation();
  const inspected = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
  const requirements = [
    {
      ...inspected.requirements[0],
      schema: { type: 'string', enum: ['NEW', 'VIEWS'] },
    },
  ];
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const enumItems = countEnumItems(body.tools[0].function.parameters);
    if (enumItems > 1000) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: { message: 'Structured-output enum budget exceeded' },
        }),
      );
      return;
    }
    const payload = JSON.parse(
      body.messages.find((message) => message.role === 'user').content,
    );
    let intent;
    if (payload.messageSources === undefined)
      intent = textInputSource(payload, '최신순');
    else {
      const message = payload.messageSources.find(
        (entry) => entry.messageId === 'request',
      );
      assert(message);
      intent = {
        ...textInputSource({ sources: message.sources }, '최신순'),
        ...(payload.messageSources.length === 1
          ? {}
          : { messageId: message.messageId }),
      };
    }
    const output = {
      answers: [
        {
          requirementId: requirements[0].id,
          source: {
            kind: 'oas-enum',
            candidateId: payload.enumChoices[0].candidates.find(
              (item) => item.value === 'NEW',
            ).id,
            intent,
          },
          reason: '최신순을 OAS 후보에서 선택했습니다.',
        },
      ],
      ...(Object.hasOwn(body.tools[0].function.parameters.properties, 'reason')
        ? { reason: '현재 답변의 정렬 의도를 선택했습니다.' }
        : {}),
    };
    requests.push({ body, output });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'enum-answer-wire',
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
                  id: 'enum-answer-tool',
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
    for (const [includeExplanations, reply, sourceMessages] of [
      [false, '최신순으로 해줘.'],
      [true, '최신순으로 해줘.'],
      [false, '업무 요구 설명 '.repeat(1000) + '최신순으로 해줘.'],
      [true, '업무 요구 설명 '.repeat(1000) + '최신순으로 해줘.'],
      [
        true,
        JSON.stringify({ context: 'Formatted context, not an intent source.' }),
        [{ id: 'request', text: '최신순으로 해줘.' }],
      ],
      [
        true,
        JSON.stringify({ context: 'Formatted context, not an intent source.' }),
        [
          { id: 'request', text: '최신순으로 해줘.' },
          { id: 'answer', text: '다른 필터는 필요 없어.' },
        ],
      ],
    ]) {
      const result = await analyzeApiInputAnswers({
        model,
        requirements,
        reply,
        ...(sourceMessages === undefined ? {} : { sourceMessages }),
        selectOasEnums: true,
        includeExplanations,
      });
      const { body, output } = requests.at(-1);
      const wire = body.tools[0].function;
      assert.equal(wire.strict, true);
      assert.ok(countEnumItems(wire.parameters) < 1000);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.parameters);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      for (const mutate of [
        (value) => {
          value.answers[0].source.candidateId = 'foreign';
        },
        (value) => {
          value.answers[0].source.value = 'VIEWS';
        },
        (value) => {
          value.answers[0].requirementId = 'other';
        },
        (value) => {
          delete value.answers[0].reason;
        },
        (value) => {
          value.answers[0].source.intent.startTokenId = 'invented';
        },
        (value) => {
          value.answers[0].source.intent.messageId = 'invented';
        },
      ]) {
        const value = globalThis.structuredClone(output);
        mutate(value);
        assert.equal(validate(value), false);
      }
      assert.equal(result.answers[0].value, 'NEW');
      assert.equal(result.enumSelections[0].reason, output.answers[0].reason);
      assert.equal(result.enumSelections[0].intent.sourceText, '최신순');
      if (sourceMessages !== undefined) {
        assert.equal(result.enumSelections[0].intent.messageId, 'request');
        assert.equal(
          Object.hasOwn(JSON.parse(body.messages[1].content), 'sources'),
          false,
        );
        if (sourceMessages.length > 1) {
          const missing = globalThis.structuredClone(output);
          delete missing.answers[0].source.intent.messageId;
          assert.equal(validate(missing), false);
        }
      }
      assert.deepEqual(result.sources, []);
      assert.equal(Object.hasOwn(result, 'extraction'), includeExplanations);
    }
    assert.equal(requests.length, 6);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
