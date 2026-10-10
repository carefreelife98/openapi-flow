import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createNativeArrayCapability } from '@openapi-flow/n8n';
import { createNativeArrayItemSchema } from '@openapi-flow/core';
import { createOutputReaderCode } from '../packages/n8n/dist/nodes/request/bindings/create-output-reader-code.js';
import { nativeBindingSchemas } from '../packages/core/dist/bindings/native-binding-schema.js';

const require = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const schema = {
  $defs: {
    row: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  type: 'object',
  properties: { rows: { type: 'array', items: { $ref: '#/$defs/row' } } },
  required: ['rows'],
  additionalProperties: false,
};
const source = {
  nodeId: 'source',
  nodeName: 'Producer',
  kind: 'native-json',
  schema,
};
const validate = (schema) => new Ajv2020({ strict: false }).compile(schema);
function read(sources, values, linked = false, index = 0) {
  return vm.runInNewContext(
    `(function(){const inputIndex=${index};${createOutputReaderCode(sources, linked)}\nreturn responses;})()`,
    {
      $: (name) => {
        const value = values[name];
        return {
          all: () => [{ json: value }],
          itemMatching: () => ({ json: value }),
        };
      },
    },
  );
}
test('independent native roots retain anonymous local refs and same-named definitions', () => {
  const second = {
    ...source,
    nodeId: 'other',
    nodeName: 'Other',
    schema: {
      ...schema,
      $defs: { row: { type: 'number' } },
    },
  };
  const values = {
    Producer: { rows: [{ id: 'unchanged' }] },
    Other: { rows: [42] },
  };
  for (const linked of [false, true]) {
    const result = read([source, second], values, linked);
    assert.equal(result.source, values.Producer);
    assert.equal(result.other, values.Other);
    assert.throws(
      () =>
        read([source, second], { ...values, Other: { rows: ['42'] } }, linked),
      /declared schema: .*source other/,
    );
  }
  const named = [source, second].map((item) => ({
    ...item,
    schema: { ...item.schema, $id: 'https://fixture.test/same' },
  }));
  assert.equal(read(named, values).other, values.Other);
});
test('full original native contracts preserve static recursive refs and untouched siblings', () => {
  const recursive = {
    ...source,
    schema: {
      $defs: {
        tree: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            children: { type: 'array', items: { $ref: '#/$defs/tree' } },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      type: 'object',
      properties: {
        rows: { type: 'array', items: { $ref: '#/$defs/tree' } },
        marker: { const: 'original' },
      },
      required: ['rows', 'marker'],
      additionalProperties: false,
    },
  };
  const value = {
    marker: 'original',
    rows: [{ id: 'a', children: [{ id: 'b' }] }],
  };
  assert.equal(read([recursive], { Producer: value }).source, value);
  assert.throws(
    () => read([recursive], { Producer: { ...value, marker: 'changed' } }),
    /declared schema/,
  );
  const item = validate(createNativeArrayItemSchema(recursive, '/rows'));
  assert.equal(item(value.rows[0]), true);
  assert.equal(item({ id: 'a', children: [{ id: 42 }] }), false);
  assert.equal(
    JSON.stringify(recursive.schema).includes('openapi-flow.invalid'),
    false,
  );
});
test('array aliases and $ref siblings keep their conjunction in the projected contract', () => {
  const output = {
    nodeId: 'alias',
    schema: {
      $defs: { list: { type: 'array', items: { type: 'number', minimum: 1 } } },
      type: 'object',
      properties: { rows: { $ref: '#/$defs/list', items: { maximum: 3 } } },
    },
  };
  const candidate = validate(createNativeArrayItemSchema(output, '/rows'));
  assert.equal(candidate(2), true);
  assert.equal(candidate(0), false);
  assert.equal(candidate(4), false);
});
test('anchors, nested relative resource IDs and escaped URI/JSON-pointer names remain resolvable', () => {
  const output = {
    nodeId: 'scoped',
    schema: {
      $id: 'https://fixture.test/schemas/root',
      $defs: {
        row: {
          $id: 'row',
          $defs: { value: { $anchor: 'value', type: 'integer' } },
          type: 'object',
          properties: { 'a/b~% #': { $ref: '#value' } },
          required: ['a/b~% #'],
          additionalProperties: false,
        },
      },
      type: 'object',
      properties: { rows: { type: 'array', items: { $ref: 'row' } } },
    },
  };
  const item = validate(createNativeArrayItemSchema(output, '/rows'));
  assert.equal(item({ 'a/b~% #': 2 }), true);
  assert.equal(item({ 'a/b~% #': '2' }), false);
  const scalar = validate(nativeBindingSchemas(output, '/rows/0/a~1b~0% #')[0]);
  assert.equal(scalar(2), true);
  assert.equal(scalar('2'), false);
  assert.deepEqual(nativeBindingSchemas(output, '/rows/0/missing'), []);
});
test('projection does not interpret refs or IDs inside const data as schema resources', () => {
  const literal = { $id: 'not-a-schema', $ref: '#/missing', x: 1 };
  const output = {
    nodeId: 'literal',
    schema: { type: 'array', items: { const: literal } },
  };
  const candidate = validate(createNativeArrayItemSchema(output, ''));
  assert.equal(candidate(literal), true);
  assert.equal(candidate({ ...literal, x: 2 }), false);
});
test('shared JavaScript schema objects retain each JSON location and lexical scope without dropped values', () => {
  const shared = { type: 'array', items: { $ref: '#/$defs/value' } };
  const output = {
    nodeId: 'shared',
    schema: {
      $id: 'https://fixture.test/root',
      $defs: {
        first: {
          $id: 'first',
          $defs: { value: { type: 'string' } },
          type: 'object',
          properties: { rows: shared },
        },
        second: {
          $id: 'second',
          $defs: { value: { type: 'number' } },
          type: 'object',
          properties: { rows: shared },
        },
      },
      type: 'object',
      properties: { first: { $ref: 'first' }, second: { $ref: 'second' } },
    },
  };
  const first = validate(createNativeArrayItemSchema(output, '/first/rows'));
  const second = validate(createNativeArrayItemSchema(output, '/second/rows'));
  assert.equal(first('original'), true);
  assert.equal(first(42), false);
  assert.equal(second(42), true);
  assert.equal(second('42'), false);
  assert.throws(
    () =>
      createNativeArrayItemSchema(
        { nodeId: 'bad', schema: { type: 'array', extra: undefined } },
        '',
      ),
    /must contain JSON values/,
  );
  const cyclic = { type: 'array' };
  cyclic.items = cyclic;
  assert.throws(
    () => createNativeArrayItemSchema({ nodeId: 'bad', schema: cyclic }, ''),
    /object cycle/,
  );
});
test('missing refs and non-progressing projection cycles fail without broadening contracts', () => {
  assert.throws(
    () =>
      createNativeArrayItemSchema(
        { nodeId: 'bad-id', schema: { $id: 42, type: 'array' } },
        '',
      ),
    /schema\.\$id/,
  );
  assert.throws(
    () =>
      createNativeArrayItemSchema(
        {
          nodeId: 'bad',
          schema: { type: 'array', items: { $ref: '#/$defs/missing' } },
        },
        '',
      ),
    /resolve reference/,
  );
  assert.throws(
    () =>
      createNativeArrayItemSchema(
        { nodeId: 'cycle', schema: { $ref: '#' } },
        '',
      ),
    /cycle|stack/i,
  );
});
test('projected contracts survive JSON round trips and source reader compilation', () => {
  const original = JSON.stringify(schema);
  const capability = createNativeArrayCapability({ sources: [source] });
  const output = JSON.parse(
    JSON.stringify(
      capability.outputSchema({ sourceNodeId: 'source', pointer: '/rows' }),
    ),
  );
  const check = validate(output);
  assert.equal(check({ item: { id: 'original' } }), true);
  assert.equal(check({ item: { id: false } }), false);
  const projected = { ...source, schema: output };
  assert.equal(
    read([projected], { Producer: { item: { id: 'original' } } }).source.item
      .id,
    'original',
  );
  assert.equal(JSON.stringify(schema), original);
});
