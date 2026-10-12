import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowPlanningCapabilities,
  validateNativeApiResponseReferences,
  createReviewableWorkflowGraphPlan,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  planNativeNodes,
  planWorkflowGraph,
  planReviewableWorkflowGraph,
  planWorkflowConnections,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import {
  graphMaterial,
  contextCapability,
  spec,
} from './fixtures/native-output-binding-fixture.mjs';

const capabilities = createN8nNativeCapabilities();
const apiCallIds = ['service-a-request-1', 'service-b-request-2'];
const apiMaterials = apiCallIds.map((callId) => ({
  callId,
  operation: graphMaterial.operation,
}));
const response = (nodeId) => ({
  source: 'response',
  nodeId,
  pointer: '/result',
});
const condition = (nodeId) => ({
  left: response(nodeId),
  operator: 'equals',
  right: { source: 'literal', value: 1 },
});
const assertion = (nodeId = apiCallIds[0]) => ({
  id: 'compare',
  capability: 'assert-responses',
  parameters: { checks: [{ ...condition(nodeId), message: 'Mismatch' }] },
});
function model(output, inspect = () => {}) {
  const chat = {
    calls: 0,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          chat.calls++;
          inspect(schema, JSON.parse(messages[1].content), options);
          return globalThis.structuredClone(output);
        },
      };
    },
  };
  return chat;
}

test('IF and assertion generation contracts enumerate real call instances without changing runtime schemas', () => {
  const originalSchemas = capabilities.map(
    (capability) => capability.parametersSchema,
  );
  const planned = createWorkflowPlanningCapabilities({
    capabilities,
    apiCallIds,
  });
  for (const name of ['if', 'assert-responses']) {
    const schema = planned.find(
      (capability) => capability.name === name,
    ).parametersSchema;
    const values =
      name === 'if'
        ? { combinator: 'and', conditions: [condition(apiCallIds[0])] }
        : assertion().parameters;
    assert.ok(schema.safeParse(values).success);
    const invalid = globalThis.structuredClone(values);
    (invalid.conditions ?? invalid.checks)[0].left.nodeId =
      'service-a-request-5';
    assert.equal(schema.safeParse(invalid).success, false);
    assert.ok(
      JSON.stringify(z.toJSONSchema(schema)).includes(
        JSON.stringify(apiCallIds),
      ),
    );
  }
  assert.deepEqual(
    capabilities.map((capability) => capability.parametersSchema),
    originalSchemas,
  );
  assert.ok(
    capabilities
      .find((capability) => capability.name === 'assert-responses')
      .parametersSchema.safeParse(assertion('unknown').parameters).success,
  );
});

test('native model and capability descriptions receive the same specialized enum schema', async () => {
  const node = assertion();
  const chat = model({ nativeNodes: [node], gaps: [] }, (wire, input) => {
    const branch = wire.properties.nativeNodes.items.anyOf.find(
      (entry) => entry.properties.capability.const === 'assert-responses',
    );
    const { $schema, ...parametersSchema } = input.capabilities.find(
      (capability) => capability.name === 'assert-responses',
    ).parametersSchema;
    assert.equal($schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.deepEqual(branch.properties.parameters, parametersSchema);
    assert.ok(JSON.stringify(branch).includes(JSON.stringify(apiCallIds)));
  });
  const result = await planNativeNodes({
    planId: 'refs',
    scenario: 'Compare an API response.',
    model: chat,
    capabilities,
    apiMaterials,
  });
  assert.deepEqual(result.nativeNodes, [node]);
  assert.equal(chat.calls, 1);
});

test('previous r5-style invented ID is rejected at native proposal schema with the unchanged proposal retained', async () => {
  const output = { nativeNodes: [assertion('service-a-request-5')], gaps: [] };
  const chat = model(output);
  await assert.rejects(
    planNativeNodes({
      planId: 'refs',
      scenario: 'Compare.',
      model: chat,
      capabilities,
      apiMaterials,
    }),
    (error) => {
      assert.ok(error instanceof NativeNodePlanningError);
      assert.equal(error.failure.stage, 'proposal-schema');
      assert.deepEqual(error.failure.output, output);
      return true;
    },
  );
  assert.equal(chat.calls, 1);
});

test('two calls of the same OAS API remain separately referenceable across document-style IDs', async () => {
  const node = assertion();
  node.parameters.checks[0].right = response(apiCallIds[1]);
  const chat = model({ nativeNodes: [node], gaps: [] });
  const result = await planNativeNodes({
    planId: 'refs',
    scenario: 'Compare both calls.',
    model: chat,
    capabilities,
    apiMaterials,
  });
  assert.deepEqual(result.nativeNodes, [node]);
  assert.equal(apiMaterials[0].operation, apiMaterials[1].operation);
});

test('resolved contracts from two OAS documents expose both supplied API call IDs', async () => {
  const catalog = await createApiCatalog([
    { id: 'service-a', spec },
    { id: 'service-b', spec },
  ]);
  const keys = ['service-a', 'service-b'].map(
    (id) =>
      catalog.operations.find(
        (entry) => entry.key.documentId === id && entry.path === '/detail/{id}',
      ).key,
  );
  const contracts = await resolveApiOperations(catalog, keys);
  const materials = contracts.map((operation, index) => ({
    callId: apiCallIds[index],
    operation,
  }));
  const node = assertion();
  node.parameters.checks[0].right = response(apiCallIds[1]);
  const result = await planNativeNodes({
    planId: 'multi-document',
    scenario: 'Compare both services.',
    model: model({ nativeNodes: [node], gaps: [] }),
    capabilities,
    apiMaterials: materials,
  });
  assert.deepEqual(result.nativeNodes, [node]);
  assert.deepEqual(
    materials.map((entry) => entry.operation.key.documentId),
    ['service-a', 'service-b'],
  );
});

test('zero API calls produce no empty enum or response operand and retain literal comparisons and stop nodes', async () => {
  const node = assertion();
  node.parameters.checks[0].left = { source: 'literal', value: 1 };
  const stop = {
    id: 'stop',
    capability: 'stop-and-error',
    parameters: { message: 'Stop' },
  };
  const chat = model({ nativeNodes: [node, stop], gaps: [] }, (wire) => {
    assert.equal(JSON.stringify(wire).includes('"enum":[]'), false);
    assert.equal(JSON.stringify(wire).includes('"const":"response"'), false);
  });
  assert.deepEqual(
    (
      await planNativeNodes({
        planId: 'none',
        scenario: 'Compare literal values.',
        model: chat,
        capabilities,
      })
    ).nativeNodes,
    [node, stop],
  );
  await assert.rejects(
    planNativeNodes({
      planId: 'none',
      scenario: 'Invalid response.',
      model: model({ nativeNodes: [assertion()], gaps: [] }),
      capabilities,
    }),
    (error) => error.failure.stage === 'proposal-schema',
  );
});

const custom = {
  name: 'custom-reference',
  description: 'Custom response comparison contract',
  parametersSchema: z.strictObject({
    producer: z.string(),
    nodeId: z.string(),
  }),
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  responseReferences: (parameters) => [
    { source: 'response', nodeId: parameters.producer, pointer: '/result' },
  ],
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};

test('custom field names are preserved; declared references without a schema hook still receive early validation', async () => {
  const planned = createWorkflowPlanningCapabilities({
    capabilities: [custom],
    apiCallIds,
  });
  assert.equal(planned[0], custom);
  const node = {
    id: 'custom-check',
    capability: custom.name,
    parameters: { producer: apiCallIds[0], nodeId: 'not-an-api-reference' },
  };
  const input = {
    planId: 'custom',
    scenario: 'Custom comparison.',
    capabilities: [custom],
    apiMaterials,
  };
  assert.deepEqual(
    (
      await planNativeNodes({
        ...input,
        model: model({ nativeNodes: [node], gaps: [] }),
      })
    ).nativeNodes,
    [node],
  );
  const invalid = {
    ...node,
    parameters: { ...node.parameters, producer: 'absent' },
  };
  await assert.rejects(
    planNativeNodes({
      ...input,
      model: model({ nativeNodes: [invalid], gaps: [] }),
    }),
    (error) => {
      assert.equal(error.failure.stage, 'node-validation');
      assert.match(
        error.cause.message,
        /responseReferences\[0\]\.nodeId "absent"/,
      );
      assert.ok(error.cause.message.includes(apiCallIds[0]));
      return true;
    },
  );
});

test('invalid prepared response references fail before either native or connection model invocation', async () => {
  const chat = model({ nativeNodes: [], gaps: [] });
  await assert.rejects(
    planNativeNodes({
      planId: 'prepared',
      scenario: 'Compare.',
      model: chat,
      capabilities,
      apiMaterials,
      preparedNativeNodes: [assertion('absent')],
    }),
    /not a supplied API callId/,
  );
  await assert.rejects(
    planWorkflowConnections({
      scenario: 'Connect.',
      model: chat,
      capabilities,
      nativeNodes: [assertion('absent')],
    }),
    /not a supplied API callId/,
  );
  assert.equal(chat.calls, 0);
});

test('per-port response declarations are checked without treating native-output references as API IDs', () => {
  const perPort = {
    ...custom,
    responseReferences: () => [],
    inputReferences: (parameters) => ({
      main: [
        { source: 'response', nodeId: parameters.producer, pointer: '/result' },
        { source: 'node-output', nodeId: 'native-context', pointer: '/id' },
      ],
    }),
  };
  const node = {
    id: 'port-check',
    capability: custom.name,
    parameters: { producer: apiCallIds[0], nodeId: 'opaque' },
  };
  validateNativeApiResponseReferences({
    nativeNodes: [node],
    capabilities: [perPort],
    apiCallIds,
  });
  assert.throws(
    () =>
      validateNativeApiResponseReferences({
        nativeNodes: [
          { ...node, parameters: { ...node.parameters, producer: 'absent' } },
        ],
        capabilities: [perPort],
        apiCallIds,
      }),
    /not a supplied API callId/,
  );
});

test('invalid ID lists are rejected before invoking a capability schema factory; legacy custom schema is not rewritten', () => {
  for (const ids of [['duplicate', 'duplicate'], [''], [null]])
    assert.throws(
      () =>
        createWorkflowPlanningCapabilities({
          capabilities: [contextCapability],
          apiCallIds: ids,
        }),
      /unique non-empty/,
    );
  const result = createWorkflowPlanningCapabilities({
    capabilities: [contextCapability],
    apiCallIds: [],
  });
  assert.equal(result[0].parametersSchema, contextCapability.parametersSchema);
});

test('an invalid configured planning hook is rejected instead of silently using the runtime schema', () => {
  for (const hook of [false, null, () => undefined])
    assert.throws(
      () =>
        createWorkflowPlanningCapabilities({
          apiCallIds,
          capabilities: [{ ...custom, createPlanningParametersSchema: hook }],
        }),
      /createPlanningParametersSchema must/,
    );
});

test('combined public graph planners specialize newly generated native references too', async () => {
  const material = {
    ...graphMaterial,
    arguments: {
      ...graphMaterial.arguments,
      values: { path: { id: 'explicit' } },
      bindings: [],
    },
  };
  for (const reviewable of [false, true]) {
    const output = reviewable
      ? {
          additionalNativeNodes: [assertion('absent')],
          edges: [],
          additionalGaps: [],
          blockedCalls: [],
        }
      : { additionalNativeNodes: [assertion('absent')], edges: [], gaps: [] };
    const chat = model(output);
    await assert.rejects(
      (reviewable ? planReviewableWorkflowGraph : planWorkflowGraph)({
        scenario: 'Compare.',
        model: chat,
        capabilities,
        materials: [reviewable ? { ...material, status: 'ready' } : material],
        gaps: [],
      }),
      (error) => error.failure.stage === 'proposal-schema',
    );
    assert.equal(chat.calls, 1);
  }
});

test('existing graph route checks still reject a known API response that has not executed first', () => {
  const material = {
    status: 'ready',
    operation: graphMaterial.operation,
    arguments: {
      ...graphMaterial.arguments,
      values: { path: { id: 'explicit' } },
      bindings: [],
    },
  };
  const node = assertion(material.arguments.callId);
  validateNativeApiResponseReferences({
    nativeNodes: [node],
    capabilities,
    apiCallIds: [material.arguments.callId],
  });
  assert.throws(
    () =>
      createReviewableWorkflowGraphPlan({
        materials: [material],
        capabilities,
        gaps: [],
        proposal: {
          nativeNodes: [node],
          edges: [
            {
              from: node.id,
              output: 'main',
              to: material.arguments.callId,
              input: 'main',
            },
          ],
          additionalGaps: [],
          blockedCalls: [],
        },
      }),
    /not available on every incoming route/,
  );
});

test('a custom planning schema cannot insert defaults in either combined graph planner', async () => {
  const capability = {
    ...contextCapability,
    createPlanningParametersSchema: () =>
      z.strictObject({ id: z.string().default('invented') }),
  };
  for (const reviewable of [false, true]) {
    const output = {
      additionalNativeNodes: [
        { id: 'context', capability: capability.name, parameters: {} },
      ],
      edges: [],
      ...(reviewable ? { additionalGaps: [] } : { gaps: [] }),
    };
    await assert.rejects(
      (reviewable ? planReviewableWorkflowGraph : planWorkflowGraph)({
        scenario: 'Create context.',
        model: model(output),
        capabilities: [capability],
        materials: [],
        gaps: [],
      }),
      (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, output);
        assert.match(
          error.cause.message,
          /without defaults, coercion or transformation/,
        );
        return true;
      },
    );
    assert.deepEqual(output.additionalNativeNodes[0].parameters, {});
  }
});
