import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createNativeOutputContracts,
  createNativeValueSchema,
} from '@openapi-flow/core';
import { createNativeValueCollectionCapability } from '@openapi-flow/n8n';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

const source = {
  nodeId: 'rows',
  nodeName: 'Original rows',
  schema: {
    $id: 'https://example.com/native-rows',
    type: 'object',
    properties: {
      id: { type: 'string' },
      values: {
        type: 'array',
        items: { type: ['string', 'number', 'boolean', 'null'] },
      },
      optional: { type: 'string' },
    },
    required: ['id', 'values'],
    additionalProperties: false,
  },
};
const rows = [
  { id: '0007', values: [0, false, null, '={{ literal }}'] },
  { id: '0007', values: [] },
];
function compile(pointer = '') {
  const capability = createNativeValueCollectionCapability({
    sources: [source],
  });
  const parameters = { sourceNodeId: source.nodeId, pointer };
  return {
    capability,
    parameters,
    fragment: capability.compile({
      planned: { id: 'collected', capability: capability.name, parameters },
      position: [0, 0],
      apiNodeNames: {},
      nativeOutputSources: [source],
    }),
  };
}
function read(values, fragment, matching = (index) => values[index]) {
  return vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => values.map((json) => ({ json })) },
      $: (name) => {
        assert.equal(name, source.nodeName);
        return { itemMatching: (index) => ({ json: matching(index) }) };
      },
    },
  );
}

test('native collection compiles official Aggregate without implementing an aggregation algorithm', () => {
  const before = globalThis.structuredClone(rows);
  const { fragment } = compile('/values');
  const input = Array.from(read(rows, fragment), (item) =>
    JSON.parse(JSON.stringify(item)),
  );
  assert.deepEqual(
    input,
    rows.map((row, index) => ({
      json: { value: row.values },
      pairedItem: { item: index },
    })),
  );
  assert.equal(fragment.exit.type, 'n8n-nodes-base.aggregate');
  assert.equal(fragment.exit.version, '1');
  assert.deepEqual(fragment.exit.config.parameters.options, {
    disableDotNotation: true,
    mergeLists: false,
    keepMissing: true,
    includeBinaries: false,
  });
  assert.equal(
    fragment.exit.config.parameters.fieldsToAggregate.fieldToAggregate[0]
      .outputFieldName,
    'items',
  );
  assert.deepEqual(Array.from(read([], fragment)), []);
  assert.deepEqual(rows, before);
  assert.equal(
    fragment.preservesInputItems,
    undefined,
    'A reduction must not claim one output per input',
  );
  assert.deepEqual(fragment.bindingSources, [
    { ...source, kind: 'native-json' },
  ]);
});

test('collection follows actual native item ancestry, never a position zip or cached first item', () => {
  const { fragment } = compile();
  const result = Array.from(
    read(rows, fragment, (index) => rows[1 - index]),
    (item) => JSON.parse(JSON.stringify(item)),
  );
  assert.deepEqual(
    result.map((item) => item.json.value),
    [rows[1], rows[0]],
  );
  assert.deepEqual(
    result.map((item) => item.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
});

test('output contracts preserve source schemas, refs, arrays and exact derived pointer type', () => {
  const before = globalThis.structuredClone(source);
  const { capability, parameters } = compile('/values');
  const [contract] = createNativeOutputContracts({
    nativeNodes: [{ id: 'collected', capability: capability.name, parameters }],
    capabilities: [capability],
  });
  assert.deepEqual(contract.schema, {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: createNativeValueSchema(source, '/values'),
      },
    },
    required: ['items'],
    additionalProperties: false,
  });
  const validate = new Ajv2020({ strict: false }).compile(
    createNativeValueSchema(contract, '/items'),
  );
  assert.equal(
    validate(rows.map((row) => row.values)),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(
    validate([0, false, null]),
    false,
    'Nested original arrays must not be flattened by the output contract',
  );
  assert.deepEqual(source, before);
});

test('full native contracts and selected pointer presence are checked before Aggregate', () => {
  const { fragment } = compile('/values');
  assert.throws(
    () => read([{ ...rows[0], id: 7 }], fragment),
    /native output|schema|contract/i,
  );
  const optional = compile('/optional').fragment;
  assert.throws(
    () => read(rows, optional),
    /Missing native output pointer rows\/optional/,
  );
  assert.throws(
    () => read(rows, fragment, () => undefined),
    /Missing|native|JSON/i,
  );
});

test('model-facing collector binds each pointer to its actual producer and rejects invented sources', () => {
  const other = {
    nodeId: 'other',
    nodeName: 'Other',
    schema: {
      type: 'object',
      properties: { elsewhere: { type: 'number' } },
      required: ['elsewhere'],
      additionalProperties: false,
    },
  };
  const capability = createNativeValueCollectionCapability({
    sources: [source, other],
  });
  for (const value of [
    { sourceNodeId: 'rows', pointer: '/values' },
    { sourceNodeId: 'other', pointer: '/elsewhere' },
  ])
    assert.equal(capability.parametersSchema.safeParse(value).success, true);
  for (const value of [
    { sourceNodeId: 'rows', pointer: '/elsewhere' },
    { sourceNodeId: 'other', pointer: '/values' },
    { sourceNodeId: 'invented', pointer: '' },
  ])
    assert.equal(capability.parametersSchema.safeParse(value).success, false);
  assert.throws(
    () => createNativeValueCollectionCapability({ sources: [] }),
    /actual source/,
  );
  assert.throws(
    () => createNativeValueCollectionCapability({ sources: [source, source] }),
    /duplicate|unique/i,
  );
  assert.throws(
    () =>
      capability.compile({
        planned: {
          id: 'collected',
          capability: capability.name,
          parameters: { sourceNodeId: 'rows', pointer: '' },
        },
        position: [0, 0],
        apiNodeNames: {},
        nativeOutputSources: [],
      }),
    /source|producer|compiled/i,
  );
});
