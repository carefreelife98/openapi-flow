import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { planWorkflowDraftNativeReferenceRepair } from '@openapi-flow/langchain';
import { describeWorkflowDraftNativeReferenceRepair } from '@openapi-flow/core';
import {
  nativeReferenceRepairFixture,
  nativeReferenceProposal,
} from './fixtures/workflow-draft-native-reference-repair-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { default: Ajv } = require('ajv');

test('actual ChatOpenAI repair requests have fixed reference keys, actual API enums and optional evidence', async () => {
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'reference-repair',
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
    for (const includeExplanations of [false, true]) {
      const input = await nativeReferenceRepairFixture(includeExplanations);
      const context = describeWorkflowDraftNativeReferenceRepair(input);
      output = nativeReferenceProposal(input, [
        { kind: 'bind', sourceNodeId: 'source', sourcePointer: '/renamed' },
      ]);
      const result = await planWorkflowDraftNativeReferenceRepair({
        ...input,
        model,
      });
      assert.equal(result.status, 'ready');
      const request = requests.at(-1);
      const wire = request.response_format.json_schema;
      assert.equal(wire.strict, true);
      assert.equal(wire.name, 'plan_draft_native_reference_repair');
      assert.equal(wire.schema.type, 'object');
      const ajv = new Ajv({ strict: false });
      assert.equal(ajv.validateSchema(wire.schema), true);
      const validate = ajv.compile(wire.schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      assert.equal(validate({ decisions: {} }), false);
      const id = context.bindings[0].id;
      const choice = wire.schema.properties.decisions.properties[id].anyOf.find(
        (choice) => choice.properties.kind.const === 'bind',
      );
      assert.deepEqual(choice.properties.sourceNodeId.enum, [
        'source',
        'follow',
        'independent',
      ]);
      assert.equal(
        Object.hasOwn(choice.properties, 'explanation'),
        includeExplanations,
      );
      assert.deepEqual(choice.properties.sourceMessageIds.items.enum, [
        'edit-1',
      ]);
      assert.equal(JSON.stringify(wire.schema).includes('"quote"'), false);
      assert.equal(
        result.decisions[context.bindings[0].id].sources[0].quote,
        context.messages[0].text,
      );
      for (const name of [
        'edits',
        'nodeId',
        'taskId',
        'fingerprint',
        'parameters',
        'bindingId',
      ])
        assert.equal(Object.hasOwn(choice.properties, name), false);
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.target.references[0].id, id);
      assert.equal(
        payload.sourceCandidates.find((source) => source.nodeId === 'source')
          .operation.path,
        '/replacement/{id}',
      );
      assert.equal(request.messages[0].role, 'system');
      assert.equal(request.messages[1].role, 'user');
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
