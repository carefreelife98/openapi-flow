import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createNativeOutputContracts,
  createResponseArrayItemValueSchema,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
} from '@openapi-flow/core';
import { generateNativeNodeParameters } from '@openapi-flow/langchain';
import {
  createApiResponseKeyJoinCapability,
  resolveN8nNativePlanningFeatures,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import {
  keyJoinMaterials,
  keyJoinParameters,
  keyJoinLeftRows,
  keyJoinRightRows,
  compileKeyJoinWorkflow,
} from './fixtures/api-response-key-join-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const materials = await keyJoinMaterials();
const capability = createApiResponseKeyJoinCapability({ materials });
const planned = {
  id: 'key-join',
  capability: capability.name,
  parameters: keyJoinParameters,
};
const apiNodeNames = { 'left-api': 'Actual left', 'right-api': 'Actual right' };
const plain = (value) => JSON.parse(JSON.stringify(value));
function read(side, bodies, parameters = keyJoinParameters) {
  const fragment = capability.compile({
    planned: { ...planned, parameters },
    position: [0, 0],
    apiNodeNames,
  });
  const reader = fragment.nodes.find(
    (node) => node.id === `key-join-read-${side}`,
  );
  return plain(
    vm.runInNewContext(`(function(){${reader.config.parameters.jsCode}})()`, {
      $input: { all: () => bodies.map(() => ({ json: {} })) },
      $: (name) => {
        assert.equal(name, apiNodeNames[parameters[side].sourceNodeId]);
        return {
          itemMatching: (index) => ({
            json: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: bodies[index],
            },
          }),
          all: () => {
            throw new Error('Must use exact linked response');
          },
        };
      },
    }),
  );
}

test('business-key join uses official SDK Merge strict matching with explicit ports and no positional or ancestry-join claim', async () => {
  const before = globalThis.structuredClone(materials);
  const fragment = capability.compile({
    planned,
    position: [0, 0],
    apiNodeNames,
  });
  assert.equal(fragment.exit.type, 'n8n-nodes-base.merge');
  assert.equal(fragment.exit.version, '3.2');
  assert.deepEqual(fragment.exit.config.parameters.options, {
    fuzzyCompare: false,
    multipleMatches: 'all',
    disableDotNotation: true,
    clashHandling: {
      values: {
        resolveClash: 'preferInput1',
        mergeMode: 'shallowMerge',
        overrideEmpty: false,
      },
    },
  });
  assert.deepEqual(fragment.inputEndpoints, {
    left: { nodeId: 'key-join-read-left', input: 0 },
    right: { nodeId: 'key-join-read-right', input: 0 },
  });
  assert.equal(fragment.preservesInputItems, undefined);
  assert.equal(fragment.joinsInputItemsByAncestry, undefined);
  assert.deepEqual(materials, before);
  const { workflow } = await compileKeyJoinWorkflow('http://127.0.0.1:12345');
  const merge = workflow.nodes.find((node) => node.id === 'matched-results');
  assert.equal(merge.type, 'n8n-nodes-base.merge');
  assert.equal(merge.typeVersion, 3.2);
  assert.ok(workflow.connections['Read left matched-results']);
  assert.ok(workflow.connections['Read right matched-results']);
});

test('array reader preserves all rows and exact source-item lineage across multiple API response items', () => {
  const bodies = [
    { rows: keyJoinLeftRows.slice(0, 2), checksum: 1 },
    { rows: keyJoinLeftRows.slice(2), checksum: 2 },
  ];
  const rows = read('left', bodies);
  assert.deepEqual(
    rows.map((row) => row.json.left),
    keyJoinLeftRows,
  );
  assert.deepEqual(
    rows.map((row) => row.json.key),
    keyJoinLeftRows.map((row) => row.id),
  );
  assert.deepEqual(
    rows.map((row) => row.pairedItem.item),
    [0, 0, 1, 1, 1, 1],
  );
  assert.deepEqual(read('left', [{ rows: [], checksum: 0 }]), []);
  assert.deepEqual(
    read('right', [{ entries: keyJoinRightRows, checksum: 1 }]).map(
      (row) => row.json.right,
    ),
    keyJoinRightRows,
  );
});

test('reader validates the complete original OAS response and selected array without coercing unselected fields', () => {
  assert.throws(
    () => read('left', [{ rows: keyJoinLeftRows, checksum: '1' }]),
    /does not match its OAS contract/,
  );
  assert.throws(
    () => read('left', [{ rows: {}, checksum: 1 }]),
    /OAS contract/,
  );
  const rows = globalThis.structuredClone(keyJoinLeftRows);
  rows[4].marker = 4;
  assert.throws(() => read('left', [{ rows, checksum: 1 }]), /OAS contract/);
});

test('absent keys follow the explicit policy, never match inherited properties, while null/false/zero/empty remain actual keys', () => {
  const missing = { marker: 'missing', data: {} };
  assert.throws(
    () => read('left', [{ rows: [missing], checksum: 0 }]),
    /missing key at left-api\/rows\/0\/id/,
  );
  assert.deepEqual(
    read('left', [{ rows: [missing], checksum: 0 }], {
      ...keyJoinParameters,
      missingKeys: 'unmatched',
    }),
    [{ json: { left: missing }, pairedItem: { item: 0 } }],
  );
  for (const key of [null, false, 0, '', '0', [], { a: 0 }])
    assert.deepEqual(
      read('left', [
        { rows: [{ id: key, marker: 'key', data: {} }], checksum: 0 },
      ])[0].json.key,
      key,
    );
  assert.throws(
    () =>
      read('left', [{ rows: [missing], checksum: 0 }], {
        ...keyJoinParameters,
        left: { ...keyJoinParameters.left, keyPointer: '/toString' },
      }),
    /no declared item value/,
  );
});

test('output contract preserves unchanged rows and mechanically reflects retention/missing-key policy, not business status', () => {
  const schema = (parameters) =>
    createNativeOutputContracts({
      nativeNodes: [{ ...planned, parameters }],
      capabilities: [capability],
    })[0].schema;
  const validate = (parameters) =>
    new Ajv2020({ strict: false }).compile(schema(parameters));
  const pair = { key: 0, left: keyJoinLeftRows[0], right: keyJoinRightRows[4] };
  assert.equal(validate(keyJoinParameters)(pair), true);
  assert.equal(validate(keyJoinParameters)({ key: 0 }), false);
  assert.equal(
    validate({ ...keyJoinParameters, joinMode: 'inner' })({
      key: 0,
      left: keyJoinLeftRows[0],
    }),
    false,
  );
  assert.equal(
    validate({ ...keyJoinParameters, joinMode: 'left' })({
      key: 0,
      left: keyJoinLeftRows[0],
    }),
    true,
  );
  assert.equal(
    validate({ ...keyJoinParameters, joinMode: 'right' })({
      key: 0,
      left: keyJoinLeftRows[0],
    }),
    false,
  );
  assert.equal(
    validate({ ...keyJoinParameters, missingKeys: 'unmatched' })({
      left: { marker: 'missing', data: null },
    }),
    true,
  );
  assert.equal(
    validate(keyJoinParameters)({ left: { marker: 'missing', data: null } }),
    false,
  );
  assert.equal(
    validate(keyJoinParameters)({ ...pair, left: { ...pair.left, marker: 0 } }),
    false,
  );
});

test('Core projects a relative item key through exact OAS schemas, not an invented first element', async () => {
  const schema = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            'key/~': { type: 'integer' },
            nested: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
  const [material] = await keyJoinMaterials(schema);
  const key = createResponseArrayItemValueSchema(
    material.operation,
    '/rows',
    '/key~1~0',
  );
  const validate = new Ajv2020({ strict: false }).compile(key);
  assert.equal(validate(0), true);
  assert.equal(validate('0'), false);
  assert.throws(
    () =>
      createResponseArrayItemValueSchema(
        material.operation,
        '/rows',
        '/unknown',
      ),
    /no declared item value/,
  );
  assert.throws(
    () => createResponseArrayItemValueSchema(material.operation, '', '/rows'),
    /no declared response array/,
  );
});

test('planning uses bound API/array candidates and rejects invalid sources, pointers, missing policies and changed contracts', () => {
  for (const patch of [
    { left: { ...keyJoinParameters.left, sourceNodeId: 'invented' } },
    { left: { ...keyJoinParameters.left, pointer: '/checksum' } },
    { left: { ...keyJoinParameters.left, keyPointer: '/bad~2' } },
    { joinMode: undefined },
    { missingKeys: undefined },
    { joinMode: 'first' },
  ])
    assert.equal(
      capability.parametersSchema.safeParse({ ...keyJoinParameters, ...patch })
        .success,
      false,
    );
  const definition = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.JoinApiResponseArraysByKey],
  }).planningCapabilities[0];
  assert.throws(
    () => definition.outputSchema(keyJoinParameters),
    /requires actual material contract binding/,
  );
  assert.equal(
    capability.bindMaterialContracts({
      apiMaterials: materials,
      nativeOutputs: [],
    }).name,
    capability.name,
  );
  assert.throws(
    () => capability.compile({ planned, position: [0, 0], apiNodeNames: {} }),
    /apiNodeNames is missing/,
  );
  const mutated = { ...capability, description: 'changed' };
  assert.throws(
    () =>
      mutated.bindMaterialContracts({
        apiMaterials: materials,
        nativeOutputs: [],
      }),
    /changed description/,
  );
});

test('staged parameter generation selects two actual API contracts and code owns the Merge implementation and output contract', async () => {
  const input = {
    planId: 'key-comparison',
    scenario:
      'Join both unchanged arrays by their id/code business keys, retain unmatched rows and reject missing keys.',
    apiMaterials: materials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.JoinApiResponseArraysByKey],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: capability.name,
          purpose: 'Business key comparison',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: {
      sourcesByNodeId: {
        [nodeId]: { sourceNodeIds: ['left-api', 'right-api'] },
      },
    },
  });
  let calls = 0;
  const model = {
    withStructuredOutput(schema) {
      return {
        async invoke(messages) {
          calls++;
          assert.equal(
            new Ajv2020({ strict: false }).validateSchema(schema),
            true,
          );
          const context = JSON.parse(messages[1].content);
          assert.deepEqual(
            context.apiMaterials.map((item) => item.callId).sort(),
            ['left-api', 'right-api'],
          );
          assert.ok(JSON.stringify(schema).includes('keyPointer'));
          return {
            decision: { status: 'provided', parameters: keyJoinParameters },
          };
        },
      };
    },
  };
  const result = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node.parameters, keyJoinParameters);
  assert.equal(calls, 1);
  const [contract] = createNativeOutputContracts({
    nativeNodes: [result.node],
    capabilities: [capability],
  });
  assert.equal(contract.schema.properties.left.anyOf.length > 0, true);
});
