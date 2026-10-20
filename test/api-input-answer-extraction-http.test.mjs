import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { inspectApiArgumentRequirements } from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { clarificationOperation } from './fixtures/api-clarification-fixture.mjs';
import { jsonInputSource } from './fixtures/api-input-source-selection-fixture.mjs';
import { describeApiInputSources } from '@openapi-flow/core';

test('actual LangChain wire asks only for source selection and optional reasons, never duplicated values or evidence', async () => {
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const { operation } = await clarificationOperation();
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId: 'read',
    values: {},
    bindings: [],
  });
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
        id: 'answer-wire',
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
                  id: 'answer-tool',
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
    for (const enabled of [false, true]) {
      output = {
        answers: [
          {
            requirementId: requirements[0].id,
            source: jsonInputSource(
              {
                sources: describeApiInputSources(
                  '회원번호는 "member-01"입니다.',
                ),
              },
              '"member-01"',
            ),
            ...(enabled
              ? {
                  reason: 'The quoted member identifier answers this question.',
                }
              : {}),
          },
        ],
        ...(enabled
          ? { reason: 'The reply supplies the requested member identifier.' }
          : {}),
      };
      const result = await analyzeApiInputAnswers({
        requirements,
        reply: '회원번호는 "member-01"입니다.',
        model,
        includeExplanations: enabled,
      });
      const wire = requests.at(-1).tools[0].function;
      assert.equal(wire.strict, true);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(
        ajv.validateSchema(wire.parameters),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(wire.parameters);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      const fields = wire.parameters.properties.answers.items.properties;
      for (const key of [
        'value',
        'evidence',
        'verification',
        'unansweredRequirementIds',
        'sourceText',
        'sourceFormat',
      ])
        assert.equal(Object.hasOwn(fields, key), false);
      assert.equal(Object.hasOwn(fields, 'reason'), enabled);
      const system = requests
        .at(-1)
        .messages.find((message) => message.role === 'system');
      assert.match(
        system.content,
        /Write generated reason text in the user's language/,
      );
      assert.match(
        system.content,
        /Never translate or rewrite input values, identifiers or original source spans/,
      );
      if (enabled) {
        for (const reason of [
          wire.parameters.properties.reason,
          fields.reason,
        ]) {
          assert.match(reason.description, /in the user's language/);
          assert.match(
            reason.description,
            /Never translate input values, identifiers or original source spans/,
          );
        }
        assert.equal(
          result.extraction.decision.reason,
          output.reason,
          'The OSS must retain the actual model explanation, not post-translate or repair it',
        );
        assert.equal(
          result.extraction.decision.answers[0].reason,
          output.answers[0].reason,
        );
      }
      const invented = globalThis.structuredClone(output);
      invented.answers[0].value = 'invented';
      assert.equal(validate(invented), false);
      assert.equal(result.answers[0].value, 'member-01');
      assert.equal(Object.hasOwn(result, 'extraction'), enabled);
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
