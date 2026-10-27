import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import {
  createNativeValueSchema,
  createNativeObjectProjectionSchema,
  createNativeOutputPointerSelectionSchema,
  createNativeOutputContracts,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
} from '@openapi-flow/core';
import {
  generateNativeNodeParameters,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  createNativeOutputProjectionCapability,
  createJsonOutputCapability,
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const sourceSchema = z.strictObject({
  item: z.strictObject({
    name: z.string(),
    price: z.number(),
    active: z.boolean(),
    missing: z.null(),
    candidates: z.array(z.string()),
    'a/b~c': z.string(),
  }),
});
const source = {
  nodeId: 'joined',
  nodeName: 'Joined original item',
  schema: z.toJSONSchema(sourceSchema),
};
const parameters = {
  sourceNodeId: source.nodeId,
  fields: [
    { name: 'name', pointer: '/item/name' },
    { name: 'price', pointer: '/item/price' },
    { name: 'active', pointer: '/item/active' },
    { name: 'missing', pointer: '/item/missing' },
    { name: 'candidates', pointer: '/item/candidates' },
    { name: 'a.b', pointer: '/item/a~1b~0c' },
  ],
};
const item = {
  item: {
    name: '0007',
    price: 0,
    active: false,
    missing: null,
    candidates: ['={{ literal text }}'],
    'a/b~c': '',
  },
};
const capability = createNativeOutputProjectionCapability({
  sources: [source],
});
const planned = { id: 'summary', capability: capability.name, parameters };

function fragment() {
  return capability.compile({
    planned,
    apiNodeNames: {},
    nativeOutputSources: [source],
    position: [0, 0],
  });
}
function readRows(rows) {
  const code = fragment().nodes[0].config.parameters.jsCode;
  const result = vm.runInNewContext(`(function(){${code}})()`, {
    $input: { all: () => rows.map((json) => ({ json })) },
    $: (name) => {
      assert.equal(name, source.nodeName);
      return { itemMatching: (index) => ({ json: rows[index] }) };
    },
  });
  return JSON.parse(JSON.stringify(result));
}
function projectRows(rows) {
  const expression = fragment().exit.config.parameters.jsonOutput;
  return readRows(rows).map((row) => ({
    ...row,
    json: JSON.parse(
      vm.runInNewContext(expression.slice(3, -2), { $json: row.json }),
    ),
  }));
}

test('native pointer and value projections preserve exact declared types and reject unknown closed fields', () => {
  const pointers = createNativeOutputPointerSelectionSchema(source);
  assert.equal(pointers.safeParse('/item/name').success, true);
  assert.equal(pointers.safeParse('/item/unknown').success, false);
  assert.equal(pointers.safeParse('/item/a~1b~0c').success, true);
  assert.throws(
    () => createNativeValueSchema(source, '/item/unknown'),
    /no declared value/,
  );
  const scalar = { nodeId: 'scalar', schema: { type: 'number' } };
  assert.equal(
    new Ajv2020({ strict: false }).compile(createNativeValueSchema(scalar, ''))(
      0,
    ),
    true,
  );
  assert.throws(
    () => createNativeValueSchema(scalar, '/name'),
    /no declared value/,
  );
});

test('native summary fields use their source schema and cannot borrow another producer path', () => {
  const other = {
    nodeId: 'other',
    schema: {
      type: 'object',
      properties: { other: { type: 'string' } },
      additionalProperties: false,
    },
  };
  const bound = createNativeOutputProjectionCapability({
    sources: [source, other],
  });
  const schema = bound.parametersSchema;
  assert.equal(schema.safeParse(parameters).success, true);
  assert.equal(
    schema.safeParse({
      sourceNodeId: 'other',
      fields: [{ name: 'name', pointer: '/item/name' }],
    }).success,
    false,
  );
  assert.equal(
    schema.safeParse({
      sourceNodeId: 'invented',
      fields: [{ name: 'name', pointer: '' }],
    }).success,
    false,
  );
  const wire = z.toJSONSchema(schema);
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema(wire), true);
  assert.equal(ajv.compile(wire)(parameters), true);
  assert.equal(
    ajv.compile(wire)({
      sourceNodeId: 'other',
      fields: [{ name: 'name', pointer: '/item/name' }],
    }),
    false,
  );
  assert.equal(
    schema.safeParse({
      ...parameters,
      fields: [parameters.fields[0], parameters.fields[0]],
    }).success,
    false,
  );
});

test('object projections share original schema identities and preserve local references and reference siblings', () => {
  const schema = {
    $id: 'https://example.invalid/native/source',
    type: 'object',
    $defs: { code: { type: 'string', minLength: 2 } },
    properties: {
      first: { $ref: '#/$defs/code' },
      second: { $ref: '#/$defs/code', maxLength: 3 },
      nested: {
        $id: 'inner',
        $defs: { value: { type: 'number', minimum: 0 } },
        type: 'object',
        properties: { amount: { $ref: '#/$defs/value' } },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
  const original = globalThis.structuredClone(schema);
  const output = createNativeObjectProjectionSchema(
    { nodeId: 'source', schema },
    {
      code: '/first',
      shortCode: '/second',
      amount: '/nested/amount',
      copy: '/first',
    },
  );
  const validate = new Ajv2020({ strict: false }).compile(output);
  assert.equal(
    validate({ code: 'abc', shortCode: 'ab', amount: 0, copy: 'ab' }),
    true,
  );
  assert.equal(
    validate({ code: 'a', shortCode: 'ab', amount: 0, copy: 'ab' }),
    false,
  );
  assert.equal(
    validate({ code: 'ab', shortCode: 'abcd', amount: 0, copy: 'ab' }),
    false,
  );
  assert.equal(
    validate({ code: 'ab', shortCode: 'ab', amount: '0', copy: 'ab' }),
    false,
  );
  assert.equal(
    validate({ code: 'ab', shortCode: 'ab', amount: -1, copy: 'ab' }),
    false,
  );
  assert.deepEqual(schema, original);
  assert.throws(
    () => createNativeObjectProjectionSchema(source, undefined),
    /projection.fieldPointers must be an object/,
  );
  assert.throws(
    () => createNativeObjectProjectionSchema(source, { name: 17 }),
    /projection.fieldPointers\["name"\] must be a JSON Pointer string/,
  );
});

test('projection output contracts and SDK nodes retain unchanged selected values, labels and types', () => {
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability],
  });
  const valid = new Ajv2020({ strict: false }).compile(output.schema);
  const value = {
    name: '0007',
    price: 0,
    active: false,
    missing: null,
    candidates: ['={{ literal text }}'],
    'a.b': '',
  };
  assert.equal(valid(value), true);
  assert.equal(valid({ ...value, price: '0' }), false);
  assert.equal(valid({ ...value, candidates: '={{ literal text }}' }), false);
  const built = fragment();
  assert.equal(built.exit.type, 'n8n-nodes-base.set');
  assert.equal(built.exit.config.parameters.options.dotNotation, false);
  assert.deepEqual(
    capability
      .nodeOutputReferences(parameters)
      .map((reference) => reference.nodeId),
    parameters.fields.map(() => source.nodeId),
  );
});

test('reader preserves one result per linked item, explicit empty values, pairing and zero-item input', () => {
  const rows = [
    globalThis.structuredClone(item),
    {
      item: {
        ...globalThis.structuredClone(item.item),
        name: '0008',
        price: -1,
        candidates: [],
      },
    },
  ];
  const original = globalThis.structuredClone(rows);
  const result = projectRows(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].json, {
    name: '0007',
    price: 0,
    active: false,
    missing: null,
    candidates: ['={{ literal text }}'],
    'a.b': '',
  });
  assert.equal(result[1].json.name, '0008');
  assert.deepEqual(result[1].json.candidates, []);
  assert.deepEqual(
    result.map((row) => row.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
  assert.deepEqual(readRows([]), []);
  assert.deepEqual(
    readRows(rows).map((row) => row.json),
    original,
  );
  assert.deepEqual(rows, original);
});

test('reader and compiler reject missing values, invalid unselected data and absent actual runtime source contracts', () => {
  assert.throws(
    () => readRows([{ item: { ...item.item, extra: 'invalid' } }]),
    /does not match declared schema/,
  );
  assert.throws(
    () => readRows([{ item: { ...item.item, price: '0' } }]),
    /does not match declared schema/,
  );
  assert.throws(
    () => capability.compile({ planned, apiNodeNames: {}, position: [0, 0] }),
    /nativeOutputSources is required/,
  );
  assert.throws(
    () =>
      capability.compile({
        planned,
        apiNodeNames: {},
        position: [0, 0],
        nativeOutputSources: [{ ...source, schema: true }],
      }),
    /matching actual compiled name\/schema/,
  );
});

test('staged projection settings bind only actual chosen native outputs and reject wrong pointers without modifying the proposal', async () => {
  const producer = createJsonOutputCapability({
    name: 'joined-source',
    description: 'Original native JSON item',
    parametersSchema: sourceSchema,
  });
  const input = {
    planId: 'native-summary',
    scenario:
      'Select name and price from the supplied joined item without changes.',
    capabilities: [
      producer,
      ...resolveN8nNativePlanningFeatures({
        features: [N8nNativeFeature.ProjectNativeOutput],
      }).planningCapabilities,
    ],
    preparedNativeNodes: [
      { id: source.nodeId, capability: producer.name, parameters: item },
    ],
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.ProjectNativeOutput,
          purpose: 'Project the original named summary fields',
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
      sourcesByNodeId: { [nodeId]: { sourceNodeIds: [source.nodeId] } },
    },
  });
  const good = { decision: { status: 'provided', parameters } };
  const bad = globalThis.structuredClone(good);
  bad.decision.parameters.fields[0].pointer = '/item/invented';
  const model = (reply) => ({
    withStructuredOutput(wire) {
      const validate = new Ajv2020({ strict: false }).compile(wire);
      assert.equal(validate(good), true);
      assert.equal(validate(bad), false);
      return {
        async invoke() {
          return globalThis.structuredClone(reply);
        },
      };
    },
  });
  const ready = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId,
    model: model(good),
  });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.node.parameters, parameters);
  await assert.rejects(
    generateNativeNodeParameters({
      ...input,
      selection,
      dependencies,
      nodeId,
      model: model(bad),
    }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'parameter-schema',
  );
  assert.equal(bad.decision.parameters.fields[0].pointer, '/item/invented');
});
