import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import {
  createWorkflowPlanningCapabilities,
  createNativeOutputContracts,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  planNativeNodes,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import {
  createN8nNativeCapabilities,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { nativeComparisonFixture } from './fixtures/native-comparison-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const { schema, source, rows, check, parameters } = nativeComparisonFixture();
const capabilities = createN8nNativeCapabilities({ itemMode: 'linked' });
const gate = capabilities.find((entry) => entry.name === 'if');
const assertion = capabilities.find(
  (entry) => entry.name === 'assert-responses',
);
function compile(capability = gate, value = parameters, sources = [source]) {
  return capability.compile({
    planned: { id: 'compare', capability: capability.name, parameters: value },
    apiNodeNames: {},
    nativeOutputSources: sources,
    position: [0, 0],
  });
}
function runtime(values) {
  return {
    $input: { all: () => values.map((json) => ({ json })) },
    $: (name) => {
      assert.equal(name, source.nodeName);
      return {
        all: () => values.map((json) => ({ json })),
        itemMatching: (index) => ({ json: values[index] }),
      };
    },
  };
}
function guard(values, fragment = compile()) {
  return vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    runtime(values),
  );
}

test('comparison schemas bind each actual native ID to its own pointer candidates and retain literal/API operands', () => {
  const before = globalThis.structuredClone(source);
  const [bound] = createWorkflowPlanningCapabilities({
    capabilities: [gate],
    apiCallIds: ['api'],
    nativeOutputs: [
      source,
      {
        nodeId: 'other',
        schema: {
          type: 'object',
          properties: { other: { type: 'string' } },
          additionalProperties: false,
        },
      },
    ],
  });
  assert.equal(bound.parametersSchema.safeParse(parameters).success, true);
  for (const edit of [
    (value) => {
      value.conditions[0].left.nodeId = 'invented';
    },
    (value) => {
      value.conditions[0].left.nodeId = 'other';
    },
    (value) => {
      value.conditions[0].left.pointer = '/item/missing';
    },
    (value) => {
      value.conditions[0].left.source = 'response';
    },
  ]) {
    const value = globalThis.structuredClone(parameters);
    edit(value);
    assert.equal(bound.parametersSchema.safeParse(value).success, false);
  }
  assert.equal(
    bound.parametersSchema.safeParse({
      combinator: 'and',
      conditions: [{ ...check, left: { source: 'literal', value: 0 } }],
    }).success,
    true,
  );
  assert.equal(
    bound.parametersSchema.safeParse({
      combinator: 'and',
      conditions: [
        {
          ...check,
          left: { source: 'response', nodeId: 'api', pointer: '/result' },
        },
      ],
    }).success,
    true,
  );
  assert.deepEqual(source, before);
});

test('absent or explicitly empty completed native outputs never expose future native roles', () => {
  for (const nativeOutputs of [undefined, []]) {
    const [bound] = createWorkflowPlanningCapabilities({
      capabilities: [gate],
      apiCallIds: [],
      ...(nativeOutputs === undefined ? {} : { nativeOutputs }),
    });
    assert.equal(bound.parametersSchema.safeParse(parameters).success, false);
    assert.equal(
      JSON.stringify(z.toJSONSchema(bound.parametersSchema)).includes(
        'node-output',
      ),
      false,
    );
  }
  for (const nativeOutputs of [
    null,
    [source, source],
    [{ nodeId: 'api', schema: true }],
    [{ nodeId: 'missing-schema' }],
  ])
    assert.throws(() =>
      createWorkflowPlanningCapabilities({
        capabilities: [gate],
        apiCallIds: ['api'],
        nativeOutputs,
      }),
    );
});

test('the one-call native planner receives a typed prepared producer and accepts native IF references without inventing an API', async () => {
  const producer = createJsonOutputCapability({
    name: 'source',
    description: 'Original typed native item',
    parametersSchema: schema,
  });
  const prepared = {
    id: source.nodeId,
    capability: producer.name,
    parameters: rows[0],
  };
  const proposed = { id: 'gate', capability: gate.name, parameters };
  let calls = 0;
  const result = await planNativeNodes({
    planId: 'native-check',
    scenario: 'Continue only for an amount greater than minus one.',
    capabilities: [producer, gate],
    preparedNativeNodes: [prepared],
    model: {
      withStructuredOutput(wire) {
        const validate = new Ajv2020({ strict: false }).compile(wire);
        assert.equal(validate({ nativeNodes: [proposed], gaps: [] }), true);
        const bad = globalThis.structuredClone(proposed);
        bad.parameters.conditions[0].left.nodeId = 'not-prepared';
        assert.equal(validate({ nativeNodes: [bad], gaps: [] }), false);
        return {
          async invoke() {
            calls++;
            return { nativeNodes: [proposed], gaps: [] };
          },
        };
      },
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.nativeNodes, [proposed]);
  assert.deepEqual(prepared.parameters, rows[0]);
  assert.deepEqual(result.gaps, []);
});

test('staged settings expose exactly the chosen native producer and preserve the source receipt', async () => {
  const producer = createJsonOutputCapability({
    name: 'source',
    description: 'Original typed native item',
    parametersSchema: schema,
  });
  const input = {
    planId: 'staged-comparison',
    scenario: 'Compare the original amount without converting it.',
    capabilities: [producer, gate],
    preparedNativeNodes: [
      { id: source.nodeId, capability: producer.name, parameters: rows[0] },
    ],
  };
  const before = globalThis.structuredClone(input.preparedNativeNodes);
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: gate.name,
          purpose: 'Inspect amount',
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
  let calls = 0;
  const ready = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId,
    model: {
      withStructuredOutput(wire) {
        const output = { decision: { status: 'provided', parameters } };
        const validate = new Ajv2020({ strict: false }).compile(wire);
        assert.equal(validate(output), true);
        const wrong = globalThis.structuredClone(output);
        wrong.decision.parameters.conditions[0].left.pointer = '/not-declared';
        assert.equal(validate(wrong), false);
        return {
          async invoke() {
            calls++;
            return output;
          },
        };
      },
    },
  });
  assert.equal(ready.status, 'ready');
  assert.equal(calls, 1);
  assert.deepEqual(ready.node.parameters, parameters);
  assert.deepEqual(input.preparedNativeNodes, before);
  assert.equal(
    createNativeOutputContracts({
      nativeNodes: [input.preparedNativeNodes[0], ready.node],
      capabilities: input.capabilities,
    }).length,
    1,
  );
});

test('native dependencies are explicit value references at the actual operand locations, not response aliases', () => {
  assert.deepEqual(gate.responseReferences(parameters), []);
  assert.deepEqual(gate.nodeOutputReferences(parameters), [check.left]);
  assert.deepEqual(gate.parameterReferenceBindings(parameters), [
    {
      nodeIdPointer: '/conditions/0/left/nodeId',
      valuePointer: '/conditions/0/left/pointer',
      reference: check.left,
    },
  ]);
  assert.deepEqual(
    compile().bindingSources.map((entry) => entry.kind),
    ['native-json'],
  );
});

test('native IF guards preserve both original items and expressions read the corresponding item without conversion', () => {
  const before = globalThis.structuredClone(rows);
  const fragment = compile();
  const guarded = JSON.parse(JSON.stringify(guard(rows, fragment)));
  assert.deepEqual(
    guarded.map((item) => item.json),
    rows,
  );
  assert.deepEqual(
    guarded.map((item) => item.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
  const expression =
    fragment.exit.config.parameters.conditions.conditions[0].leftValue;
  assert.deepEqual(
    rows.map((_, index) =>
      vm.runInNewContext(expression.slice(3, -2), {
        ...runtime(rows),
        $itemIndex: index,
      }),
    ),
    [true, false],
  );
  assert.deepEqual(rows, before);
  assert.deepEqual(JSON.parse(JSON.stringify(guard([], fragment))), []);
});

for (const [pointer, value] of [
  ['/item/enabled', false],
  ['/item/nothing', null],
  ['/item/code', '0007'],
  ['/item/a~1b~0c', ''],
])
  test(`IF and assertion preserve ${pointer} as its original scalar type`, () => {
    const condition = {
      left: { ...check.left, pointer },
      operator: 'equals',
      right: { source: 'literal', value },
    };
    const fragment = compile(gate, {
      combinator: 'and',
      conditions: [condition],
    });
    guard([rows[0]], fragment);
    const expression =
      fragment.exit.config.parameters.conditions.conditions[0].leftValue;
    assert.equal(
      vm.runInNewContext(expression.slice(3, -2), {
        ...runtime([rows[0]]),
        $itemIndex: 0,
      }),
      true,
    );
    const asserted = compile(assertion, {
      checks: [{ ...condition, message: 'Original scalar mismatch' }],
    });
    const actual = vm.runInNewContext(
      `(function(){${asserted.exit.config.parameters.jsCode}})()`,
      runtime([rows[0]]),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), [
      { json: { pass: true, assertionCount: 1 }, pairedItem: { item: 0 } },
    ]);
  });

test('full native contracts, absent optional pointers and ambiguous multi-item reads fail instead of guessing values', () => {
  const wrong = globalThis.structuredClone(rows[0]);
  wrong.item.code = 7;
  assert.throws(() => guard([wrong]), /does not match declared schema/);
  const optional = compile(gate, {
    combinator: 'and',
    conditions: [
      {
        ...check,
        left: { ...check.left, pointer: '/item/optional' },
        operator: 'equals',
        right: { source: 'literal', value: '' },
      },
    ],
  });
  assert.throws(
    () => guard([rows[0]], optional),
    /Missing native output pointer/,
  );
  const unlinked = createN8nNativeCapabilities().find(
    (entry) => entry.name === 'if',
  );
  assert.throws(
    () => guard(rows, compile(unlinked)),
    /unambiguous single JSON item/,
  );
  const wrongType = compile(gate, {
    combinator: 'and',
    conditions: [{ ...check, left: { ...check.left, pointer: '/item/code' } }],
  });
  assert.throws(
    () => guard([rows[0]], wrongType),
    /Numeric comparison requires numbers/,
  );
});

test('native comparison compilation requires the declared source name/schema and never uses an API name as a substitute', () => {
  for (const nativeOutputSources of [
    undefined,
    [],
    [{ ...source, nodeName: '' }],
    [source, source],
  ])
    assert.throws(
      () =>
        gate.compile({
          planned: { id: 'gate', capability: gate.name, parameters },
          apiNodeNames: { [source.nodeId]: 'not-a-native-output' },
          nativeOutputSources,
          position: [0, 0],
        }),
      /nativeOutputSources/,
    );
  const conflict = globalThis.structuredClone(parameters);
  conflict.conditions[0].right = {
    source: 'response',
    nodeId: source.nodeId,
    pointer: '',
  };
  assert.throws(
    () => compile(gate, conflict),
    /both an API and native producer/,
  );
  const unknownPointer = globalThis.structuredClone(parameters);
  unknownPointer.conditions[0].left.pointer = '/item/not-declared';
  assert.throws(() => compile(gate, unknownPointer), /no declared value/);
});

test('the shared pre-IF boundary also rejects absent optional API values and invalid operator types before expression evaluation', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'comparison-api',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Optional comparison value', version: '1' },
        paths: {
          '/read': {
            get: {
              responses: {
                200: {
                  description: 'Original optional value',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['marker'],
                        additionalProperties: false,
                        properties: {
                          marker: { type: 'string' },
                          optionalCount: { type: 'integer' },
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
  const [operation] = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const envelope = {
    json: {
      body: { marker: 'original' },
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    },
  };
  const compileApi = (pointer) =>
    gate.compile({
      planned: {
        id: 'api-gate',
        capability: gate.name,
        parameters: {
          combinator: 'and',
          conditions: [
            { ...check, left: { source: 'response', nodeId: 'api', pointer } },
          ],
        },
      },
      apiNodeNames: { api: 'Read API' },
      apiResponseContracts: { api: operation },
      singletonApiResponseIds: ['api'],
      position: [0, 0],
    });
  const run = (fragment) =>
    vm.runInNewContext(
      `(function(){${fragment.entry.config.parameters.jsCode}})()`,
      {
        $input: { all: () => [{ json: {} }] },
        $: (name) => {
          assert.equal(name, 'Read API');
          return { all: () => [envelope] };
        },
      },
    );
  assert.throws(
    () => run(compileApi('/optionalCount')),
    /Missing response pointer/,
  );
  assert.throws(
    () => run(compileApi('/marker')),
    /Numeric comparison requires numbers/,
  );
});
