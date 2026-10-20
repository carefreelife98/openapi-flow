import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowDraft,
  describeWorkflowDraftEditContext,
  describeWorkflowPlanningContext,
} from '@openapi-flow/core';
import { resolveN8nNativePlanningFeatures } from '@openapi-flow/n8n';
import {
  analyzeWorkflowDraftEdit,
  clarifyWorkflowRequirements,
} from '@openapi-flow/langchain';
import { createWorkflowDraftEditSchema } from '../packages/langchain/dist/schemas/workflow-draft-edit-schema.js';
import { createWorkflowRequirementsSchema } from '../packages/langchain/dist/schemas/workflow-requirements-schema.js';
import { serializeStructuredOutputSchema } from '../packages/langchain/dist/schemas/serialize-structured-output-schema.js';

const { default: Ajv } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv');

test('OAS-owned resource definitions retain their existing explicit scope instead of being replaced by generated model definitions', () => {
  const shared = z.string();
  const schema = z
    .strictObject({
      first: shared,
      second: shared,
      value: z.unknown().meta({ $ref: '#/$defs/owned' }),
    })
    .meta({ $defs: { owned: { type: 'integer' } } });
  const wire = serializeStructuredOutputSchema(schema, 'draft-2020-12');
  const { Ajv2020 } = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  )('ajv/dist/2020.js');
  const validate = new Ajv2020({ strict: false }).compile(wire);
  assert.equal(validate({ first: 'first', second: 'second', value: 1 }), true);
  assert.equal(
    validate({ first: 'first', second: 'second', value: '1' }),
    false,
  );
  assert.deepEqual(wire.$defs, { owned: { type: 'integer' } });
});

function inspectWire(schema) {
  let enumValues = 0;
  const references = [],
    siblings = [],
    compositions = [];
  function visit(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.enum)) enumValues += value.enum.length;
    if (Object.hasOwn(value, 'allOf')) compositions.push(path);
    if (typeof value.$ref === 'string') {
      references.push(value.$ref);
      if (Object.keys(value).length !== 1) siblings.push(path);
    }
    for (const [name, child] of Object.entries(value))
      visit(child, `${path}/${name}`);
  }
  visit(schema);
  return { enumValues, references, siblings, compositions };
}

async function largeCatalog() {
  const count = 240;
  const spec = {
    openapi: '3.1.0',
    info: { title: 'Repeated candidate reference regression', version: '1' },
    paths: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `/lookup/${index}`,
        {
          get: {
            summary: `Read declared item ${index}`,
            responses: {
              200: {
                description: 'Original response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { value: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
    ),
  };
  const catalog = await createApiCatalog([{ id: 'source', spec }]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const context = {
    operations,
    capabilities: resolveN8nNativePlanningFeatures({}).planningCapabilities,
    messages: [{ id: 'request', text: 'Read the final declared lookup only.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'large-catalog',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  return { context, draft, requestMessageIds: ['request'], count };
}

test('shared official Zod definitions avoid repeated candidate enums without removing choices, descriptions or strict validation', async () => {
  const f = await largeCatalog();
  const context = describeWorkflowDraftEditContext(f);
  const candidates = Array.from(
    { length: f.count },
    (_, index) => `candidate-${index + 1}`,
  );
  const options = { includeExplanations: true, includeSuggestions: true };
  const limits = {
    maxCategories: 3,
    maxQuestionsPerCategory: 3,
    maxChoicesPerQuestion: 5,
    maxQuestionsPerRound: 6,
  };
  for (const schema of [
    createWorkflowDraftEditSchema(context, options, candidates),
    createWorkflowRequirementsSchema(
      limits,
      options,
      describeWorkflowPlanningContext(f.context),
      candidates.map((candidateId, index) => ({
        candidateId,
        operation: f.context.operations[index],
      })),
    ),
  ]) {
    const inline = JSON.parse(
      JSON.stringify(
        z.toJSONSchema(schema, {
          target: 'draft-7',
          io: 'input',
          reused: 'inline',
          cycles: 'ref',
        }),
      ),
    );
    const wire = serializeStructuredOutputSchema(
      schema,
      'draft-7',
      'input',
      'ref',
    );
    assert.ok(inspectWire(inline).enumValues > 1000);
    assert.ok(inspectWire(wire).enumValues < 1000);
    assert.ok(inspectWire(wire).references.length > 0);
    assert.deepEqual(inspectWire(wire).siblings, []);
    assert.deepEqual(inspectWire(wire).compositions, []);
    assert.ok(JSON.stringify(wire).includes('A short user-facing'));
    assert.equal(JSON.stringify(wire).includes('"quote"'), false);
    const ajv = new Ajv({ strict: false });
    assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
    assert.ok(ajv.compile(wire));
    // Every original candidate remains represented by its declared identity, including the last one.
    for (const id of candidates)
      assert.ok(JSON.stringify(wire).includes(`"${id}"`));
  }
});

test('actual ChatOpenAI transport retains shared definitions and all candidate choices for semantic and clarification calls', async () => {
  const f = await largeCatalog(),
    requests = [];
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const wire = JSON.parse(text);
    requests.push(wire);
    const format = wire.response_format.json_schema;
    const schema = format.schema;
    assert.equal(format.strict, true);
    assert.ok(inspectWire(schema).enumValues < 1000);
    assert.deepEqual(inspectWire(schema).siblings, []);
    assert.deepEqual(inspectWire(schema).compositions, []);
    const sources = [{ kind: 'message', messageId: 'request' }];
    const explanation = {
      reason: 'The request explicitly selects the final supplied operation.',
      evidence: [
        { kind: 'oas', candidateId: `candidate-${f.count}` },
        ...sources,
      ],
    };
    const output =
      format.name === 'analyze_workflow_draft_edit'
        ? {
            decisions: [
              {
                kind: 'add-api-call',
                operation: `candidate-${f.count}`,
                instruction: f.context.messages[0].text,
                sources,
                explanation,
              },
            ],
          }
        : {
            statements: [
              { text: f.context.messages[0].text, sources, explanation },
            ],
            categories: [],
            suggestions: [],
          };
    const validate = new Ajv({ strict: false }).compile(schema);
    assert.equal(validate(output), true, JSON.stringify(validate.errors));
    const invalid = globalThis.structuredClone(output);
    const record = invalid.decisions?.[0] ?? invalid.statements[0];
    record.explanation.evidence[0].candidateId = 'candidate-not-supplied';
    assert.equal(validate(invalid), false);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'shared-definition-response',
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
    const plan = await analyzeWorkflowDraftEdit({
      ...f,
      options: { includeExplanations: true },
      model,
    });
    assert.equal(
      plan.steps[0].decision.operation.operationRef,
      f.context.operations.at(-1).key.operationRef,
    );
    const round = await clarifyWorkflowRequirements({
      context: f.context,
      model,
      limits: {
        maxCategories: 3,
        maxQuestionsPerCategory: 3,
        maxChoicesPerQuestion: 5,
        maxQuestionsPerRound: 6,
      },
      options: { includeExplanations: true, includeSuggestions: true },
    });
    assert.equal(round.statements.length, 1);
    assert.equal(round.categories.length, 0);
    assert.equal(requests.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
