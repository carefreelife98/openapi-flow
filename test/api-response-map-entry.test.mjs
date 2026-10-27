import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createResponseObjectEntrySchema,
  createNativeOutputContracts,
  inspectNativeReferenceStructure,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  collectNativeRuntimeInputSlots,
} from '@openapi-flow/core';
import {
  createApiResponseMapEntryCapability,
  resolveN8nNativePlanningFeatures,
  resolveN8nNativeMaterials,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import { generateNativeNodeParameters } from '@openapi-flow/langchain';
import {
  mapEntryMaterial,
  mapEntryBody,
  selectedGroup,
  mapEntryItems,
  compileMapEntryWorkflow,
} from './fixtures/api-response-map-entry-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const materials = await mapEntryMaterial();
const material = materials.find((item) => item.callId === 'groups');
const parameters = {
  sourceNodeId: 'groups',
  pointer: '/result/items',
  key: selectedGroup,
};
const planned = {
  id: 'selected-group',
  capability: 'select-api-response-map-entry',
  parameters,
};
function execute({
  body = mapEntryBody,
  key = selectedGroup,
  linked = false,
  count = 1,
  bodies,
} = {}) {
  const capability = createApiResponseMapEntryCapability({
    materials,
    ...(linked ? { itemMode: 'linked' } : {}),
  });
  const fragment = capability.compile({
    planned: { ...planned, parameters: { ...parameters, key } },
    apiNodeNames: { groups: 'Actual groups' },
    position: [0, 0],
  });
  const response = (value) => ({
    json: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: value,
    },
  });
  return vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: {
        all: () => Array.from({ length: count }, () => ({ json: {} })),
      },
      $: (name) => {
        assert.equal(name, 'Actual groups');
        return {
          all: () => [response(body)],
          itemMatching: (index) =>
            response(bodies === undefined ? body : bodies[index]),
        };
      },
    },
  );
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('one OAS map entry projects its original value schema and preserves key/value without renaming fields inside the result', () => {
  const before = globalThis.structuredClone(materials);
  const capability = createApiResponseMapEntryCapability({ materials });
  const [output] = createNativeOutputContracts({
    nativeNodes: [planned],
    capabilities: [capability],
  });
  const validate = new Ajv2020({ strict: false }).compile(output.schema);
  assert.equal(validate({ key: selectedGroup, value: mapEntryItems }), true);
  assert.equal(validate({ key: selectedGroup, value: { wrong: [] } }), false);
  const result = plain(execute());
  assert.deepEqual(result, [
    {
      json: { key: selectedGroup, value: mapEntryItems },
      pairedItem: { item: 0 },
    },
  ]);
  assert.deepEqual(materials, before);
});

test('empty, escaped and numeric keys use exact own properties, never JSON-pointer tokens or inherited object properties', () => {
  for (const key of ['', '0', 'constructor', selectedGroup])
    assert.deepEqual(plain(execute({ key }))[0].json, {
      key,
      value: mapEntryBody.result.items[key],
    });
  for (const key of [
    'missing',
    'toString',
    'selected/group',
    ' selected/group~.雪',
  ])
    assert.throws(() => execute({ key }), /Missing own object key/);
});

test('full OAS response validation rejects invalid selected or unselected siblings before returning any selection', () => {
  for (const key of [selectedGroup, 'other']) {
    const body = globalThis.structuredClone(mapEntryBody);
    body.result.items[key][0].gdNo = 7;
    assert.throws(() => execute({ body }), /does not match its OAS contract/);
  }
  assert.throws(
    () => execute({ body: { result: { items: [] } } }),
    /OAS contract/,
  );
  assert.throws(() => execute({ count: 2 }), /requires one input item/);
});

test('linked selections preserve each input ancestry and duplicate item IDs rather than taking the first response', () => {
  const other = globalThis.structuredClone(mapEntryBody);
  other.result.items[selectedGroup] = [mapEntryItems[2]];
  const result = plain(
    execute({ linked: true, count: 2, bodies: [mapEntryBody, other] }),
  );
  assert.deepEqual(
    result.map((item) => item.json.value),
    [mapEntryItems, [mapEntryItems[2]]],
  );
  assert.deepEqual(
    result.map((item) => item.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
});

test('array containers cannot masquerade as objects with numeric keys, including object/array schema alternatives', async () => {
  const arrays = await mapEntryMaterial({
    type: 'array',
    items: { type: 'string' },
  });
  assert.throws(
    () => createResponseObjectEntrySchema(arrays[0].operation, '', '0'),
    /no declared object entry/,
  );
  const union = await mapEntryMaterial({
    anyOf: [
      { type: 'array', items: { type: 'string' } },
      { type: 'object', additionalProperties: { type: 'integer' } },
    ],
  });
  const schema = createResponseObjectEntrySchema(union[0].operation, '', '0');
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate(0), true);
  assert.equal(validate('array-item'), false);
});

test('closed objects and pattern properties retain OAS restrictions instead of inventing a dictionary', async () => {
  const scoped = await mapEntryMaterial({
    type: 'object',
    patternProperties: {
      '^group-': { type: 'array', items: { type: 'number' } },
    },
    additionalProperties: false,
  });
  assert.doesNotThrow(() =>
    createResponseObjectEntrySchema(scoped[0].operation, '', 'group-one'),
  );
  assert.throws(
    () => createResponseObjectEntrySchema(scoped[0].operation, '', 'other'),
    /no declared object entry/,
  );
  assert.throws(
    () => createResponseObjectEntrySchema(material.operation, '/missing', 'x'),
    /no declared object entry/,
  );
});

test('the public native registry binds actual OAS material and compiles selection followed by the existing native array split and bound REST request', async () => {
  const stable = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.SelectApiResponseMapEntry],
  });
  assert.equal(stable.planningCapabilities.length, 1);
  assert.throws(
    () => stable.planningCapabilities[0].outputSchema(parameters),
    /actual material/,
  );
  const bound = resolveN8nNativeMaterials({
    apiMaterials: materials,
    nativeNodes: [planned],
    capabilities: stable.planningCapabilities,
    nativeOutputs: [],
  });
  assert.equal(bound.outputs.length, 1);
  const compiled = await compileMapEntryWorkflow('https://fixture.test');
  assert.equal(
    compiled.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.splitOut',
    ),
    true,
  );
  assert.equal(
    compiled.workflow.nodes.some(
      (node) =>
        node.id === 'selected-group' && node.type === 'n8n-nodes-base.code',
    ),
    true,
  );
});

test('runtime group keys use the original OAS value domain and explicit input slots, not a fabricated group or pointer', async () => {
  const valueSchema = createResponseObjectEntrySchema(
    material.operation,
    '/result/items',
  );
  const validate = new Ajv2020({ strict: false }).compile(valueSchema);
  assert.equal(validate(mapEntryItems), true);
  assert.equal(validate({ rows: [] }), false);
  const missing = await compileMapEntryWorkflow(
    'https://fixture.test',
    selectedGroup,
    { runtimeKey: true, provideKey: false },
  );
  assert.equal(missing.nativeInputTemplate.inputsReady, false);
  assert.deepEqual(
    missing.nativeInputTemplate.inputSlots.map((slot) => slot.targetPointer),
    ['/key'],
  );
  const supplied = await compileMapEntryWorkflow('https://fixture.test', '0', {
    runtimeKey: true,
  });
  assert.equal(supplied.nativeInputTemplate.inputsReady, true);
  assert.equal(
    supplied.workflow.nodes.some(
      (node) => node.name === 'Parameters selected-group',
    ),
    true,
  );
  assert.equal(
    supplied.workflow.nodes.some((node) => node.name === '입력 사전 검사'),
    true,
  );
});

test('runtime key ownership cannot replace the API identity or response pointer used by structural reference inspection', () => {
  const capability = createApiResponseMapEntryCapability({ materials });
  const node = {
    ...planned,
    parameters: { sourceNodeId: 'groups', pointer: '/result/items' },
    runtimeParameters: { pointers: ['/key'] },
  };
  const references = inspectNativeReferenceStructure({ node, capability });
  assert.equal(references[0].reference.nodeId, 'groups');
  assert.equal(references[0].reference.pointer, '/result/items');
  for (const pointers of [['/sourceNodeId'], ['/pointer'], ['']])
    assert.throws(() =>
      inspectNativeReferenceStructure({
        node: { ...node, runtimeParameters: { pointers } },
        capability,
      }),
    );
  assert.throws(
    () =>
      inspectNativeReferenceStructure({
        node: { ...node, runtimeParameters: true, parameters: {} },
        capability,
      }),
    /literal structural/,
  );
});

test('staged model parameter generation receives the chosen OAS producer and typed key field, then Core derives the unchanged selected output', async () => {
  const input = {
    planId: 'map-selection-plan',
    scenario: `Select the exact group "${selectedGroup}" and iterate its items.`,
    apiMaterials: materials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.SelectApiResponseMapEntry],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.SelectApiResponseMapEntry,
          purpose: 'The user-selected group',
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
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['groups'] } } },
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
          assert.ok(JSON.stringify(schema).includes('key'));
          const context = JSON.parse(messages[1].content);
          assert.deepEqual(
            context.apiMaterials.map((item) => item.callId),
            ['groups'],
          );
          return { decision: { status: 'provided', parameters } };
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
  assert.deepEqual(result.node.parameters, parameters);
  assert.equal(calls, 1);
});

test('staged runtime key ownership keeps executable input validation separate from OAS-aware model refinements', async () => {
  const input = {
    planId: 'runtime-map-selection',
    scenario: 'Select a group supplied when the workflow is executed.',
    apiMaterials: materials,
    allowRuntimeParameters: true,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [
        N8nNativeFeature.SelectApiResponseMapEntry,
        N8nNativeFeature.SplitNativeOutputArray,
      ],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.SelectApiResponseMapEntry,
          purpose: 'The runtime-selected group',
          parameterSource: 'workflow-fields',
          pointers: ['/key'],
        },
        {
          capability: N8nNativeFeature.SplitNativeOutputArray,
          purpose: 'Iterate the original selected items',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const splitId = selection.instances[1].id;
  const ownershipChoices = selection.context.capabilities.find(
    (entry) => entry.name === N8nNativeFeature.SelectApiResponseMapEntry,
  ).parameterSources;
  assert.deepEqual(ownershipChoices, ['literal', 'workflow-fields']);
  assert.throws(() =>
    resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: N8nNativeFeature.SelectApiResponseMapEntry,
            purpose:
              'Cannot defer the source and pointer needed for graph planning',
            parameterSource: 'workflow-input',
          },
        ],
        gaps: [],
      },
    }),
  );
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: {
      sourcesByNodeId: {
        [nodeId]: { sourceNodeIds: ['groups'] },
        [splitId]: { sourceNodeIds: [nodeId] },
      },
    },
  });
  let calls = 0;
  const result = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId,
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            calls++;
            return {
              decision: {
                status: 'provided',
                parameters: {
                  sourceNodeId: 'groups',
                  pointer: '/result/items',
                },
              },
            };
          },
        };
      },
    },
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls, 1);
  assert.deepEqual(result.node.runtimeParameters, { pointers: ['/key'] });
  assert.deepEqual(result.node.parameters, {
    sourceNodeId: 'groups',
    pointer: '/result/items',
  });
  const [slot] = collectNativeRuntimeInputSlots({
    nativeNodes: [result.node],
    capabilities: [createApiResponseMapEntryCapability({ materials })],
  });
  assert.equal(slot.targetPointer, '/key');
  assert.equal(slot.schema.type, 'string');
  const split = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId: splitId,
    configuredNodes: [result.node],
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            return {
              decision: {
                status: 'provided',
                parameters: {
                  sourceNodeId: nodeId,
                  pointer: '/value',
                },
              },
            };
          },
        };
      },
    },
  });
  assert.equal(split.status, 'ready');
  assert.deepEqual(split.node.parameters, {
    sourceNodeId: nodeId,
    pointer: '/value',
  });
});
