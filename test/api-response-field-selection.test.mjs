import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import {
  createNativeOutputContracts,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  createNativeNodeParametersSchema,
  createNativePlanningCapabilityMaterial,
  describeNativeNodePlanning,
  describeWorkflowGraphPlanning,
} from '@openapi-flow/core';
import {
  generateNativeNodeParameters,
  planNativeNodes,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  createApiResponseObjectCapability,
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { responseFieldSelectionMaterials } from './fixtures/api-response-field-selection-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const materials = await responseFieldSelectionMaterials();
const capability = createApiResponseObjectCapability({ materials });
const field = (sourceNodeId, pointer) => ({
  fields: [{ name: 'chosen', sourceNodeId, pointer }],
});

test('field composition couples exact response paths to their API on both Zod and transmitted JSON Schema', () => {
  const schema = capability.createPlanningParametersSchema({
    apiCallIds: materials.map((entry) => entry.callId),
  });
  const wire = z.toJSONSchema(schema);
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema(wire), true, JSON.stringify(ajv.errors));
  assert.equal(JSON.stringify(wire).includes('"oneOf"'), false);
  const validate = ajv.compile(wire);
  for (const [id, pointer] of [
    ['text', '/text'],
    ['text', '/a~1b~0c'],
    ['list', '/alternatives'],
    ['list', '/alternatives/1'],
    ['dictionary', '/groups/a~1b~0c'],
    ['scalar', ''],
  ]) {
    assert.deepEqual(schema.parse(field(id, pointer)), field(id, pointer));
    assert.equal(validate(field(id, pointer)), true, `${id}${pointer}`);
  }
  for (const [id, pointer] of [
    ['text', '/alternatives'],
    ['list', '/text'],
    ['text', '/a/b~c'],
    ['scalar', '/text'],
    ['empty', ''],
    ['invented', '/text'],
  ]) {
    assert.equal(
      schema.safeParse(field(id, pointer)).success,
      false,
      `${id}${pointer}`,
    );
    assert.equal(validate(field(id, pointer)), false, `${id}${pointer}`);
  }
});

test('selected output types come from exact original OAS values; arrays and scalar bodies are not rewritten', () => {
  const parameters = {
    fields: [
      { name: 'text', sourceNodeId: 'text', pointer: '/text' },
      { name: 'list', sourceNodeId: 'list', pointer: '/alternatives' },
      { name: 'value', sourceNodeId: 'scalar', pointer: '' },
    ],
  };
  const original = globalThis.structuredClone(materials);
  const [output] = createNativeOutputContracts({
    nativeNodes: [{ id: 'selection', capability: capability.name, parameters }],
    capabilities: [capability],
  });
  const validate = new Ajv2020({ strict: false }).compile(output.schema);
  assert.equal(
    validate({ text: '0007', list: ['first', 'second'], value: 0 }),
    true,
  );
  assert.equal(validate({ text: '0007', list: 'first', value: 0 }), false);
  assert.equal(validate({ text: '0007', list: [], value: '0' }), false);
  assert.deepEqual(materials, original);
});

test('an OAS dictionary remains open while unknown closed fields and missing value contracts are not invented', () => {
  for (const pointer of ['/groups/new-group', '/groups/', '/groups/a~1b~0c']) {
    assert.doesNotThrow(() =>
      capability.outputSchema(field('dictionary', pointer)),
    );
  }
  assert.throws(() => capability.outputSchema(field('text', '/missing')));
  const empty = createApiResponseObjectCapability({
    materials: materials.filter((entry) => entry.callId === 'empty'),
  });
  assert.equal(
    createNativePlanningCapabilityMaterial(empty, false)
      .hasProvablyEmptyParameters,
    true,
  );
  assert.equal(
    empty.parametersSchema.safeParse(field('empty', '')).success,
    false,
  );
});

test('runtime validation and planning retain the same source contract snapshot after caller mutation', () => {
  const source = globalThis.structuredClone(
    materials.filter((entry) => entry.callId === 'text'),
  );
  const bound = createApiResponseObjectCapability({ materials: source });
  const before = z.toJSONSchema(bound.parametersSchema);
  source[0].operation.operation.responses['200'].content[
    'application/json'
  ].schema.properties.text.type = 'integer';
  assert.deepEqual(z.toJSONSchema(bound.parametersSchema), before);
  const validate = new Ajv2020({ strict: false }).compile(
    bound.outputSchema(field('text', '/text')),
  );
  assert.equal(validate({ chosen: '0007' }), true);
  assert.equal(validate({ chosen: 7 }), false);
});

test('staged producer choice exposes only that original API and rejects cross-source field plans without repairing them', async () => {
  const input = {
    planId: 'field-selection-stage',
    scenario: 'Select the text response field, not the alternative list.',
    apiMaterials: materials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.ComposeApiResponses],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.ComposeApiResponses,
          purpose: 'Select the requested original text field',
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
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['text'] } } },
  });
  const configuration = { ...input, selection, nodeId, dependencies };
  const schema = createNativeNodeParametersSchema(configuration);
  const bad = {
    decision: {
      status: 'provided',
      parameters: field('text', '/alternatives'),
    },
  };
  assert.equal(schema.safeParse(bad).success, false);
  let calls = 0;
  const model = (reply) => ({
    withStructuredOutput(wire) {
      return {
        async invoke(messages) {
          calls++;
          assert.equal(
            new Ajv2020({ strict: false }).validateSchema(wire),
            true,
          );
          const context = JSON.parse(messages[1].content);
          assert.deepEqual(
            context.apiMaterials.map((entry) => entry.callId),
            ['text'],
          );
          return globalThis.structuredClone(reply);
        },
      };
    },
  });
  const good = await generateNativeNodeParameters({
    ...configuration,
    model: model({
      decision: { status: 'provided', parameters: field('text', '/text') },
    }),
  });
  assert.equal(good.status, 'ready');
  assert.deepEqual(good.node.parameters, field('text', '/text'));
  await assert.rejects(
    generateNativeNodeParameters({ ...configuration, model: model(bad) }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'parameter-schema',
  );
  assert.equal(calls, 2);
  assert.equal(bad.decision.parameters.fields[0].pointer, '/alternatives');
});

test('one-call planning binds the registered definition to real OAS before sending its output schema', async () => {
  const input = {
    planId: 'field-selection-one-call',
    scenario: 'Select the original text response field.',
    apiMaterials: materials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.ComposeApiResponses],
    }).planningCapabilities,
  };
  const good = {
    nativeNodes: [
      {
        id: 'output',
        capability: N8nNativeFeature.ComposeApiResponses,
        parameters: field('text', '/text'),
      },
    ],
    gaps: [],
  };
  const bad = globalThis.structuredClone(good);
  bad.nativeNodes[0].parameters = field('text', '/alternatives');
  const original = globalThis.structuredClone(materials);
  let calls = 0;
  const model = (reply) => ({
    withStructuredOutput(wire) {
      const ajv = new Ajv2020({ strict: false });
      assert.equal(ajv.validateSchema(wire), true);
      const validate = ajv.compile(wire);
      assert.equal(validate(good), true, JSON.stringify(validate.errors));
      assert.equal(validate(bad), false);
      return {
        async invoke() {
          calls++;
          return globalThis.structuredClone(reply);
        },
      };
    },
  });
  const ready = await planNativeNodes({ ...input, model: model(good) });
  assert.deepEqual(ready.nativeNodes, good.nativeNodes);
  await assert.rejects(
    planNativeNodes({ ...input, model: model(bad) }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'proposal-schema',
  );
  assert.equal(calls, 2);
  assert.equal(
    bad.nativeNodes[0].parameters.fields[0].pointer,
    '/alternatives',
  );
  assert.deepEqual(materials, original);
});

test('graph planning uses the same OAS-bound field contract even before any native instance exists', () => {
  const input = {
    mode: 'reviewable',
    scenario: 'Select the original text response field.',
    materials: materials.map((material) => ({
      status: 'blocked',
      ...material,
      gapIds: ['pending-input'],
      bindings: [],
    })),
    gaps: [
      {
        id: 'pending-input',
        stage: 'api-bindings',
        description: 'Input is not provided.',
      },
    ],
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.ComposeApiResponses],
    }).planningCapabilities,
  };
  const description = describeWorkflowGraphPlanning(input);
  const [planning] = description.planningCapabilities;
  assert.equal(
    planning.parametersSchema.safeParse(field('text', '/text')).success,
    true,
  );
  assert.equal(
    planning.parametersSchema.safeParse(field('text', '/alternatives')).success,
    false,
  );
  const [context] = description.context.capabilities;
  const validate = new Ajv2020({ strict: false }).compile(
    context.parametersSchema,
  );
  assert.equal(validate(field('text', '/text')), true);
  assert.equal(validate(field('text', '/alternatives')), false);
});

test('shared planning capture leaves future native producers and unavailable API contracts explicitly unbound', () => {
  const capabilities = resolveN8nNativePlanningFeatures({
    features: [
      N8nNativeFeature.ComposeApiResponses,
      N8nNativeFeature.SplitNativeOutputArray,
    ],
  }).planningCapabilities;
  const description = describeNativeNodePlanning({
    planId: 'known-api-future-native',
    scenario: 'Select a response field, then split a future native array.',
    capabilities,
    apiMaterials: materials,
  });
  const api = description.input.capabilities.find(
    (entry) => entry.name === N8nNativeFeature.ComposeApiResponses,
  );
  const native = description.input.capabilities.find(
    (entry) => entry.name === N8nNativeFeature.SplitNativeOutputArray,
  );
  assert.deepEqual(api.materialSources.apiMaterials, materials);
  assert.equal(native.materialSources, undefined);
  assert.deepEqual(description.context.preparedNativeNodes, []);
  const noApis = describeNativeNodePlanning({
    planId: 'no-api-contracts',
    scenario: 'No API has been supplied.',
    capabilities,
  });
  assert(
    noApis.input.capabilities.every(
      (entry) => entry.materialSources === undefined,
    ),
  );
  assert.equal(
    noApis.context.capabilities.find(
      (entry) => entry.name === N8nNativeFeature.ComposeApiResponses,
    ).hasProvablyEmptyParameters,
    true,
  );
});

test('a real API-only binding failure propagates instead of substituting a coarse planning schema', () => {
  const failure = new Error('Explicit source contract binding failed');
  const [definition] = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.ComposeApiResponses],
  }).planningCapabilities;
  assert.throws(
    () =>
      describeNativeNodePlanning({
        planId: 'binding-failure',
        scenario: 'Select the original response field.',
        apiMaterials: materials,
        capabilities: [
          {
            ...definition,
            bindMaterialContracts: () => {
              throw failure;
            },
          },
        ],
      }),
    (error) => error === failure,
  );
});
