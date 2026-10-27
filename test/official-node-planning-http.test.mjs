import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  createN8nOfficialNodePlanningCatalog,
  createN8nOfficialNodeChoiceSchema,
  resolveN8nOfficialNodeChoice,
} from '@openapi-flow/n8n';
import { officialNodePlanningFixture } from './fixtures/official-node-planning-fixture.mjs';

test('LangChain transports an ID-only official-node choice schema and code resolves unchanged metadata for repeated roles', async () => {
  const catalog = createN8nOfficialNodePlanningCatalog(
    officialNodePlanningFixture(),
  );
  // Host composition: the OSS supplies the official ID choice; the host owns its role/reason presentation.
  const schema = z.strictObject({
    choices: z.array(
      z.strictObject({
        definitionId: createN8nOfficialNodeChoiceSchema(catalog),
        reason: z
          .string()
          .describe(
            'Brief reason for this node instance in the requested workflow',
          ),
      }),
    ),
  });
  const id = catalog.materials[0].definitionId;
  const expected = {
    choices: [
      {
        definitionId: id,
        reason: 'Combine the first independent result group.',
      },
      { definitionId: id, reason: 'Combine a separate later result group.' },
    ],
  };
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'local-official-node-choice',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(
                requests.length === 1
                  ? expected
                  : {
                      choices: [
                        {
                          definitionId: 'fixture.nodes.invented@9',
                          reason: 'Invalid fixture reply',
                        },
                      ],
                    },
              ),
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
    }).withStructuredOutput(schema, {
      name: 'choose_official_nodes',
      method: 'jsonSchema',
      strict: true,
    });
    const messages = [
      new SystemMessage(
        'Choose only supplied official definition IDs and briefly explain each requested role. Do not generate node implementations or copy metadata into the output.',
      ),
      new HumanMessage(
        JSON.stringify({
          scenario:
            'Combine two independent result groups at separate workflow stages.',
          materials: catalog.materials,
        }),
      ),
    ];
    const result = await model.invoke(messages);
    assert.deepEqual(result, expected);
    assert.equal(requests.length, 1);
    const wire = requests[0].response_format.json_schema;
    assert.equal(wire.strict, true);
    const require = createRequire(
      new URL('../packages/core/package.json', import.meta.url),
    );
    const { Ajv2020 } = require('ajv/dist/2020.js');
    const ajv = new Ajv2020({ strict: false });
    assert.equal(
      ajv.validateSchema(wire.schema),
      true,
      JSON.stringify(ajv.errors),
    );
    const validate = ajv.compile(wire.schema);
    assert.equal(validate(expected), true, JSON.stringify(validate.errors));
    assert.deepEqual(
      wire.schema.properties.choices.items.properties.definitionId.enum,
      catalog.materials.map((entry) => entry.definitionId),
    );
    for (const field of [
      'version',
      'nodeType',
      'definition',
      'properties',
      'parameters',
      'inputs',
      'outputs',
    ]) {
      const value = globalThis.structuredClone(expected);
      value.choices[0][field] = 'model must not generate official metadata';
      assert.equal(validate(value), false, field);
    }
    const resolved = result.choices.map((choice) =>
      resolveN8nOfficialNodeChoice(catalog, choice.definitionId),
    );
    assert.deepEqual(resolved, [catalog.materials[0], catalog.materials[0]]);
    assert.notEqual(resolved[0], resolved[1]);
    await assert.rejects(model.invoke(messages));
    assert.equal(
      requests.length,
      2,
      'No hidden retries of the rejected model output',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
