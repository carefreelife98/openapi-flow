import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import test from 'node:test';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const spec = JSON.parse(
  await readFile(
    new URL(
      '../examples/langgraph-workflow/specs/inventory.openapi.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const inputs = {
  workflowId: 'example-test',
  workflowName: 'Example test',
  scenario: 'Read item-1 price without cache',
  sources: [{ id: 'inventory', spec }],
  trace: [],
};
const deployments = [
  {
    documentId: 'inventory',
    baseUrl: 'https://inventory.example.test',
    credentialBindings: {
      bearer: { id: 'test-credential', name: 'Test Bearer' },
    },
  },
];

function scriptedModel(selection, values) {
  let calls = 0;
  return {
    withStructuredOutput(schema, options) {
      assert.ok(schema);
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          calls += 1;
          if (calls === 1) {
            assert.match(
              messages[0].content,
              /absence of a schema field.*is not evidence/,
            );
            assert.equal(options.method, 'jsonSchema');
            const data = JSON.parse(messages[1].content);
            // Find by operation pointer, not a fixed candidate array index.
            const candidate = data.candidates.find(
              (item) => item.path === '/products/{id}/price',
            );
            assert.ok(candidate);
            return selection(candidate);
          }
          assert.equal(calls, 2);
          assert.equal(options.method, 'functionCalling');
          assert.match(
            messages[0].content,
            /host checks missing required inputs/,
          );
          return { values };
        },
      };
    },
  };
}

const choosePrice = (candidate) => ({
  operations: [
    { candidateId: candidate.candidateId, purpose: 'Read only price' },
  ],
  gaps: [],
});

test('example CLI names missing configuration fields without leaking key material', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          '../examples/langgraph-workflow/dist/cli/generate-workflow.js',
          import.meta.url,
        ),
      ),
    ],
    {
      env: { LLM_API_KEY: 'local-test-secret-marker' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid example configuration:.*LLM_BASE_URL/);
  assert.match(result.stderr, /OAS_SOURCES_JSON/);
  assert.equal(result.stderr.includes('local-test-secret-marker'), false);
});

test('official graph uses public stages and exports credential references, not tokens', async () => {
  const graph = createWorkflowGenerationGraph({
    model: scriptedModel(choosePrice, {
      path: { id: 'item-1' },
      query: { enableCache: false },
    }),
    deployments,
  });
  const result = await graph.invoke({
    ...inputs,
    sources: [
      ...inputs.sources,
      {
        id: 'shipping',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Shipping', version: '1' },
          paths: {
            '/shipments': {
              get: {
                summary: 'List shipments',
                responses: { 200: { description: 'List' } },
              },
            },
          },
        },
      },
    ],
  });
  assert.equal(result.catalog.documents.length, 2);
  assert.deepEqual(result.trace, [
    'catalog',
    'select',
    'resolve',
    'arguments',
    'compile',
  ]);
  assert.equal(result.selection.operations[0].key.documentId, 'inventory');
  assert.equal(
    result.contracts[0].effective.parameters[0].schema.type,
    'string',
  );
  const node = result.workflow.nodes.find(
    (item) => item.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(node.credentials.httpBearerAuth.id, 'test-credential');
  assert.match(node.parameters.url, /inventory\.example\.test/);
  assert.equal(result.workflow.nodes.length, 2);
});

test('official graph refuses missing inputs without inventing values', async () => {
  const graph = createWorkflowGenerationGraph({
    model: scriptedModel(choosePrice, { query: { enableCache: false } }),
    deployments,
  });
  await assert.rejects(graph.invoke(inputs), /user clarification.*\/path\/id/);
});

test('official graph reports capability gaps before compiling', async () => {
  const graph = createWorkflowGenerationGraph({
    model: scriptedModel(
      () => ({
        operations: [],
        gaps: [
          {
            kind: 'missing_operation',
            description: 'No price API',
            candidateId: null,
          },
        ],
      }),
      {},
    ),
    deployments,
  });
  await assert.rejects(graph.invoke(inputs), /API selection needs review/);
});

test('official graph never infers multi-call DAG order from a selection array', async () => {
  const graph = createWorkflowGenerationGraph({
    model: scriptedModel(
      (candidate) => ({
        operations: [
          { candidateId: candidate.candidateId, purpose: 'First read' },
          { candidateId: candidate.candidateId, purpose: 'Second read' },
        ],
        gaps: [],
      }),
      {},
    ),
    deployments,
  });
  await assert.rejects(graph.invoke(inputs), /exactly one selected API/);
});

test('official graph templates missing deployment fields and rejects duplicate document IDs', async () => {
  const model = () => scriptedModel(choosePrice, { path: { id: 'item-1' } });
  const withoutDeployment = await createWorkflowGenerationGraph({
    model: model(),
    deployments: [],
  }).invoke(inputs);
  const templateRequest = withoutDeployment.workflow.nodes.find(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(
    templateRequest.parameters.url,
    'https://replace_me.invalid/products/item-1/price',
  );
  assert.equal(
    templateRequest.credentials.httpBearerAuth.id,
    'REPLACE_ME:inventory:bearer',
  );
  const withoutCredential = await createWorkflowGenerationGraph({
    model: model(),
    deployments: [{ ...deployments[0], credentialBindings: {} }],
  }).invoke(inputs);
  const credentialTemplate = withoutCredential.workflow.nodes.find(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  );
  assert.equal(
    credentialTemplate.parameters.url,
    'https://inventory.example.test/products/item-1/price',
  );
  assert.match(credentialTemplate.notes, /credentialBindings.bearer/);
  assert.throws(
    () =>
      createWorkflowGenerationGraph({
        model: model(),
        deployments: [deployments[0], deployments[0]],
      }),
    /duplicate documentId/,
  );
});
