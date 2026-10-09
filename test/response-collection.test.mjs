import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createApiCatalog,
  resolveApiOperations,
  createNativeOutputContracts,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  createResponseCollectionCapability,
  compilePlannedN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import {
  compileCollectedIteration,
  graphMaterials,
} from './fixtures/array-iteration-fixture.mjs';

const catalog = await createApiCatalog([
  {
    id: 'collection',
    spec: {
      openapi: '3.1.0',
      info: { title: 'Collection contracts', version: '1' },
      paths: {
        '/values': {
          get: {
            responses: {
              200: {
                description: 'JSON values',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        value: {
                          type: [
                            'string',
                            'number',
                            'boolean',
                            'null',
                            'object',
                            'array',
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
]);
const [operation] = await resolveApiOperations(catalog, [
  catalog.operations[0].key,
]);
const capability = createResponseCollectionCapability({
  materials: [{ callId: 'source', operation }],
});
const planned = {
  id: 'collect',
  capability: capability.name,
  parameters: { sourceNodeId: 'source', pointer: '/value' },
};
const compile = () =>
  capability.compile({
    planned,
    position: [0, 0],
    apiNodeNames: { source: 'Actual source name' },
  });
const execute = (bodies) =>
  vm.runInNewContext(
    `(function(){${compile().entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => bodies.map(() => ({ json: {} })) },
      $: (name) => {
        assert.equal(name, 'Actual source name');
        return {
          itemMatching: (index) => ({
            json: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: bodies[index],
            },
          }),
        };
      },
    },
  );
test('response collection compiles official Aggregate without flattening or removing nulls', () => {
  const fragment = compile();
  assert.equal(fragment.exit.type, 'n8n-nodes-base.aggregate');
  assert.equal(fragment.exit.config.parameters.options.mergeLists, false);
  assert.equal(fragment.exit.config.parameters.options.keepMissing, true);
  assert.deepEqual(
    fragment.exit.config.parameters.fieldsToAggregate.fieldToAggregate,
    [
      {
        fieldToAggregate: 'value',
        renameField: true,
        outputFieldName: 'items',
      },
    ],
  );
  const output = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability],
  });
  assert.equal(output[0].schema.properties.items.type, 'array');
  assert.equal(output[0].schema.properties.items.items.anyOf[0].type.length, 6);
});
test('collection reads each linked value unchanged, including duplicate values and nested arrays', () => {
  const values = [
    '42',
    null,
    [0, null, [false]],
    { 'a.b': true },
    0,
    false,
    '42',
  ];
  const output = execute(values.map((value) => ({ value })));
  assert.deepEqual(
    Array.from(output, (item) => JSON.parse(JSON.stringify(item.json.value))),
    values,
  );
  assert.deepEqual(
    Array.from(output, (item) => item.pairedItem.item),
    values.map((_, index) => index),
  );
  assert.equal(execute([]).length, 0);
});
test('missing pointers are errors, not Aggregate-generated null entries', () => {
  assert.throws(() => execute([{}]), /Missing response pointer/);
  assert.throws(
    () =>
      capability.outputSchema({ sourceNodeId: 'unknown', pointer: '/value' }),
    (error) => error.issues.some((issue) => issue.path[0] === 'sourceNodeId'),
  );
});
test('response collection follows source dependencies and cannot be a disconnected root', () => {
  const registry = createResponseCollectionCapability({
    materials: [{ callId: 'records', operation: graphMaterials[0].operation }],
  });
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        materials: [graphMaterials[0]],
        capabilities: [registry],
        plan: {
          nativeNodes: [
            {
              id: 'collect',
              capability: registry.name,
              parameters: { sourceNodeId: 'records', pointer: '/records' },
            },
          ],
          edges: [],
          starts: ['records', 'collect'],
          gaps: [],
        },
      }),
    /not available on every incoming route/,
  );
});
test('collected API bodies feed a single OAS array request after item-wise assertions', () => {
  for (const conditional of [false, true]) {
    const result = compileCollectedIteration(
      'https://fixture.test',
      conditional,
    );
    assert.equal(
      result.workflow.nodes.find((node) => node.id === 'collected-results')
        .type,
      'n8n-nodes-base.aggregate',
    );
    assert.equal(
      result.workflow.nodes.find((node) => node.id === 'submit').type,
      'n8n-nodes-base.httpRequest',
    );
    assert.ok(
      result.workflow.connections['collected-results'].main[0].some(
        (edge) => edge.node === 'Materialize submit',
      ),
    );
  }
});
test('native collectors cannot compile a different source contract than the workflow material', () => {
  const registry = createResponseCollectionCapability({
    materials: [{ callId: 'records', operation: graphMaterials[2].operation }],
  });
  assert.throws(
    () =>
      compilePlannedN8nWorkflow({
        id: 'wrong-source',
        name: 'Wrong source',
        materials: [graphMaterials[0]],
        capabilities: [registry],
        plan: {
          nativeNodes: [
            {
              id: 'collect',
              capability: registry.name,
              parameters: { sourceNodeId: 'records', pointer: '' },
            },
          ],
          edges: [
            { from: 'records', output: 'main', to: 'collect', input: 'main' },
          ],
          starts: ['records'],
          gaps: [],
        },
        apiNodes: [
          createHttpRequestNode({ ...graphMaterials[0], position: [0, 0] }),
        ],
      }),
    /original OAS response contract/,
  );
});
