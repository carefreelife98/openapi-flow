import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createNativeArrayItemSchema } from '@openapi-flow/core';
import {
  createNativeArrayCapability,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  context,
  contextSchema,
  compileNativeIteration,
  createNativeIterationInput,
} from './fixtures/native-array-iteration-fixture.mjs';
import { z } from 'zod';
import { planNativeNodes } from '@openapi-flow/langchain';

const output = {
  nodeId: 'source',
  nodeName: 'Actual producer',
  schema: z.toJSONSchema(contextSchema),
};
function fragment(linked = false, pointer = '/groups', source = output) {
  const capability = createNativeArrayCapability({
    sources: [source],
    ...(linked ? { itemMode: 'linked' } : {}),
  });
  return capability.compile({
    planned: {
      id: 'split',
      capability: capability.name,
      parameters: { sourceNodeId: 'source', pointer },
    },
    apiNodeNames: {},
    position: [0, 0],
  });
}
function run(compiled, values, items = values.map(() => ({ json: {} }))) {
  return vm.runInNewContext(
    `(function(){${compiled.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => items },
      $: (name) => {
        assert.equal(name, 'Actual producer');
        return {
          all: () => values.map((json) => ({ json })),
          itemMatching: (index) => ({ json: values[index] }),
        };
      },
    },
  );
}
test('native array plans use only supplied source IDs and JSON-root pointers', () => {
  const capability = createNativeArrayCapability({ sources: [output] });
  const parameters = { sourceNodeId: 'source', pointer: '/groups' };
  assert.deepEqual(capability.responseReferences(parameters), []);
  assert.deepEqual(capability.nodeOutputReferences(parameters), [
    { source: 'node-output', nodeId: 'source', pointer: '/groups' },
  ]);
  assert.throws(() =>
    capability.outputSchema({ ...parameters, sourceNodeId: 'invented' }),
  );
  assert.throws(() => fragment(false, '/marker'), /no declared array/);
  assert.throws(() => fragment(false, '/groups/~2bad'), /pointer/i);
  assert.equal(fragment().exit.type, 'n8n-nodes-base.splitOut');
});

test('public native planning selects source and pointer while code derives output contracts', async () => {
  const input = createNativeIterationInput();
  const planned = input.plan.nativeNodes.find(
    (node) => node.id === 'each-parent',
  );
  const result = await planNativeNodes({
    planId: 'native-iteration',
    scenario:
      'Iterate the explicitly supplied context groups without changing their values.',
    capabilities: input.capabilities,
    preparedNativeNodes: [
      input.plan.nativeNodes.find((node) => node.id === 'context'),
    ],
    model: {
      withStructuredOutput(schema) {
        assert.ok(JSON.stringify(schema).includes('sourceNodeId'));
        assert.ok(JSON.stringify(schema).includes('RFC 6901'));
        return { invoke: async () => ({ nativeNodes: [planned], gaps: [] }) };
      },
    },
  });
  assert.deepEqual(result.nativeNodes, [planned]);
  assert.deepEqual(Object.keys(result.nativeNodes[0].parameters).sort(), [
    'pointer',
    'sourceNodeId',
  ]);
  assert.ok(
    input.capabilities
      .find((capability) => capability.name === planned.capability)
      .outputSchema(planned.parameters).properties.item,
  );
});
test('native array sources require explicit unique contracts, names and modes', () => {
  assert.throws(
    () => createNativeArrayCapability({ sources: [] }),
    /requires sources/,
  );
  assert.throws(
    () => createNativeArrayCapability({ sources: [output, output] }),
    /unique node IDs/,
  );
  assert.throws(
    () =>
      createNativeArrayCapability({ sources: [{ ...output, nodeName: '' }] }),
    /compiled names/,
  );
  assert.throws(
    () =>
      createNativeArrayCapability({
        sources: [{ ...output, schema: undefined }],
      }),
    /JSON Schema/,
  );
  assert.throws(
    () => createNativeArrayCapability({ sources: [output], itemMode: 'guess' }),
    /itemMode/,
  );
});
test('ordinary native extraction preserves exact values and rejects ambiguous streams', () => {
  const compiled = fragment();
  const result = run(compiled, [context]);
  assert.equal(result[0].json.items, context.groups);
  assert.equal(result[0].pairedItem.item, 0);
  assert.throws(() => run(compiled, [context, context]), /one input item/);
  assert.throws(
    () => run(compiled, [context, context], [{ json: {} }]),
    /unambiguous single JSON item/,
  );
});
test('linked native extraction preserves each parent including empty arrays and zero-input streams', () => {
  const compiled = fragment(true);
  const empty = { marker: 'original', groups: [] };
  const result = run(compiled, [context, empty, context]);
  assert.equal(result.length, 3);
  for (const [i, item] of result.entries())
    assert.equal(item.pairedItem.item, i);
  assert.equal(result[0].json.items, context.groups);
  assert.equal(result[1].json.items, empty.groups);
  assert.equal(run(compiled, []).length, 0);
});
test('native extraction validates the entire producer before pointer access without repairing values', () => {
  for (const linked of [false, true]) {
    const compiled = fragment(linked);
    assert.throws(
      () => run(compiled, [{ ...context, marker: 'changed' }]),
      /Native output does not match declared schema/,
    );
    assert.throws(
      () =>
        run(compiled, [
          {
            marker: 'original',
            groups: [
              {
                id: 'x',
                marker: 'm',
                children: [{ id: 'x', amount: '8', payload: null }],
              },
            ],
          },
        ]),
      /declared schema/,
    );
    const missing = fragment(linked, '/optional', {
      nodeId: 'source',
      nodeName: 'Actual producer',
      schema: {
        type: 'object',
        properties: { optional: { type: 'array', items: true } },
        additionalProperties: false,
      },
    });
    assert.throws(
      () => run(missing, [{}]),
      /Missing array pointer source\/optional/,
    );
  }
});
test('native item projection shares API composition and tuple semantics without replacing full validation', () => {
  const require = createRequire(
    new URL('../packages/n8n/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const schema = {
    type: 'object',
    properties: {
      items: {
        allOf: [
          { type: 'array', items: { type: 'number', minimum: 1 } },
          { items: { maximum: 3 } },
        ],
      },
    },
    required: ['items'],
  };
  const candidate = new Ajv2020({ strict: false }).compile(
    createNativeArrayItemSchema({ nodeId: 'source', schema }, '/items'),
  );
  assert.equal(candidate(2), true);
  assert.equal(candidate(0), false);
  assert.equal(candidate(4), false);
  const tuple = new Ajv2020({ strict: false }).compile(
    createNativeArrayItemSchema(
      {
        nodeId: 'source',
        schema: {
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
          items: false,
        },
      },
      '',
    ),
  );
  assert.equal(tuple('x'), true);
  assert.equal(tuple(2), true);
  assert.equal(tuple(null), false);
});
test('public assembly checks native source identity, original schema and graph provenance', () => {
  const normal = compileNativeIteration().workflow;
  assert.equal(
    normal.nodes.filter((node) => node.type === 'n8n-nodes-base.splitOut')
      .length,
    2,
  );
  for (const field of ['nodeName', 'schema']) {
    const input = createNativeIterationInput();
    const native = input.capabilities.find(
      (capability) => capability.name === 'split-native-output-array',
    );
    const original = native.compile;
    native.compile = (args) => {
      const result = original(args);
      result.bindingSources[0][field] =
        field === 'nodeName' ? 'Wrong producer' : false;
      return result;
    };
    assert.throws(
      () => compilePlannedN8nWorkflow(input),
      /compiled producer|declared native output schema/,
    );
  }
  const input = createNativeIterationInput();
  input.plan.edges = input.plan.edges.filter(
    (edge) => edge.to !== 'each-child',
  );
  input.plan.starts.push('each-child');
  assert.throws(
    () => compilePlannedN8nWorkflow(input),
    /available|dependency|preced|upstream/i,
  );
});
