import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import {
  planNativeNodes,
  planWorkflowConnections,
  orchestrateWorkflow,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  createNativeOutputContracts,
  validateWorkflowEdges,
} from '@openapi-flow/core';
import { compileReviewableN8nWorkflow } from '@openapi-flow/n8n';
import {
  contextCapability,
  nativeNodes,
  graphMaterial,
  requestFragment,
  plan as boundPlan,
} from './fixtures/native-output-binding-fixture.mjs';

function model(outputs, inspect = () => {}) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      const wire = toJsonSchema(schema);
      return {
        async invoke(messages) {
          const input = JSON.parse(messages[1].content);
          calls.push(options.name);
          inspect(options.name, input, wire);
          assert.ok(Object.hasOwn(outputs, options.name), options.name);
          return globalThis.structuredClone(outputs[options.name]);
        },
      };
    },
  };
}

const connections = (edges = [], extra = {}) => ({
  edges,
  additionalGaps: [],
  ...extra,
});
const literalApi = {
  status: 'ready',
  operation: graphMaterial.operation,
  arguments: {
    ...graphMaterial.arguments,
    values: { path: { id: 'explicit/42' } },
    bindings: [],
  },
};

test('API-only orchestration omits absent native choices and locks OAS request values', async () => {
  const chat = model(
    { plan_workflow_connections: connections([], { blockedCalls: [] }) },
    (name, input, wire) => {
      assert.equal(name, 'plan_workflow_connections');
      assert.equal(wire.properties.additionalNativeNodes, undefined);
      assert.equal(wire.properties.values, undefined);
      assert.equal(wire.properties.starts, undefined);
      assert.equal(input.apiMaterials, undefined);
      assert.equal(input.materials, undefined);
      assert.deepEqual(input.nodes[0].inputs, ['main']);
    },
  );
  const original = globalThis.structuredClone(literalApi);
  const result = await orchestrateWorkflow({
    workflowId: 'api-only',
    scenario: 'Read explicit/42.',
    model: chat,
    materials: [literalApi],
  });
  assert.deepEqual(result.starts, ['detail']);
  assert.deepEqual(result.nativeNodes, []);
  assert.deepEqual(literalApi, original);
  assert.deepEqual(chat.calls, ['plan_workflow_connections']);
});

test('native-only orchestration derives implementation ports then compiles through official SDK', async () => {
  const chat = model(
    {
      plan_native_nodes: { nativeNodes, gaps: [] },
      plan_workflow_connections: connections(),
    },
    (name, input, wire) => {
      if (name === 'plan_native_nodes') {
        assert.equal(wire.properties.edges, undefined);
        assert.equal(wire.properties.starts, undefined);
        assert.equal(
          wire.properties.nativeNodes.items.anyOf[0].properties.outputSchema,
          undefined,
        );
      } else {
        assert.equal(wire.properties.blockedCalls, undefined);
        assert.equal(wire.properties.additionalNativeNodes, undefined);
        assert.deepEqual(input.nodes[0].outputs, ['main']);
        assert.deepEqual(input.nodes[0].inputs, ['main']);
      }
    },
  );
  const result = await orchestrateWorkflow({
    workflowId: 'native-only',
    scenario: 'Set id to native/42.',
    model: chat,
    capabilities: [contextCapability],
  });
  assert.deepEqual(result.starts, ['context']);
  const compiled = compileReviewableN8nWorkflow({
    id: 'native-only',
    name: 'Native only',
    plan: result,
    materials: [],
    apiNodes: [],
    capabilities: [contextCapability],
  });
  assert.equal(compiled.status, 'complete');
  assert.equal(
    compiled.workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.set')
      .length,
    1,
  );
  assert.deepEqual(chat.calls, [
    'plan_native_nodes',
    'plan_workflow_connections',
  ]);
});

test('supplied native instance and fixed edge remain unchanged; schema requests no unavailable fields', async () => {
  const original = globalThis.structuredClone(nativeNodes);
  const chat = model({
    plan_workflow_connections: connections([], { blockedCalls: [] }),
  });
  const result = await planWorkflowConnections({
    scenario: 'Use supplied context ID without changes.',
    model: chat,
    materials: [{ ...graphMaterial, status: 'ready' }],
    nativeNodes,
    capabilities: [contextCapability],
    edges: boundPlan.edges,
  });
  assert.deepEqual(result.edges, boundPlan.edges);
  assert.deepEqual(nativeNodes, original);
  assert.deepEqual(result.starts, ['context']);
  const compiled = compileReviewableN8nWorkflow({
    id: 'prepared',
    name: 'Prepared',
    plan: result,
    materials: [{ ...graphMaterial, status: 'ready' }],
    apiNodes: [requestFragment()],
    capabilities: [contextCapability],
  });
  assert.equal(compiled.status, 'complete');
});

test('connection-only schema rejects regenerated native nodes and API values without repairing output', async () => {
  for (const extra of [
    { nativeNodes },
    { values: { path: { id: 'changed' } } },
    { starts: ['context'] },
  ]) {
    const output = connections([], extra);
    const chat = model({ plan_workflow_connections: output });
    await assert.rejects(
      planWorkflowConnections({
        scenario: 'Use the supplied context.',
        model: chat,
        capabilities: [contextCapability],
        nativeNodes,
      }),
      (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, output);
        return true;
      },
    );
    assert.equal(chat.calls.length, 1);
  }
});

test('unsupported capability, ID collisions and parameter transformations are never corrected', async () => {
  for (const [nodes, expected] of [
    [[{ ...nativeNodes[0], capability: 'unregistered' }], /capability/],
    [[nativeNodes[0], nativeNodes[0]], /unique/],
  ]) {
    const chat = model({ plan_native_nodes: { nativeNodes: nodes, gaps: [] } });
    await assert.rejects(
      planNativeNodes({
        planId: 'native-test',
        scenario: 'Set context.',
        model: chat,
        capabilities: [contextCapability],
      }),
      expected,
    );
    assert.equal(chat.calls.length, 1);
  }
  const chat = model({ plan_native_nodes: { nativeNodes, gaps: [] } });
  await assert.rejects(
    planNativeNodes({
      planId: 'native-test',
      scenario: 'Use existing context.',
      model: chat,
      capabilities: [contextCapability],
      preparedNativeNodes: nativeNodes,
    }),
    (error) => {
      assert.ok(error instanceof NativeNodePlanningError);
      assert.equal(error.failure.stage, 'node-validation');
      assert.match(error.cause.message, /duplicates preparedNativeNodes/);
      return true;
    },
  );
  const transformed = {
    ...contextCapability,
    parametersSchema: contextCapability.parametersSchema.transform(() => ({
      id: 'changed',
    })),
  };
  assert.throws(
    () =>
      createNativeOutputContracts({ nativeNodes, capabilities: [transformed] }),
    /without defaults, coercion or transformation/,
  );
});

test('invalid supplied ports or required OAS inputs fail before invoking the connection model', async () => {
  const chat = model({});
  await assert.rejects(
    planWorkflowConnections({
      scenario: 'Read.',
      model: chat,
      materials: [literalApi],
      edges: [
        { from: 'detail', output: 'unknown', to: 'detail', input: 'main' },
      ],
    }),
    /unknown port/,
  );
  await assert.rejects(
    planWorkflowConnections({
      scenario: 'Read.',
      model: chat,
      materials: [
        { ...literalApi, arguments: { ...literalApi.arguments, values: {} } },
      ],
    }),
    /unresolved OAS request inputs/,
  );
  assert.equal(chat.calls.length, 0);
});

test('invented producers, cycles, repeated fixed edges and missing bound dependencies fail DAG checks', async () => {
  for (const edges of [
    [{ from: 'invented', output: 'main', to: 'detail', input: 'main' }],
    [
      ...boundPlan.edges,
      { from: 'detail', output: 'main', to: 'context', input: 'main' },
    ],
    [],
  ]) {
    const chat = model({
      plan_workflow_connections: connections(edges, { blockedCalls: [] }),
    });
    await assert.rejects(
      planWorkflowConnections({
        scenario: 'Use native output for the API.',
        model: chat,
        materials: [{ ...graphMaterial, status: 'ready' }],
        nativeNodes,
        capabilities: [contextCapability],
      }),
      (error) => error.failure.stage === 'graph-validation',
    );
  }
  const chat = model({
    plan_workflow_connections: connections(boundPlan.edges, {
      blockedCalls: [],
    }),
  });
  await assert.rejects(
    planWorkflowConnections({
      scenario: 'Use existing connection.',
      model: chat,
      materials: [{ ...graphMaterial, status: 'ready' }],
      nativeNodes,
      capabilities: [contextCapability],
      edges: boundPlan.edges,
    }),
    /duplicate edges/,
  );
});

test('reported unmet native requirement becomes a warning region with detached trigger, not a fake API', async () => {
  const chat = model({
    plan_native_nodes: {
      nativeNodes: [],
      gaps: [{ description: 'Requested external action is not supplied.' }],
    },
    plan_workflow_connections: connections(),
  });
  const result = await orchestrateWorkflow({
    workflowId: 'missing-action',
    scenario: 'Perform an unavailable action.',
    model: chat,
    capabilities: [contextCapability],
  });
  assert.equal(result.gaps[0].id, 'missing-action-native-gap-1');
  const compiled = compileReviewableN8nWorkflow({
    id: 'missing-action',
    name: 'Needs review',
    plan: result,
    materials: [],
    apiNodes: [],
    capabilities: [contextCapability],
  });
  assert.equal(compiled.status, 'needs-review');
  assert.equal(compiled.workflow.active, false);
  assert.deepEqual(compiled.workflow.connections, {});
  assert.ok(
    compiled.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.stickyNote',
    ),
  );
});

test('all material groups may be omitted: report an unmet requirement without inventing a capability', async () => {
  const chat = model({
    plan_workflow_connections: connections([], {
      additionalGaps: [
        {
          id: 'missing-read',
          description: 'No read API or native action was supplied.',
        },
      ],
    }),
  });
  const result = await orchestrateWorkflow({
    workflowId: 'empty',
    scenario: 'Read.',
    model: chat,
  });
  assert.deepEqual(result.nativeNodes, []);
  assert.equal(result.gaps[0].id, 'missing-read');
  assert.deepEqual(chat.calls, ['plan_workflow_connections']);
  assert.throws(
    () =>
      validateWorkflowEdges({
        contracts: [],
        edges: [
          { from: 'unknown', output: 'main', to: 'unknown', input: 'main' },
        ],
      }),
    /missing node/,
  );
});

test('native model defaults are rejected instead of becoming silently supplied parameters', async () => {
  const capability = {
    ...contextCapability,
    parametersSchema: z.strictObject({ id: z.string().default('invented') }),
  };
  const output = {
    nativeNodes: [{ ...nativeNodes[0], parameters: {} }],
    gaps: [],
  };
  const chat = model({ plan_native_nodes: output });
  await assert.rejects(
    planNativeNodes({
      planId: 'no-default',
      scenario: 'Set context.',
      model: chat,
      capabilities: [capability],
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
  assert.deepEqual(output.nativeNodes[0].parameters, {});
});

test('orchestration rejects invalid supplied OAS values before native selection as well', async () => {
  const chat = model({});
  await assert.rejects(
    orchestrateWorkflow({
      workflowId: 'invalid-input',
      scenario: 'Read detail.',
      model: chat,
      capabilities: [contextCapability],
      materials: [
        { ...literalApi, arguments: { ...literalApi.arguments, values: {} } },
      ],
    }),
    /unresolved OAS request inputs/,
  );
  assert.deepEqual(chat.calls, []);
});
