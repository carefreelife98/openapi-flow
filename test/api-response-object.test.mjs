import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createNativeOutputContracts,
  inspectNativeReferenceStructure,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  createApiResponseObjectCapability,
  resolveN8nNativePlanningFeatures,
  resolveN8nNativeMaterials,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import { nativeFeatureRegistryFixture } from './fixtures/native-feature-registry-fixture.mjs';

const fixture = await nativeFeatureRegistryFixture();
const capability = () =>
  createApiResponseObjectCapability({ materials: fixture.apiMaterials });
const parameters = {
  fields: [
    { name: 'first.result', sourceNodeId: 'left', pointer: '' },
    { name: 'second', sourceNodeId: 'right', pointer: '/rows' },
    { name: 'firstId', sourceNodeId: 'left', pointer: '/id' },
  ],
};
const planned = {
  id: 'result',
  capability: 'compose-api-responses',
  parameters,
};
const left = { id: '0007', rows: [0, 2] };
const right = { id: 'right', rows: [] };
function compile(value = parameters) {
  return capability().compile({
    planned: { ...planned, parameters: value },
    apiNodeNames: { left: 'Actual left', right: 'Actual right' },
    position: [0, 0],
  });
}
function execute({
  bodies = { left, right },
  count = 1,
  value = parameters,
} = {}) {
  const names = { 'Actual left': 'left', 'Actual right': 'right' };
  return vm.runInNewContext(
    `(function(){${compile(value).nodes.find((node) => node.type === 'n8n-nodes-base.code').config.parameters.jsCode}})()`,
    {
      $input: { all: () => [{ json: {} }, { json: {} }] },
      $: (name) => {
        assert.ok(Object.hasOwn(names, name));
        return {
          all: () =>
            Array.from({ length: count }, () => ({
              json: {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: bodies[names[name]],
              },
            })),
        };
      },
    },
  );
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('API response object derives its field types from OAS and compiles through the official SDK Set node', () => {
  const before = globalThis.structuredClone(fixture.apiMaterials);
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability()],
  });
  assert.equal(output.schema.type, 'object');
  assert.deepEqual(output.schema.required, [
    'first.result',
    'second',
    'firstId',
  ]);
  assert.equal(output.schema.additionalProperties, false);
  assert.ok(JSON.stringify(output.schema.properties.second).includes('array'));
  assert.ok(
    JSON.stringify(output.schema.properties.firstId).includes('string'),
  );
  const fragment = compile();
  assert.equal(fragment.exit.type, 'n8n-nodes-base.set');
  assert.equal(fragment.entry.type, 'n8n-nodes-base.merge');
  assert.deepEqual(fragment.inputPorts, { input1: 0, input2: 1 });
  assert.equal(fragment.exit.config.parameters.options.dotNotation, false);
  assert.equal(
    fragment.exit.config.parameters.jsonOutput,
    '={{ JSON.stringify($json) }}',
  );
  assert.equal(fragment.bindingSources.length, 2);
  assert.deepEqual(fixture.apiMaterials, before);
});
test('composition preserves whole bodies, nested arrays, empty arrays, leading-zero strings and literal dotted names', () => {
  const [item] = execute();
  assert.deepEqual(plain(item.json), {
    'first.result': left,
    second: [],
    firstId: '0007',
  });
  assert.deepEqual(plain(item.pairedItem), [{ item: 0 }, { item: 1 }]);
  assert.equal(execute().length, 1);
});
test('source constraints and ambiguity are failures rather than value repair, first-item selection or defaults', () => {
  assert.throws(
    () => execute({ bodies: { left: { id: 7, rows: [] }, right } }),
    /OAS contract/,
  );
  assert.throws(() => execute({ count: 0 }), /unambiguous single JSON item/);
  assert.throws(() => execute({ count: 2 }), /unambiguous single JSON item/);
});
test('empty and escaped literal output property names are not rewritten or treated as paths', () => {
  const fields = ['', 'a/b~c', 'quote"name'].map((name) => ({
    name,
    sourceNodeId: 'left',
    pointer: '/id',
  }));
  const [item] = execute({ value: { fields } });
  assert.deepEqual(
    plain(item.json),
    Object.fromEntries(fields.map(({ name }) => [name, '0007'])),
  );
});
test('unknown sources, invalid pointers, duplicate output names and missing material contracts are rejected', () => {
  for (const value of [
    { fields: [] },
    { fields: [{ name: 'x', sourceNodeId: 'invented', pointer: '' }] },
    { fields: [{ name: 'x', sourceNodeId: 'left', pointer: '/unknown' }] },
    { fields: [{ name: 'x', sourceNodeId: 'left', pointer: 'not-a-pointer' }] },
    {
      fields: [
        { name: 'x', sourceNodeId: 'left', pointer: '' },
        { name: 'x', sourceNodeId: 'right', pointer: '' },
      ],
    },
  ])
    assert.throws(() => capability().outputSchema(value));
  assert.throws(
    () => createApiResponseObjectCapability({ materials: [] }),
    /unique API materials/,
  );
  assert.throws(
    () =>
      capability().compile({
        planned,
        apiNodeNames: { left: 'Actual left' },
        position: [0, 0],
      }),
    /right/,
  );
});
test('stable registry definitions bind real OAS sources and expose reference structure for generic edit and DAG validation', () => {
  const stable = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.ComposeApiResponses],
  });
  assert.equal(stable.planningCapabilities.length, 1);
  assert.throws(
    () => stable.planningCapabilities[0].outputSchema(parameters),
    /actual material/,
  );
  const bound = resolveN8nNativeMaterials({
    apiMaterials: fixture.apiMaterials,
    nativeOutputs: [],
    nativeNodes: [planned],
    capabilities: stable.planningCapabilities,
  });
  assert.equal(bound.outputs.length, 1);
  const references = inspectNativeReferenceStructure({
    node: planned,
    capability: bound.capabilities[0],
  });
  assert.deepEqual(
    references.map((entry) => [entry.nodeIdPointer, entry.valuePointer]),
    [
      ['/fields/0/sourceNodeId', '/fields/0/pointer'],
      ['/fields/1/sourceNodeId', '/fields/1/pointer'],
      ['/fields/2/sourceNodeId', '/fields/2/pointer'],
    ],
  );
  const materials = fixture.apiMaterials.map(({ callId, operation }) => ({
    operation,
    arguments: { callId, values: {}, bindings: [], unresolvedInputs: [] },
  }));
  validateWorkflowGraphPlan({
    materials,
    capabilities: bound.capabilities,
    plan: {
      nativeNodes: [planned],
      edges: [
        { from: 'left', output: 'main', to: 'result', input: 'input1' },
        { from: 'right', output: 'main', to: 'result', input: 'input2' },
      ],
      starts: ['left', 'right'],
      gaps: [],
    },
  });
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        materials,
        capabilities: bound.capabilities,
        plan: {
          nativeNodes: [planned],
          edges: [],
          starts: ['left', 'right', 'result'],
          gaps: [],
        },
      }),
    /each join input requires exactly one source/,
  );
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        materials,
        capabilities: bound.capabilities,
        plan: {
          nativeNodes: [planned],
          edges: [
            { from: 'left', output: 'main', to: 'result', input: 'input1' },
            { from: 'left', output: 'main', to: 'result', input: 'input2' },
          ],
          starts: ['left', 'right'],
          gaps: [],
        },
      }),
    /not available on every incoming route/,
  );
});
test('two fields from one API use a single input without an unnecessary Merge', () => {
  const fragment = compile({
    fields: [
      { name: 'first', sourceNodeId: 'left', pointer: '/id' },
      { name: 'again', sourceNodeId: 'left', pointer: '/id' },
    ],
  });
  assert.equal(fragment.entry.type, 'n8n-nodes-base.code');
  assert.deepEqual(fragment.inputPorts, { input1: 0 });
  assert.equal(fragment.nodes.length, 2);
});
