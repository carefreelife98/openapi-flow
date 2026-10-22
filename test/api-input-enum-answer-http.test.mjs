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
    const payload = JSON.parse(
      body.messages.find((message) => message.role === 'user').content,
    );
    const output = {
      answers: [
        {
          requirementId: requirements[0].id,
          source: {
            kind: 'oas-enum',
            candidateId: payload.enumChoices[0].candidates.find(
              (item) => item.value === 'NEW',
            ).id,
            intent: textInputSource(payload, '최신순'),
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
    for (const includeExplanations of [false, true]) {
      const result = await analyzeApiInputAnswers({
        model,
        requirements,
        reply: '최신순으로 해줘.',
        selectOasEnums: true,
        includeExplanations,
      });
      const { body, output } = requests.at(-1);
      const wire = body.tools[0].function;
      assert.equal(wire.strict, true);
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
      ]) {
        const value = globalThis.structuredClone(output);
        mutate(value);
        assert.equal(validate(value), false);
      }
      assert.equal(result.answers[0].value, 'NEW');
      assert.equal(result.enumSelections[0].reason, output.answers[0].reason);
      assert.equal(result.enumSelections[0].intent.sourceText, '최신순');
      assert.deepEqual(result.sources, []);
      assert.equal(Object.hasOwn(result, 'extraction'), includeExplanations);
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
