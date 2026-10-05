import assert from 'node:assert/strict';
import test from 'node:test';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { compileCatalogSequence } from '@openapi-flow/n8n/legacy';
import { createOperationCatalog } from '@openapi-flow/core/internal';
import { generateCatalogScenario } from '../../examples/legacy-generation/dist/generate-catalog-scenario.js';
import { proposeCatalogScenario } from '@openapi-flow/langchain/legacy';

const itemRef = '#/paths/~1items/post';
const readRef = '#/paths/~1items~1{id}/get';
const createSpec = {
  openapi: '3.1.0',
  info: { title: 'Catalog create', version: '1' },
  paths: {
    '/items': {
      post: {
        summary: 'Create item',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/items/{id}': {
      get: {
        summary: 'Read item from source A',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { 200: { description: 'ok' } },
      },
    },
  },
};
const readSpec = {
  openapi: '3.1.0',
  info: { title: 'Catalog read', version: '1' },
  paths: {
    '/items/{id}': {
      get: {
        summary: 'Read item from source B',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
const sources = [
  {
    id: 'writer',
    spec: createSpec,
    baseUrl: 'https://write.example.test/api',
    effectPolicy: { [itemRef]: 'write', [readRef]: 'read' },
    credentialBindings: {},
  },
  {
    id: 'reader',
    spec: readSpec,
    baseUrl: 'https://read.example.test/v2',
    effectPolicy: { [readRef]: 'read' },
    credentialBindings: {},
  },
];
const plan = {
  version: '1',
  goal: 'Create and then read an item',
  steps: [
    {
      id: 'create',
      documentId: 'writer',
      operationRef: itemRef,
      inputs: { body: { name: 'demo' } },
    },
    {
      id: 'read',
      documentId: 'reader',
      operationRef: readRef,
      inputs: { 'path.id': { fromStep: 'create', field: 'id' } },
    },
  ],
};

test('catalog keeps same operationRef distinct by document ID and compiles cross-document response binding', async () => {
  const catalog = await createOperationCatalog(sources);
  assert.equal(catalog.entries.length, 3);
  assert.equal(
    catalog.entries.filter((entry) => entry.candidate.operationRef === readRef)
      .length,
    2,
  );
  const result = await compileCatalogSequence({
    sources,
    profile: 'test',
    plan,
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.evidence.map((item) => item.documentId),
    ['writer', 'reader'],
  );
  assert.equal(
    result.workflow.nodes[1].parameters.url,
    'https://write.example.test/api/items',
  );
  assert.match(
    result.workflow.nodes[3].parameters.url,
    /read\.example\.test\/v2\/items/,
  );
  assert.match(
    result.workflow.nodes[3].parameters.url,
    /\$node\["Request create"\]\.json\.body\["id"\]/,
  );
  assert.deepEqual(
    result.workflow.nodes.map((item) => item.type),
    [
      'n8n-nodes-base.manualTrigger',
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.code',
      'n8n-nodes-base.httpRequest',
    ],
  );
  const duplicate = await compileCatalogSequence({
    sources,
    profile: 'read-only',
    plan: {
      version: '1',
      goal: 'Read from A',
      steps: [
        {
          id: 'a',
          documentId: 'writer',
          operationRef: readRef,
          inputs: { 'path.id': 'x' },
        },
      ],
    },
  });
  assert.equal(
    duplicate.workflow.nodes[1].parameters.url,
    'https://write.example.test/api/items/x',
  );
});

test('catalog returns distinct diagnostics and no executable workflow for gaps, missing input, and unsafe effects', async () => {
  const gap = await compileCatalogSequence({
    sources,
    profile: 'test',
    plan: {
      version: '1',
      goal: 'Need an unavailable API',
      steps: [],
      gaps: [
        {
          kind: 'missing_operation',
          description: 'No operation to approve the item',
        },
      ],
    },
  });
  assert.equal(gap.status, 'needs_capability');
  assert.equal(gap.workflow, undefined);
  assert.deepEqual(
    gap.diagnostics.map((item) => item.code),
    ['missing_operation'],
  );
  const missing = await compileCatalogSequence({
    sources,
    profile: 'test',
    plan: {
      version: '1',
      goal: 'Create',
      steps: [{ id: 'create', documentId: 'writer', operationRef: itemRef }],
    },
  });
  assert.equal(missing.status, 'needs_input');
  assert.equal(missing.workflow, undefined);
  assert.deepEqual(
    missing.diagnostics.map((item) => item.message),
    ['create.body'],
  );
  const blocked = await compileCatalogSequence({
    sources,
    profile: 'read-only',
    plan,
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.workflow, undefined);
  assert.deepEqual(
    blocked.diagnostics.map((item) => item.code),
    ['effect_not_approved'],
  );
  const unapprovedWrite = await compileCatalogSequence({
    sources: [{ ...sources[0], effectPolicy: { [itemRef]: 'read' } }],
    profile: 'test',
    plan: {
      version: '1',
      goal: 'Create',
      steps: [
        {
          id: 'create',
          documentId: 'writer',
          operationRef: itemRef,
          inputs: { body: { name: 'demo' } },
        },
      ],
    },
  });
  assert.equal(unapprovedWrite.status, 'blocked');
  assert.deepEqual(
    unapprovedWrite.diagnostics.map((item) => item.code),
    ['effect_not_approved'],
  );
  await assert.rejects(
    compileCatalogSequence({
      sources,
      profile: 'test',
      plan: { ...plan, steps: [{ ...plan.steps[0], documentId: 'absent' }] },
    }),
    /documentId is not in sources/,
  );
  await assert.rejects(
    createOperationCatalog([...sources, sources[0]]),
    /duplicate id/,
  );
});

test('catalog model can propose a capability gap without an executable placeholder', async () => {
  const model = {
    withStructuredOutput() {
      return {
        invoke: async () => ({
          steps: [],
          gaps: [
            { kind: 'missing_operation', description: 'No API for approval' },
          ],
        }),
      };
    },
  };
  const result = await generateCatalogScenario({
    sources,
    scenario: 'Approve the item',
    model,
    profile: 'test',
  });
  assert.equal(result.status, 'needs_capability');
  assert.equal(result.workflow, undefined);
  assert.deepEqual(
    result.diagnostics.map((item) => item.code),
    ['missing_operation'],
  );
  const enhancementModel = {
    withStructuredOutput() {
      return {
        invoke: async () => ({
          steps: [],
          gaps: [
            {
              kind: 'insufficient_contract',
              description: 'Create response needs an approval token',
              candidateId: 'candidate-1',
            },
          ],
        }),
      };
    },
  };
  const enhancement = await generateCatalogScenario({
    sources,
    scenario: 'Create and approve an item',
    model: enhancementModel,
    profile: 'test',
  });
  assert.equal(enhancement.status, 'needs_capability');
  assert.equal(enhancement.workflow, undefined);
  assert.deepEqual(enhancement.diagnostics, [
    {
      code: 'insufficient_contract',
      message: 'Create response needs an approval token',
      documentId: 'writer',
      operationRef: itemRef,
    },
  ]);
});

test('LangChain catalog planning selects ordered operations and typed per-step values without node JSON', async () => {
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          calls.push(options.name);
          const request = JSON.parse(messages[1].content);
          const wire = toJsonSchema(schema);
          if (options.name === 'select_scenario_operations') {
            assert.equal(options.method, 'jsonSchema');
            assert.equal(request.candidates.length, 3);
            return {
              steps: [
                { candidateId: 'candidate-1', purpose: 'create item' },
                { candidateId: 'candidate-3', purpose: 'read created item' },
              ],
              gaps: [],
            };
          }
          assert.equal(options.method, 'functionCalling');
          if (request.stepId === 'step-1') {
            assert.equal(
              wire.properties.inputs.properties.body.properties.name.type,
              'string',
            );
            return { inputs: { body: { name: 'demo' } }, references: [] };
          }
          assert.deepEqual(request.previous, [
            { id: 'step-1', responseFields: ['id'] },
          ]);
          assert.deepEqual(
            wire.properties.references.items.properties.target.enum,
            ['path.id'],
          );
          assert.deepEqual(
            wire.properties.references.items.properties.fromStep.enum,
            ['step-1'],
          );
          assert.deepEqual(
            wire.properties.references.items.properties.field.enum,
            ['id'],
          );
          return {
            inputs: {},
            references: [
              { target: 'path.id', fromStep: 'step-1', field: 'id' },
            ],
          };
        },
      };
    },
  };
  const input = { sources, scenario: 'Create demo, then read it', model };
  const proposed = await proposeCatalogScenario(input);
  assert.deepEqual(
    proposed.steps.map((step) => step.documentId),
    ['writer', 'reader'],
  );
  assert.deepEqual(proposed.steps[1].inputs['path.id'], {
    fromStep: 'step-1',
    field: 'id',
  });
  const result = await generateCatalogScenario({ ...input, profile: 'test' });
  assert.equal(result.status, 'complete');
  assert.ok(result.workflow);
  assert.deepEqual(calls, [
    'select_scenario_operations',
    'plan_scenario_step',
    'plan_scenario_step',
    'select_scenario_operations',
    'plan_scenario_step',
    'plan_scenario_step',
  ]);
});
