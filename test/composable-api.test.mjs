import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
  createApiArgumentsSchema,
  validateApiArguments,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Inventory', version: '1' },
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
                required: ['name', 'quantity'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created' },
          400: { description: 'Invalid request' },
        },
      },
    },
    '/items/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Item identifier',
          schema: { type: 'string' },
        },
      ],
      get: {
        summary: 'Read item',
        responses: { 200: { description: 'Read' } },
      },
    },
  },
};

test('package runtime dependencies enforce core and independent adapter boundaries', async () => {
  for (const name of ['core', 'langchain', 'n8n']) {
    const manifest = JSON.parse(
      await readFile(
        new URL(`../packages/${name}/package.json`, import.meta.url),
        'utf8',
      ),
    );
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    };
    if (name === 'core') {
      assert.equal(
        Object.keys(dependencies).some(
          (dependency) =>
            dependency.startsWith('@langchain/') ||
            dependency.startsWith('@n8n/'),
        ),
        false,
      );
    } else {
      assert.equal(dependencies['@openapi-flow/core'], '0.2.0');
      assert.equal(
        dependencies[`@openapi-flow/${name === 'n8n' ? 'langchain' : 'n8n'}`],
        undefined,
      );
    }
  }
});

async function contracts() {
  const catalog = await createApiCatalog([
    { id: 'inventory', spec },
    { id: 'other-service', spec },
  ]);
  const operations = listApiOperations(catalog);
  return {
    catalog,
    operations,
    contracts: await resolveApiOperations(
      catalog,
      operations.slice(0, 2).map((operation) => operation.key),
    ),
  };
}

function modelReturning(output, inspect) {
  return {
    withStructuredOutput(schema, options) {
      inspect?.(schema, options);
      return {
        async invoke(messages) {
          assert.ok(messages[0] instanceof SystemMessage);
          assert.ok(messages[1] instanceof HumanMessage);
          return output;
        },
      };
    },
  };
}

test('catalog accepts only IDs and OAS; operation identities survive JSON round trip', async () => {
  const { catalog, operations } = await contracts();
  assert.equal(catalog.documents.length, 2);
  assert.equal(operations.length, 4);
  assert.equal(operations[0].operationRef, operations[2].operationRef);
  assert.notEqual(operations[0].key.documentId, operations[2].key.documentId);
  await resolveApiOperations(JSON.parse(JSON.stringify(catalog)), [
    operations[0].key,
  ]);
  await assert.rejects(
    resolveApiOperations(catalog, [
      { ...operations[0].key, snapshotId: 'stale' },
    ]),
    /snapshotId/,
  );
  const changed = globalThis.structuredClone(catalog);
  changed.documents[0].spec.info.version = '2';
  await assert.rejects(
    resolveApiOperations(changed, [operations[0].key]),
    /changed after catalog creation/,
  );
});

test('contract lookup preserves full responses, auth alternatives and parameter override without n8n conversion', async () => {
  const secured = globalThis.structuredClone(spec);
  secured.security = [{ bearer: [] }, { apiKey: [] }];
  secured.components = {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
    },
  };
  secured.paths['/items/{id}'].get.parameters = [
    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
  ];
  const catalog = await createApiCatalog([{ id: 'secured', spec: secured }]);
  const resolved = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  assert.deepEqual(resolved[0].effective.security, secured.security);
  assert.deepEqual(Object.keys(resolved[0].operation.responses), [
    '201',
    '400',
  ]);
  assert.equal(resolved[1].effective.parameters.length, 1);
  assert.equal(resolved[1].effective.parameters[0].schema.type, 'integer');
});

test('selection, OAS-typed argument generation, node compilation and assembly can run independently', async () => {
  const {
    operations,
    contracts: [operation],
  } = await contracts();
  const selected = await selectApiOperations({
    operations,
    scenario: 'Create demo with quantity 2',
    model: modelReturning({
      operations: [{ candidateId: 'candidate-1', purpose: 'Create item' }],
      gaps: [],
    }),
  });
  assert.deepEqual(selected.operations[0].key, operation.key);
  const args = await generateApiArguments({
    callId: 'create',
    operation,
    bindings: [],
    scenario: 'Create demo with quantity 2',
    model: modelReturning(
      { values: { body: { name: 'demo', quantity: 2 } }, unresolvedInputs: [] },
      (schema, options) => {
        const json = toJsonSchema(schema);
        assert.equal(
          json.properties.values.properties.body.properties.quantity.type,
          'integer',
        );
        assert.equal(json.properties.expectedBody, undefined);
        assert.equal(options.method, 'functionCalling');
      },
    ),
  });
  const fragment = createHttpRequestNode({
    operation,
    arguments: args,
    baseUrl: 'https://example.test/api',
    credentialBindings: {},
    position: [300, 0],
  });
  const compiled = assembleN8nWorkflow({
    id: 'create-workflow',
    name: 'Create workflow',
    nodes: [fragment],
    starts: ['create'],
    edges: [],
  });
  assert.equal(compiled.status, 'complete');
  assert.equal(compiled.workflow.nodes.length, 2);
  assert.equal(
    compiled.workflow.nodes.find((node) => node.id === 'create').parameters
      .method,
    'POST',
  );
});

test('missing inputs remain visible; type errors and OAS constraints fail at the boundary', async () => {
  const {
    contracts: [operation],
  } = await contracts();
  const args = await generateApiArguments({
    callId: 'partial',
    operation,
    bindings: [],
    scenario: 'Create demo',
    model: modelReturning({
      values: { body: { name: 'demo' } },
      unresolvedInputs: [],
    }),
  });
  assert.deepEqual(args.unresolvedInputs, ['/body/quantity']);
  assert.throws(
    () =>
      createHttpRequestNode({
        operation,
        arguments: args,
        baseUrl: 'https://example.test',
        credentialBindings: {},
        position: [0, 0],
      }),
    /unresolved inputs/,
  );
  const schema = createApiArgumentsSchema({ operation, bindings: [] });
  assert.equal(
    schema.safeParse({
      values: { body: { name: 'demo', quantity: '2' } },
      unresolvedInputs: [],
    }).success,
    false,
  );
  assert.throws(
    () =>
      validateApiArguments({
        operation,
        bindings: [],
        values: { body: { name: 'demo', quantity: 0 } },
      }),
    /schema/,
  );
  const binding = {
    kind: 'node-output',
    targetPointer: '/body/name',
    sourceNodeId: 'previous',
    sourcePointer: '/name',
  };
  const check = validateApiArguments({
    operation,
    bindings: [binding],
    values: {},
  });
  assert.deepEqual(check.missingInputs, ['/body/quantity']);
  assert.equal(check.requiresRuntimeValidation, true);
});

test('assembly follows explicit ports and DAG edges, not array order; invalid graphs fail', async () => {
  const {
    contracts: [, operation],
  } = await contracts();
  const nodes = ['first', 'left', 'right'].map((callId) =>
    createHttpRequestNode({
      operation,
      arguments: {
        callId,
        values: { path: { id: 'item-1' } },
        bindings: [],
        unresolvedInputs: [],
      },
      baseUrl: 'https://example.test',
      credentialBindings: {},
      position: [300, 0],
    }),
  );
  const edges = [
    { from: 'first', output: 'main', to: 'left', input: 'main' },
    { from: 'first', output: 'main', to: 'right', input: 'main' },
  ];
  const input = {
    id: 'dag',
    name: 'DAG',
    nodes: [nodes[2], nodes[0], nodes[1]],
    edges,
    starts: ['first'],
  };
  const result = assembleN8nWorkflow(input);
  assert.equal(result.workflow.connections['Request first'].main[0].length, 2);
  assert.throws(
    () =>
      assembleN8nWorkflow({
        ...input,
        edges: [{ ...edges[0], output: 'missing' }],
      }),
    /undeclared port/,
  );
  assert.throws(
    () =>
      assembleN8nWorkflow({
        ...input,
        edges: [
          { from: 'left', output: 'main', to: 'right', input: 'main' },
          { from: 'right', output: 'main', to: 'left', input: 'main' },
        ],
        starts: ['first'],
      }),
    /cycle/,
  );
});
