import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import {
  workflowDraftEditFixture,
  editDecision,
} from './fixtures/workflow-draft-edit-fixture.mjs';

const { default: Ajv } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv');

test('real ChatOpenAI wire contracts bind candidate and instance choices while optional evidence display never weakens current-request provenance', async () => {
  const input = await workflowDraftEditFixture();
  let output;
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    output = modelMessageEvidenceSelections(output);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-draft-edit',
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
    const ajv = new Ajv({ strict: false });
    for (const includeExplanations of [false, true]) {
      const decision = editDecision(
        { kind: 'add-api-call', operation: 'candidate-1' },
        'second item lookup',
      );
      if (includeExplanations)
        decision.explanation = {
          reason: 'The current request asks for a separate lookup instance.',
          evidence: [
            { kind: 'oas', candidateId: 'candidate-1' },
            ...decision.sources,
          ],
        };
      output = { decisions: [decision] };
      const plan = await analyzeWorkflowDraftEdit({
        ...input,
        model,
        options: { includeExplanations },
      });
      const wire = requests.at(-1);
      const format = wire.response_format.json_schema;
      assert.equal(format.name, 'analyze_workflow_draft_edit');
      assert.equal(format.strict, true);
      assert.equal(
        ajv.validateSchema(format.schema),
        true,
        JSON.stringify(ajv.errors),
      );
      const validate = ajv.compile(format.schema);
      assert.equal(validate(output), true, JSON.stringify(validate.errors));
      for (const changed of [
        { ...decision, operation: 'invented-operation' },
        { ...decision, newNodeId: 'invented-id' },
        { ...decision, values: {} },
        {
          ...decision,
          sources: [
            { kind: 'message', messageId: 'request-1', quote: 'Read a' },
          ],
        },
      ])
        assert.equal(validate({ decisions: [changed] }), false);
      assert.equal(validate({ ...output, baseRevision: 10 }), false);
      const inspected = expandLocalSchemaReferences(format.schema);
      assert.equal(inspected.properties.decisions.anyOf.length, 2);
      const branches = inspected.properties.decisions.anyOf[1].items.anyOf;
      const add = branches.find(
        (branch) => branch.properties.kind.const === 'add-api-call',
      );
      assert.deepEqual(add.properties.operation.enum, [
        'candidate-1',
        'candidate-2',
      ]);
      assert.equal(
        Object.hasOwn(add.properties, 'explanation'),
        includeExplanations,
      );
      assert.deepEqual(
        plan.steps[0].decision.operation,
        input.context.operations[0].key,
      );
      if (includeExplanations)
        assert.deepEqual(plan.steps[0].decision.explanation.evidence[0], {
          kind: 'oas',
          operation: input.context.operations[0].key,
          pointer: '',
        });
      const materials = JSON.parse(wire.messages[1].content);
      assert.deepEqual(materials.requestMessageIds, ['edit-1']);
      assert.deepEqual(materials.draft.apiCalls, input.draft.apiCalls);
      assert.equal(Object.hasOwn(materials.draft, 'approvals'), false);
      assert.equal(Object.hasOwn(materials.draft, 'revision'), false);
    }
    assert.equal(requests.length, 2);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
import { expandLocalSchemaReferences } from './fixtures/expand-local-schema-references.mjs';
