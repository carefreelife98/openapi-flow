import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import {
  createNativeOutputContracts,
  createNativeValueSchema,
  createNativeOutputPointerSelectionSchema,
  inspectNativeReferenceStructure,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  createApiResponseResultsCapability,
  resolveN8nNativePlanningFeatures,
  resolveN8nNativeMaterials,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import { nativeFeatureRegistryFixture } from './fixtures/native-feature-registry-fixture.mjs';

const fixture = await nativeFeatureRegistryFixture();
const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');
const parameters = { sourceNodeIds: ['left', 'right'] };
const planned = {
  id: 'results',
  capability: 'gather-api-responses',
  parameters,
};
const capability = () =>
  createApiResponseResultsCapability({ materials: fixture.apiMaterials });
const bodies = {
  left: { id: '0007', rows: [0, 2] },
  right: { id: 'right', rows: [] },
};
const plain = (value) => JSON.parse(JSON.stringify(value));
function compile(value = parameters) {
  return capability().compile({
    planned: { ...planned, parameters: value },
    apiNodeNames: { left: 'Actual left', right: 'Actual right' },
    position: [0, 0],
  });
}
function execute({ value = parameters, responses = bodies, count = 1 } = {}) {
  const names = { 'Actual left': 'left', 'Actual right': 'right' };
  const code = compile(value).nodes.find(
    (entry) => entry.type === 'n8n-nodes-base.code',
  ).config.parameters.jsCode;
  return plain(
    vm.runInNewContext(`(function(){${code}})()`, {
      $input: { all: () => value.sourceNodeIds.map(() => ({ json: {} })) },
      $: (name) => ({
        all: () =>
          Array.from({ length: count }, () => ({
            json: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: responses[names[name]],
            },
          })),
      }),
    }),
  );
}
function expected(ids = parameters.sourceNodeIds) {
  return ids.map((id) => {
    const { operation } = fixture.apiMaterials.find(
      (entry) => entry.callId === id,
    );
    return {
      callId: id,
      documentId: operation.key.documentId,
      method: operation.method,
      path: operation.path,
      body: bodies[id],
    };
  });
}

test('the model chooses API callIds only; names, provenance, schemas and response scopes are not model fields', () => {
  const schema = capability().parametersSchema;
  const jsonSchema = z.toJSONSchema(schema);
  assert.deepEqual(Object.keys(jsonSchema.properties), ['sourceNodeIds']);
  assert.match(
    jsonSchema.properties.sourceNodeIds.description,
    /code owns provenance/,
  );
  assert.deepEqual(jsonSchema.properties.sourceNodeIds.items.enum, [
    'left',
    'right',
  ]);
  for (const value of [
    { sourceNodeIds: [] },
    { sourceNodeIds: ['unknown'] },
    { sourceNodeIds: ['left', 'left'] },
    { sourceNodeIds: ['left'], fields: [{ name: 'renamed' }] },
    { sourceNodeIds: ['left'], pointer: '/rows' },
    { sourceNodeIds: ['left'], documentId: 'fabricated' },
  ])
    assert.equal(schema.safeParse(value).success, false);
  assert.deepEqual(schema.parse(parameters), parameters);
});

test('code owns full response references and official Merge/Aggregate compilation, without Set or a second branch join', () => {
  const before = globalThis.structuredClone(fixture.apiMaterials);
  assert.deepEqual(capability().responseReferences(parameters), [
    { source: 'response', nodeId: 'left', pointer: '' },
    { source: 'response', nodeId: 'right', pointer: '' },
  ]);
  assert.deepEqual(
    inspectNativeReferenceStructure({
      node: planned,
      capability: capability(),
    }).map(({ nodeIdPointer, valuePointer, reference }) => ({
      nodeIdPointer,
      valuePointer,
      reference,
    })),
    [
      {
        nodeIdPointer: '/sourceNodeIds/0',
        valuePointer: undefined,
        reference: { source: 'response', nodeId: 'left', pointer: '' },
      },
      {
        nodeIdPointer: '/sourceNodeIds/1',
        valuePointer: undefined,
        reference: { source: 'response', nodeId: 'right', pointer: '' },
      },
    ],
  );
  const fragment = compile();
  assert.equal(fragment.entry.type, 'n8n-nodes-base.merge');
  assert.equal(fragment.exit.type, 'n8n-nodes-base.aggregate');
  assert.equal(
    fragment.nodes.filter((entry) => entry.type === 'n8n-nodes-base.merge')
      .length,
    1,
  );
  assert.deepEqual(fragment.inputPorts, { input1: 0, input2: 1 });
  assert.deepEqual(fragment.exit.config.parameters, {
    aggregate: 'aggregateAllItemData',
    destinationFieldName: 'results',
    include: 'allFields',
    options: { includeBinaries: false },
  });
  assert.equal(
    compile({ sourceNodeIds: ['left'] }).entry.type,
    'n8n-nodes-base.code',
  );
  assert.deepEqual(fixture.apiMaterials, before);
});

test('whole bodies and original provenance are preserved; source selection order is explicit, not catalog order', () => {
  assert.deepEqual(
    execute().map((entry) => entry.json),
    expected(),
  );
  assert.deepEqual(
    execute({ value: { sourceNodeIds: ['right', 'left'] } }).map(
      (entry) => entry.json,
    ),
    expected(['right', 'left']),
  );
  const reversed = createApiResponseResultsCapability({
    materials: [...fixture.apiMaterials].reverse(),
  });
  assert.deepEqual(
    reversed.outputSchema(parameters),
    capability().outputSchema(parameters),
  );
  for (const item of execute())
    assert.deepEqual(item.pairedItem, [{ item: 0 }, { item: 1 }]);
});

test('the output schema preserves full OAS bodies and the source order emitted by the compiled reader and Aggregate', () => {
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability()],
  });
  const validate = new Ajv2020({ strict: false }).compile(output.schema);
  assert.equal(
    validate({ results: expected() }),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(validate({ results: expected().reverse() }), false);
  const reversed = new Ajv2020({ strict: false }).compile(
    capability().outputSchema({ sourceNodeIds: ['right', 'left'] }),
  );
  assert.equal(reversed({ results: expected(['right', 'left']) }), true);
  assert.equal(reversed({ results: expected() }), false);
  for (const change of [
    (values) => values.slice(0, 1),
    (values) => [values[0], values[0]],
    (values) => values.map((entry) => ({ ...entry, documentId: 'invented' })),
    (values) => values.map((entry) => ({ ...entry, path: '/invented' })),
    (values) => values.map((entry) => ({ ...entry, name: 'model-name' })),
    (values) => values.map((entry) => ({ ...entry, body: entry.body.rows })),
    (values) =>
      values.map((entry) => ({ ...entry, body: { ...entry.body, id: 7 } })),
  ])
    assert.equal(validate({ results: change(expected()) }), false);
});

test('downstream native references can identify each complete source body from the actual positional contract', () => {
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability()],
  });
  const pointers = createNativeOutputPointerSelectionSchema(output);
  for (const [index, id] of parameters.sourceNodeIds.entries()) {
    const pointer = `/results/${index}/body`;
    assert.equal(pointers.safeParse(pointer).success, true);
    const body = new Ajv2020({ strict: false }).compile(
      createNativeValueSchema(output, pointer),
    );
    assert.equal(body(bodies[id]), true);
    const identity = new Ajv2020({ strict: false }).compile(
      createNativeValueSchema(output, `/results/${index}/callId`),
    );
    assert.equal(identity(id), true);
    assert.equal(identity(id === 'left' ? 'right' : 'left'), false);
  }
  for (const pointer of ['/results/2/body', '/results/0/body/invented']) {
    assert.throws(() => createNativeValueSchema(output, pointer));
  }
});

test('missing materials, runtime names, source bodies, invalid OAS data and ambiguous item counts fail without repairs', () => {
  assert.throws(
    () => createApiResponseResultsCapability({ materials: [] }),
    /unique API materials/,
  );
  assert.throws(
    () =>
      createApiResponseResultsCapability({
        materials: [fixture.apiMaterials[0], fixture.apiMaterials[0]],
      }),
    /unique API materials/,
  );
  assert.throws(
    () =>
      capability().compile({
        planned,
        apiNodeNames: { left: 'left' },
        position: [0, 0],
      }),
    /missing right/,
  );
  assert.throws(
    () => execute({ responses: { ...bodies, left: { id: 7, rows: [] } } }),
    /OAS contract/,
  );
  for (const count of [0, 2])
    assert.throws(() => execute({ count }), /unambiguous single JSON item/);
});

test('two invocations of one OAS operation retain different call identities and unchanged original operation metadata', () => {
  const operation = fixture.apiMaterials[0].operation;
  const repeated = createApiResponseResultsCapability({
    materials: [
      { callId: 'first', operation },
      { callId: 'second', operation },
    ],
  });
  const schema = repeated.outputSchema({ sourceNodeIds: ['first', 'second'] });
  const entries = schema.properties.results.prefixItems;
  assert.deepEqual(
    entries.map((entry) => entry.properties.callId.const),
    ['first', 'second'],
  );
  assert.deepEqual(
    entries.map((entry) => entry.properties.path.const),
    [operation.path, operation.path],
  );
});

test('new plans receive the fixed results capability, while explicit legacy selection retains its original contract', () => {
  const defaults = resolveN8nNativePlanningFeatures();
  assert.ok(
    defaults.planningCapabilities.some(
      (entry) => entry.name === N8nNativeFeature.GatherApiResponses,
    ),
  );
  assert.ok(
    defaults.planningCapabilities.every(
      (entry) => entry.name !== N8nNativeFeature.ComposeApiResponses,
    ),
  );
  const legacy = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.ComposeApiResponses],
  });
  assert.deepEqual(
    legacy.planningCapabilities.map((entry) => entry.name),
    [N8nNativeFeature.ComposeApiResponses],
  );
  const stable = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.GatherApiResponses],
  });
  const bound = resolveN8nNativeMaterials({
    apiMaterials: fixture.apiMaterials,
    nativeOutputs: [],
    nativeNodes: [planned],
    capabilities: stable.planningCapabilities,
  });
  assert.deepEqual(
    bound.outputs[0].schema,
    capability().outputSchema(parameters),
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
      starts: ['left', 'right'],
      gaps: [],
      edges: [
        { from: 'left', output: 'main', to: 'results', input: 'input1' },
        { from: 'right', output: 'main', to: 'results', input: 'input2' },
      ],
    },
  });
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        materials,
        capabilities: bound.capabilities,
        plan: {
          nativeNodes: [planned],
          starts: ['left', 'right', 'results'],
          gaps: [],
          edges: [],
        },
      }),
    /available|reachable|ancestor|producer|reference|input/i,
  );
});
