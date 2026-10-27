import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import {
  createApiCatalog,
  resolveApiOperations,
  createApiResponsePointerSelectionSchema,
  createResponseArrayItemSchema,
  describeNativeNodePlanning,
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  createNativeNodeParametersSchema,
  createNativePlanningCapabilityMaterial,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import {
  planNativeNodes,
  generateNativeNodeParameters,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
  createResponseArrayCapability,
} from '@openapi-flow/n8n';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

async function material(schema, id = 'source') {
  const catalog = await createApiCatalog([
    {
      id: 'pointer-contracts',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Pointer selection contracts', version: '1' },
        paths: {
          '/source': {
            get: {
              responses: {
                200: {
                  description: 'Original result',
                  content: { 'application/json': { schema } },
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
    catalog.operations.map((value) => value.key),
  );
  return { callId: id, operation };
}
function literalChoice(capability, purpose) {
  return { capability, purpose, parameterSource: 'literal' };
}
function model(output, inspect = () => {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls++;
          inspect({
            schema,
            options,
            context: JSON.parse(messages[1].content),
          });
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}
const closed = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    rows: { type: 'array', items: { type: 'number' } },
    groups: {
      type: 'object',
      properties: { 'a/b~c.*': { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

test('array pointer choices reject actual object/scalar locations and preserve escaped names on the wire and in Zod', async () => {
  const { operation } = await material(closed);
  const before = globalThis.structuredClone(operation);
  const schema = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  const wire = z.toJSONSchema(schema);
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema(wire), true);
  const validate = ajv.compile(wire);
  for (const pointer of [
    '',
    '/id',
    '/groups',
    '/unknown',
    '/groups/aXb~0c.*',
    '/rows/00',
    '/rows/~2',
  ]) {
    assert.equal(schema.safeParse(pointer).success, false, pointer);
    assert.equal(validate(pointer), false, pointer);
  }
  for (const pointer of ['/rows', '/groups/a~1b~0c.*']) {
    assert.equal(schema.parse(pointer), pointer);
    assert.equal(validate(pointer), true);
    assert.doesNotThrow(() =>
      createResponseArrayItemSchema(operation, pointer),
    );
  }
  assert.deepEqual(operation, before);
});

test('root arrays, nullable/composed arrays and nested item arrays remain eligible without choosing an element in code', async () => {
  for (const response of [
    { type: 'array', items: { type: 'string' } },
    { anyOf: [{ type: 'array', items: { type: 'number' } }, { type: 'null' }] },
    { allOf: [{ type: 'array' }, { items: { type: 'boolean' } }] },
  ]) {
    const { operation } = await material(response);
    assert.equal(
      createApiResponsePointerSelectionSchema({
        operation,
        valueKind: 'array',
      }).parse(''),
      '',
    );
  }
  const { operation } = await material({
    type: 'array',
    items: {
      type: 'object',
      properties: { children: { type: 'array', items: { type: 'integer' } } },
      additionalProperties: false,
    },
  });
  const schema = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  assert.equal(schema.parse('/3/children'), '/3/children');
  assert.doesNotThrow(() =>
    createResponseArrayItemSchema(operation, '/3/children'),
  );
});

test('open dictionaries retain dynamic keys rather than treating the finite pointer catalog as an OAS whitelist', async () => {
  const { operation } = await material({
    type: 'object',
    properties: {
      groups: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      id: { type: 'integer' },
    },
    additionalProperties: false,
  });
  const schema = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  for (const pointer of ['/groups/new-group', '/groups/a~1b~0c', '/groups/']) {
    assert.equal(schema.parse(pointer), pointer);
    assert.doesNotThrow(() =>
      createResponseArrayItemSchema(operation, pointer),
    );
  }
  assert.equal(schema.safeParse('/groups').success, false);
  assert.equal(schema.safeParse('/id').success, false);
  assert.equal(schema.safeParse('/missing/group').success, false);
  assert.equal(schema.safeParse('/groups/bad~escape').success, false);
});

test('dynamic candidate projection never replaces original pattern or item validation', async () => {
  const { operation } = await material({
    type: 'object',
    patternProperties: {
      '^rows-': { type: 'array', items: { type: 'number' } },
    },
    additionalProperties: false,
  });
  const schema = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  assert.equal(schema.parse('/rows-good'), '/rows-good');
  assert.doesNotThrow(() =>
    createResponseArrayItemSchema(operation, '/rows-good'),
  );
  // Dynamic boundaries are candidates, not a second implementation of JSON Schema matching.
  assert.throws(
    () => createResponseArrayItemSchema(operation, '/not-a-row'),
    /no declared response array/,
  );
});

test('open response candidates use portable wire syntax while code still rejects a known non-array field', async () => {
  const { operation } = await material({
    type: 'object',
    properties: { id: { type: 'string' } },
  });
  const schema = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  const wire = z.toJSONSchema(schema);
  assert.equal(wire.pattern.includes('(?!'), false);
  assert.equal(wire.pattern.includes('(?='), false);
  assert.equal(schema.safeParse('/id').success, false);
  assert.throws(
    () => createResponseArrayItemSchema(operation, '/id'),
    /no declared response array/,
  );
  assert.equal(schema.parse('/new-dynamic-array'), '/new-dynamic-array');
  assert.doesNotThrow(() =>
    createResponseArrayItemSchema(operation, '/new-dynamic-array'),
  );
});

test('known scalar responses have no array choice while value selection retains their complete body', async () => {
  const { operation } = await material({ type: 'string' });
  const arrays = createApiResponsePointerSelectionSchema({
    operation,
    valueKind: 'array',
  });
  assert.equal(arrays.safeParse('').success, false);
  assert.equal(arrays.safeParse('/made-up').success, false);
  assert.equal(
    new Ajv2020({ strict: false }).validateSchema(z.toJSONSchema(arrays)),
    true,
  );
  assert.equal(
    createApiResponsePointerSelectionSchema({
      operation,
      valueKind: 'value',
    }).parse(''),
    '',
  );
  assert.throws(
    () =>
      createApiResponsePointerSelectionSchema({
        operation,
        valueKind: 'unknown',
      }),
    /valueKind/,
  );
});

test('source-specific array schemas cannot pair a real pointer with the wrong real API', async () => {
  const left = await material(
    {
      type: 'object',
      properties: { leftRows: { type: 'array', items: { type: 'number' } } },
      additionalProperties: false,
    },
    'left',
  );
  const right = await material(
    {
      type: 'object',
      properties: { rightRows: { type: 'array', items: { type: 'boolean' } } },
      additionalProperties: false,
    },
    'right',
  );
  const capability = createResponseArrayCapability({
    materials: [left, right],
    itemMode: 'linked',
  });
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: 'right',
      pointer: '/leftRows',
    }).success,
    false,
  );
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: 'typo',
      pointer: '/rightRows',
    }).success,
    false,
  );
  assert.deepEqual(
    capability.parametersSchema.parse({
      sourceNodeId: 'right',
      pointer: '/rightRows',
    }),
    { sourceNodeId: 'right', pointer: '/rightRows' },
  );
  assert.deepEqual(
    capability.outputSchema({ sourceNodeId: 'right', pointer: '/rightRows' })
      .properties.item,
    createResponseArrayItemSchema(right.operation, '/rightRows'),
  );
});

test('a mixed array/scalar API inventory offers only actual array sources without sending impossible branches', async () => {
  const materials = [
    await material(closed, 'array-source'),
    await material({ type: 'string' }, 'scalar-source'),
  ];
  const capability = createResponseArrayCapability({ materials });
  const wire = z.toJSONSchema(capability.parametersSchema);
  assert.equal(JSON.stringify(wire).includes('"not"'), false);
  assert.equal(JSON.stringify(wire).includes('"oneOf"'), false);
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: 'scalar-source',
      pointer: '',
    }).success,
    false,
  );
  assert.deepEqual(
    capability.parametersSchema.parse({
      sourceNodeId: 'array-source',
      pointer: '/rows',
    }),
    { sourceNodeId: 'array-source', pointer: '/rows' },
  );
});

test('material-bound array planning snapshots do not follow later caller mutations', async () => {
  const source = await material(closed);
  const capability = createResponseArrayCapability({ materials: [source] });
  source.operation.operation.responses['200'].content[
    'application/json'
  ].schema.properties.rows.type = 'string';
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: 'source',
      pointer: '/rows',
    }).success,
    true,
  );
  assert.doesNotThrow(() =>
    capability.outputSchema({ sourceNodeId: 'source', pointer: '/rows' }),
  );
});

test('all stable API-reading material definitions constrain model IDs before actual constructors run, including an empty inventory', async () => {
  const apis = [
    await material(closed, 'left'),
    await material(closed, 'right'),
  ];
  const features = [
    N8nNativeFeature.GatherApiResponses,
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
    N8nNativeFeature.ComposeApiResponses,
  ];
  const capabilities = resolveN8nNativePlanningFeatures({
    features,
  }).planningCapabilities;
  const cases = [
    { sourceNodeIds: ['typo'] },
    { sourceNodeId: 'typo', pointer: '/rows' },
    { sourceNodeId: 'typo', pointer: '' },
    { fields: [{ name: 'value', sourceNodeId: 'typo', pointer: '' }] },
  ];
  for (const apiMaterials of [apis, []]) {
    const description = describeNativeNodePlanning({
      planId: 'stable',
      scenario: 'Use only supplied APIs.',
      apiMaterials,
      capabilities,
    });
    for (const [index, feature] of features.entries()) {
      const schema = description.planningCapabilities.find(
        (value) => value.name === feature,
      ).parametersSchema;
      assert.equal(schema.safeParse(cases[index]).success, false);
      const wire = z.toJSONSchema(schema);
      assert.equal(new Ajv2020({ strict: false }).validateSchema(wire), true);
      assert.equal(JSON.stringify(wire).includes('"enum":[]'), false);
    }
  }
});

test('an unchanged invented ID is rejected at the native model schema boundary, not repaired after material construction', async () => {
  const apiMaterials = [await material(closed, 'left')];
  const output = {
    nativeNodes: [
      {
        id: 'gather',
        capability: N8nNativeFeature.GatherApiResponses,
        parameters: { sourceNodeIds: ['lefft'] },
      },
    ],
    gaps: [],
  };
  const llm = model(output);
  await assert.rejects(
    planNativeNodes({
      planId: 'no-id-repair',
      scenario: 'Gather the actual API response.',
      apiMaterials,
      capabilities: resolveN8nNativePlanningFeatures({
        features: [N8nNativeFeature.GatherApiResponses],
      }).planningCapabilities,
      model: llm,
    }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'proposal-schema',
  );
  assert.equal(llm.calls, 1);
  assert.equal(output.nativeNodes[0].parameters.sourceNodeIds[0], 'lefft');
});

test('staged producer selection binds the pointer schema to the chosen original API and rejects object-as-array before acceptance', async () => {
  const apiMaterials = [
    await material(closed, 'left'),
    await material(closed, 'right'),
  ];
  const input = {
    planId: 'staged-pointer',
    scenario: 'Split only the right response rows.',
    apiMaterials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.SplitApiResponseArray],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        literalChoice(N8nNativeFeature.SplitApiResponseArray, 'right rows'),
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['right'] } } },
  });
  const configuration = { ...input, selection, dependencies, nodeId };
  const bad = {
    decision: {
      status: 'provided',
      parameters: { sourceNodeId: 'right', pointer: '/groups' },
    },
  };
  assert.equal(
    createNativeNodeParametersSchema(configuration).safeParse(bad).success,
    false,
  );
  const llm = model(
    {
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: 'right', pointer: '/rows' },
      },
    },
    ({ schema, context }) => {
      assert.deepEqual(
        context.apiMaterials.map((value) => value.callId),
        ['right'],
      );
      assert.equal(new Ajv2020({ strict: false }).validateSchema(schema), true);
    },
  );
  const result = await generateNativeNodeParameters({
    ...configuration,
    model: llm,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node.parameters, {
    sourceNodeId: 'right',
    pointer: '/rows',
  });
  assert.equal(llm.calls, 1);
});

test('empty parameter-domain proof is conservative and does not confuse an empty array with no possible value', () => {
  for (const schema of [undefined, null, [], 'schema'])
    assert.throws(() => isSchemaProvablyEmpty(schema), /inspection.schema/);
  const capability = (parametersSchema) => ({
    name: 'schema-proof',
    description: 'An explicit parameter contract.',
    parametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  });
  for (const parametersSchema of [
    z.never(),
    z.strictObject({ required: z.never() }),
    z.strictObject({ required: z.array(z.never()).min(1) }),
    z.union([z.never(), z.strictObject({ required: z.never() })]),
  ])
    assert.equal(
      createNativePlanningCapabilityMaterial(
        capability(parametersSchema),
        false,
      ).hasProvablyEmptyParameters,
      true,
    );
  for (const parametersSchema of [
    z.strictObject({}),
    z.strictObject({ optional: z.never().optional() }),
    z.strictObject({ required: z.array(z.never()).length(0) }),
    z.union([z.never(), z.strictObject({ value: z.string() })]),
    z.strictObject({ required: z.tuple([z.string()]).rest(z.never()) }),
  ])
    assert.equal(
      createNativePlanningCapabilityMaterial(
        capability(parametersSchema),
        false,
      ).hasProvablyEmptyParameters,
      false,
    );
});

test('zero API choices are code-owned, so the actual wire asks only for gaps instead of an impossible source or fixed node list', async () => {
  const capabilities = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.GatherApiResponses],
  }).planningCapabilities;
  const output = {
    gaps: [{ description: 'No API response source was supplied.' }],
  };
  const llm = model(output, ({ schema, context }) => {
    assert.deepEqual(Object.keys(schema.properties), ['gaps']);
    assert.equal(JSON.stringify(schema).includes('"not"'), false);
    assert.equal(JSON.stringify(schema).includes('"oneOf"'), false);
    assert.equal(context.capabilities[0].hasProvablyEmptyParameters, true);
  });
  const result = await planNativeNodes({
    planId: 'empty-source-domain',
    scenario: 'Gather an API response without inventing APIs.',
    apiMaterials: [],
    capabilities,
    model: llm,
  });
  assert.deepEqual(result.nativeNodes, []);
  assert.equal(result.gaps.length, 1);
  assert.equal(llm.calls, 1);
  const invalid = model({ nativeNodes: [], gaps: [] });
  await assert.rejects(
    planNativeNodes({
      planId: 'no-empty-list-alias',
      scenario: 'Gather an API response.',
      apiMaterials: [],
      capabilities,
      model: invalid,
    }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'proposal-schema',
  );
});

test('known impossible array parameters are omitted from one-call wire choices and fail before a staged value call', async () => {
  const apiMaterials = [await material({ type: 'string' })];
  const capabilities = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.SplitApiResponseArray],
    apiMaterials,
  }).planningCapabilities;
  const llm = model(
    {
      decision: {
        noAdditionalNodesReason:
          'The only OAS response is a string, not an array.',
        gaps: [{ description: 'No response array is available.' }],
      },
    },
    ({ schema }) => {
      assert.deepEqual(Object.keys(schema.properties.decision.properties), [
        'noAdditionalNodesReason',
        'gaps',
      ]);
      assert.equal(JSON.stringify(schema).includes('"not"'), false);
      assert.equal(JSON.stringify(schema).includes('"oneOf"'), false);
    },
  );
  const result = await planNativeNodes({
    planId: 'no-array-domain',
    scenario: 'Split an actual OAS array only.',
    apiMaterials,
    capabilities,
    model: llm,
    includeExplanations: true,
  });
  assert.equal(result.nativeNodes.length, 0);
  assert.equal(result.gaps.length, 1);
  const input = {
    planId: 'no-staged-array-domain',
    scenario: 'Split an OAS array.',
    apiMaterials,
    capabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        literalChoice(
          N8nNativeFeature.SplitApiResponseArray,
          'declared response array',
        ),
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['source'] } } },
  });
  const impossibleModel = model({});
  await assert.rejects(
    generateNativeNodeParameters({
      ...input,
      selection,
      dependencies,
      nodeId,
      model: impossibleModel,
    }),
    /current source contracts permit no parameter value/,
  );
  assert.equal(impossibleModel.calls, 0);
});
