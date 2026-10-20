import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import {
  selectApiOperations,
  analyzeApiSelection,
} from '@openapi-flow/langchain';
import { apiSelectionExplanationsFixture } from './fixtures/api-selection-explanations-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('real ChatOpenAI wire requires only a short reason when enabled; sources are attached after the response', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'discovery-reason-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(output) },
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
    const { context } = await apiSelectionExplanationsFixture();
    for (const includeExplanations of [false, true]) {
      const explanation = includeExplanations
        ? { explanation: { reason: '명시된 조회 범위와 후보가 일치합니다.' } }
        : {};
      for (const analyze of [false, true]) {
        output = {
          operations: [
            {
              candidateId: 'candidate-1',
              purpose: '회원 간단 조회',
              ...explanation,
            },
          ],
          gaps: [
            {
              description: '추가 환불 API는 제공되지 않았습니다.',
              ...explanation,
            },
          ],
          ...(analyze
            ? {
                questions: [
                  {
                    message: '어느 조회 범위가 필요한가요?',
                    purpose: '다른 회원 조회',
                    candidateIds: ['candidate-1', 'candidate-2'],
                    ...explanation,
                  },
                ],
              }
            : {}),
        };
        const result = await (
          analyze ? analyzeApiSelection : selectApiOperations
        )({ ...context, model, includeExplanations });
        const body = requests.at(-1);
        const wire = body.response_format.json_schema;
        assert.equal(
          wire.name,
          analyze ? 'analyze_api_selection' : 'select_api_operations',
        );
        assert.equal(wire.strict, true);
        const ajv = new Ajv2020({ strict: false });
        assert.equal(
          ajv.validateSchema(wire.schema),
          true,
          JSON.stringify(ajv.errors),
        );
        const validate = ajv.compile(wire.schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        const fields = [
          'operations',
          'gaps',
          ...(analyze ? ['questions'] : []),
        ];
        for (const field of fields) {
          const item = wire.schema.properties[field].items;
          assert.equal(
            Object.hasOwn(item.properties, 'explanation'),
            includeExplanations,
          );
          if (includeExplanations) {
            assert.ok(item.required.includes('explanation'));
            assert.deepEqual(
              Object.keys(item.properties.explanation.properties),
              ['reason'],
            );
            const missing = globalThis.structuredClone(output);
            delete missing[field][0].explanation;
            assert.equal(validate(missing), false);
            const generatedSources = globalThis.structuredClone(output);
            generatedSources[field][0].explanation.evidence = [];
            assert.equal(validate(generatedSources), false);
          }
        }
        const unknown = globalThis.structuredClone(output);
        unknown.operations[0].candidateId = 'not-supplied';
        assert.equal(validate(unknown), false);
        const payload = JSON.parse(body.messages[1].content);
        assert.deepEqual(payload.candidates[0].key, context.operations[0].key);
        assert.equal(body.messages[0].role, 'system');
        assert.equal(body.messages[1].role, 'user');
        assert.equal(
          JSON.stringify(payload).includes('contractOnlyField'),
          false,
        );
        const selection = analyze ? result.selection : result;
        assert.equal(
          Object.hasOwn(selection.operations[0], 'explanation'),
          includeExplanations,
        );
        if (includeExplanations)
          assert.equal(
            selection.operations[0].explanation.evidence[0].text,
            context.scenario,
          );
      }
    }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
