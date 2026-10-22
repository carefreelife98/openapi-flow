import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { generateWorkflowDraftApiInputEdits } from '@openapi-flow/langchain';
import {
  createApiEnumEditFixture,
  enumEditSelection,
} from './fixtures/workflow-draft-api-enum-edit-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

test('the real ChatOpenAI wire schema accepts ID-only enum selection and rejects generated values, unknown IDs and other targets', async () => {
  const input = await createApiEnumEditFixture();
  const output = { values: { 'value-1': enumEditSelection(input, 'VIEWS') } };
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'enum-edit-fixture',
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
    const result = await generateWorkflowDraftApiInputEdits({
      ...input,
      model,
    });
    assert.equal(result.enumSelections[0].value, 'VIEWS');
    assert.equal(requests.length, 1);
    const wire = requests[0].response_format.json_schema;
    assert.equal(wire.name, 'generate_draft_api_input_edit_values');
    assert.equal(wire.strict, true);
    const ajv = new Ajv2020({ strict: false });
    assert.equal(
      ajv.validateSchema(wire.schema),
      true,
      JSON.stringify(ajv.errors),
    );
    const validate = ajv.compile(wire.schema);
    assert.equal(validate(output), true, JSON.stringify(validate.errors));
    assert.equal(
      validate({
        values: { 'value-1': { ...output.values['value-1'], value: 'VIEWS' } },
      }),
      false,
    );
    assert.equal(
      validate({
        values: {
          'value-1': {
            status: 'oas-enum',
            selection: {
              ...output.values['value-1'].selection,
              candidateId: 'foreign',
            },
          },
        },
      }),
      false,
    );
    const branches = wire.schema.properties.values.properties['value-1'].anyOf;
    const branch = branches.find(
      (item) => item.properties.status.const === 'oas-enum',
    );
    assert.deepEqual(
      Object.keys(branch.properties.selection.properties).sort(),
      ['candidateId', 'messageId', 'reason', 'sourceText'],
    );
    assert(branch.properties.selection.properties.reason.description);
    const payload = JSON.parse(requests[0].messages[1].content);
    assert.equal(payload.enumChoices.targets.length, 1);
    assert.equal(payload.enumChoices.targets[0].targetPointer, '/body/sort');
    assert.equal(requests[0].messages[0].role, 'system');
    assert.equal(requests[0].messages[1].role, 'user');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
