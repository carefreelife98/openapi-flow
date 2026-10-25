import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import test from 'node:test';
import { ChatOpenAI } from '@langchain/openai';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { z } from 'zod';
import {
  describeWorkflowPlanningContext,
  resolveWorkflowClarificationOptions,
} from '@openapi-flow/core';
import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import { createWorkflowRequirementsSchema } from '../packages/langchain/dist/schemas/workflow-requirements-schema.js';
import { serializeWorkflowRequirementsSchema } from '../packages/langchain/dist/schemas/serialize-workflow-requirements-schema.js';
import { workflowClarificationFixture } from './fixtures/workflow-clarification-fixture.mjs';
import { expandLocalSchemaReferences } from './fixtures/expand-local-schema-references.mjs';

const { default: Ajv } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv');

function referenceSiblingLocations(schema) {
  const found = [];
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (
      Object.hasOwn(value, '$ref') &&
      Object.keys(value).some((key) => key !== '$ref')
    )
      found.push(path);
    for (const [key, child] of Object.entries(value))
      visit(child, `${path}/${key}`);
  }
  visit(schema);
  return found;
}

test('official shared-definition serialization retains the source contract without framework-generated reference siblings', async () => {
  const input = await workflowClarificationFixture();
  const context = describeWorkflowPlanningContext(input.context);
  const schema = createWorkflowRequirementsSchema(
    input.limits,
    resolveWorkflowClarificationOptions(),
    context,
    context.operations.map((operation, index) => ({
      candidateId: `candidate-${index + 1}`,
      operation,
    })),
  );
  const inheritedText = z.string().min(1);
  const framework = toJsonSchema(
    z.strictObject({
      first: inheritedText.describe('First independently described field'),
      second: inheritedText.describe('Second independently described field'),
    }),
    {
      io: 'input',
      reused: 'ref',
      cycles: 'ref',
      override(context) {
        context.jsonSchema.title = 'clarify_workflow_requirements';
      },
    },
  );
  assert.ok(referenceSiblingLocations(framework).length > 0);
  const wire = serializeWorkflowRequirementsSchema(schema);
  assert.deepEqual(referenceSiblingLocations(wire), []);
  assert.equal(JSON.stringify(wire).includes('"$ref"'), true);
  assert.equal(JSON.stringify(wire).includes('"oneOf"'), false);
  assert.match(
    expandLocalSchemaReferences(wire).properties.statements.items.properties
      .text.description,
    /explicitly/,
  );
  assert.equal(wire.$schema, 'http://json-schema.org/draft-07/schema#');
  const validate = new Ajv({ strict: false }).compile(wire);
  assert.equal(validate(modelMessageEvidenceSelections(input.proposal)), true);
  const invalid = modelMessageEvidenceSelections(input.proposal);
  invalid.statements[0].sources[0].messageId = 'not-supplied';
  assert.equal(validate(invalid), false);
});

test('actual ChatOpenAI HTTP schemas reflect optional fields, candidate enums and valid JSON Schema', async () => {
  const input = await workflowClarificationFixture();
  const requests = [];
  let output;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    output = modelMessageEvidenceSelections(output);
    if (
      referenceSiblingLocations(
        requests.at(-1).response_format.json_schema.schema,
      ).length
    ) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: '$ref cannot have sibling keywords',
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-clarification-test',
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
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const validator = new Ajv({ strict: false });
    for (const includeExplanations of [false, true])
      for (const includeSuggestions of [false, true]) {
        output = globalThis.structuredClone(input.proposal);
        if (!includeExplanations) delete output.statements[0].explanation;
        if (!includeSuggestions) delete output.suggestions;
        const options = { includeExplanations, includeSuggestions };
        const round = await clarifyWorkflowRequirements({
          ...input,
          options,
          model,
        });
        assert.equal(round.categories.length, 0);
        const wire = requests.at(-1);
        const format = wire.response_format.json_schema;
        assert.equal(format.name, 'clarify_workflow_requirements');
        assert.equal(format.strict, true);
        assert.equal(
          validator.validateSchema(format.schema),
          true,
          JSON.stringify(validator.errors),
        );
        assert.equal(validator.compile(format.schema)(output), true);
        assert.equal(
          Object.hasOwn(format.schema.properties, 'suggestions'),
          includeSuggestions,
        );
        const statement = expandLocalSchemaReferences(format.schema).properties
          .statements.items;
        assert.equal(
          Object.hasOwn(statement.properties, 'explanation'),
          includeExplanations,
        );
        assert.equal(wire.messages[0].role, 'system');
        assert.equal(wire.messages[1].role, 'user');
        const payload = JSON.parse(wire.messages[1].content);
        assert.equal(payload.candidates[0].candidateId, 'candidate-1');
        assert.equal(
          payload.candidates.length,
          input.context.operations.length,
        );
        for (const [index, candidate] of payload.candidates.entries()) {
          const original = input.context.operations[index];
          assert.deepEqual(candidate.key, original.key);
          assert.equal(candidate.method, original.method);
          assert.equal(candidate.path, original.path);
          assert.equal(Object.hasOwn(candidate, 'operation'), false);
          assert.equal(Object.hasOwn(candidate, 'pathItem'), false);
          assert.equal(Object.hasOwn(candidate, 'effective'), false);
        }
        assert.equal(
          payload.capabilities.length,
          input.context.capabilities.length,
        );
        for (const capability of payload.capabilities)
          assert.equal(Object.hasOwn(capability, 'parametersSchema'), false);
        assert.deepEqual(payload.limits, input.limits);
        assert.equal(Object.hasOwn(format.schema.properties, 'id'), false);
      }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
import { modelMessageEvidenceSelections } from './fixtures/model-message-evidence-selections.mjs';
