import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { z } from 'zod';
import {
  createNativeOutputContracts,
  validateApiBindingPlan,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  planApiBindings,
  generateApiArguments,
  planWorkflowGraph,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import {
  compilePlannedN8nWorkflow,
  compileReviewableN8nWorkflow,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import {
  createReviewableWorkflowGenerationGraph,
  createPlannedWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  capabilities,
  nativeNodes,
  nativeOutputs,
  material,
  bindings,
  graphMaterial,
  plan,
  sources,
  requestFragment,
  spec,
} from './fixtures/native-output-binding-fixture.mjs';
import { materials, bind } from './fixtures/request-binding-fixture.mjs';
import { createHttpRequestNode } from '@openapi-flow/n8n';

function execute(json, items) {
  const code = requestFragment().entry.config.parameters.jsCode;
  return vm.runInNewContext(`(function(){${code}})()`, {
    $: () => ({ all: () => items ?? [{ json }] }),
  })[0].json;
}
function compile(options = {}) {
  return compilePlannedN8nWorkflow({
    id: 'native-output',
    name: 'Native output',
    materials: [graphMaterial],
    capabilities,
    plan,
    apiNodes: [requestFragment()],
    ...options,
  });
}

test('native output contracts come from validated capability parameters, not LLM response schemas', () => {
  assert.equal(nativeOutputs[0].schema.properties.id.type, 'string');
  assert.throws(
    () =>
      createNativeOutputContracts({
        nativeNodes: [...nativeNodes, ...nativeNodes],
        capabilities,
      }),
    /unique/,
  );
  for (const parametersSchema of [
    z.object({ id: z.coerce.string() }),
    z.object({ id: z.string().default('invented') }),
  ]) {
    const capability = createJsonOutputCapability({
      name: 'mutating',
      description: 'Rejected schema changes',
      parametersSchema,
    });
    assert.throws(
      () =>
        createNativeOutputContracts({
          nativeNodes: [
            {
              id: 'mutating',
              capability: 'mutating',
              parameters:
                parametersSchema.shape.id instanceof z.ZodDefault
                  ? {}
                  : { id: 8 },
            },
          ],
          capabilities: [capability],
        }),
      /without defaults, coercion or transformation/,
    );
  }
});

test('binding planner includes only explicit native JSON schemas and fully bound values skip generation', async () => {
  const proposed = { calls: [{ callId: 'detail', bindings }], gaps: [] };
  const result = await planApiBindings({
    scenario: 'Read the detail using the unchanged native context ID.',
    materials: [material],
    nativeOutputs,
    model: {
      withStructuredOutput(schema, options) {
        assert.equal(options.strict, true);
        return {
          async invoke(messages) {
            assert.deepEqual(
              JSON.parse(messages[1].content).nativeOutputs,
              nativeOutputs,
            );
            assert.equal(
              schema.safeParse({
                ...proposed,
                calls: [
                  {
                    callId: 'detail',
                    bindings: [{ ...bindings[0], sourceNodeId: 'invented' }],
                  },
                ],
              }).success,
              false,
            );
            return proposed;
          },
        };
      },
    },
  });
  validateApiBindingPlan({
    materials: [material],
    nativeOutputs,
    plan: result,
  });
  const args = await generateApiArguments({
    callId: 'detail',
    operation: material.operation,
    bindings,
    scenario: 'Read the native ID',
    model: {
      withStructuredOutput() {
        throw new Error('No literal inputs to generate');
      },
    },
  });
  assert.deepEqual(args.values, {});
  assert.deepEqual(args.unresolvedInputs, []);
});

test('missing native source schemas fail at the public boundary before any model call', async () => {
  await assert.rejects(
    () =>
      planApiBindings({
        scenario: 'Read context',
        materials: [material],
        nativeOutputs: [{ nodeId: 'context' }],
        model: {
          withStructuredOutput() {
            throw new Error('Must not invoke the model');
          },
        },
      }),
    /nativeOutputs\[context\]\.schema/,
  );
  assert.throws(
    () =>
      requestFragment({
        nativeOutputSources: [{ nodeId: 'context', nodeName: 'context' }],
      }),
    /nativeOutputs\[context\]\.schema/,
  );
});

test('native binding rejects unknown producers and incompatible types without converting values', () => {
  const input = {
    materials: [material],
    nativeOutputs,
    plan: { calls: [{ callId: 'detail', bindings }], gaps: [] },
  };
  validateApiBindingPlan(input);
  assert.throws(
    () => validateApiBindingPlan({ ...input, nativeOutputs: [] }),
    /unknown source/,
  );
  assert.throws(
    () =>
      validateApiBindingPlan({
        ...input,
        nativeOutputs: [
          {
            nodeId: 'context',
            schema: { type: 'object', properties: { id: { type: 'number' } } },
          },
        ],
      }),
    /incompatible/,
  );
  assert.throws(
    () =>
      validateApiBindingPlan({
        ...input,
        nativeOutputs: [...nativeOutputs, ...nativeOutputs],
      }),
    /unique/,
  );
});

test('runtime reads native JSON without body unwrapping and checks source/target before HTTP', () => {
  assert.match(execute({ id: 'native/42' }).url, /native%2F42/);
  for (const json of [{}, { id: 8 }, { body: { id: 'wrapped' } }])
    assert.throws(() => execute(json), /Native output/);
  assert.throws(() => execute({}, []), /unambiguous/);
  assert.throws(
    () => execute({}, [{ json: { id: 'a' } }, { json: { id: 'b' } }]),
    /unambiguous/,
  );
  // A declared permissive source still cannot loosen the target OAS request type.
  const fragment = requestFragment({
    nativeOutputSources: [
      { nodeId: 'context', nodeName: 'context', schema: true },
    ],
  });
  assert.throws(
    () =>
      vm.runInNewContext(
        `(function(){${fragment.entry.config.parameters.jsCode}})()`,
        { $: () => ({ all: () => [{ json: { id: 8 } }] }) },
      ),
    /OAS schema/,
  );
  assert.throws(
    () => requestFragment({ apiNodeNames: { context: 'API context' } }),
    /both API and native/,
  );
});

test('DAG and runtime compilation agree on native producer identity, schema and availability', () => {
  const workflow = compile().workflow;
  assert.equal(
    workflow.connections.context.main[0][0].node,
    'Materialize detail',
  );
  assert.equal(
    workflow.nodes.find((item) => item.name === 'context').type,
    'n8n-nodes-base.set',
  );
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        materials: [graphMaterial],
        capabilities,
        plan: { ...plan, edges: [], starts: ['context', 'detail'] },
      }),
    /not available/,
  );
  assert.throws(
    () =>
      compile({
        apiNodes: [
          requestFragment({
            nativeOutputSources: [{ ...sources[0], nodeName: 'wrong-name' }],
          }),
        ],
      }),
    /compiled producer/,
  );
  assert.throws(
    () =>
      compile({
        apiNodes: [
          requestFragment({
            nativeOutputSources: [{ ...sources[0], schema: true }],
          }),
        ],
      }),
    /declared native output schema/,
  );
  const missing = requestFragment();
  delete missing.bindingSources;
  assert.throws(
    () => compile({ apiNodes: [missing] }),
    /every native producer/,
  );
  const reviewPlan = { ...plan, blockedCalls: [] };
  assert.equal(
    compileReviewableN8nWorkflow({
      id: 'review-native',
      name: 'Review native',
      materials: [{ ...graphMaterial, status: 'ready' }],
      capabilities,
      plan: reviewPlan,
      apiNodes: [requestFragment()],
    }).status,
    'complete',
  );
});

test('API bodies and native JSON outputs share materialization after an explicit Merge without changing types', () => {
  const source = materials.find((item) => item.callId === 'source');
  const summary = materials.find((item) => item.callId === 'summary');
  const summaryArguments = {
    callId: 'summary',
    values: {},
    unresolvedInputs: [],
    bindings: [
      bind('/body/id', 'context', '/id'),
      ...['price', 'stock', 'labels', 'filter'].map((field) =>
        bind(`/body/${field}`, 'source', `/${field}`),
      ),
    ],
  };
  const apiMaterials = [
    {
      operation: source.operation,
      arguments: {
        callId: 'source',
        values: {},
        bindings: [],
        unresolvedInputs: [],
      },
    },
    { operation: summary.operation, arguments: summaryArguments },
  ];
  const names = { source: 'Request source', summary: 'Request summary' };
  const apiNodes = apiMaterials.map((item) =>
    createHttpRequestNode({
      ...item,
      apiNodeNames: names,
      nativeOutputSources: sources,
      baseUrl: 'https://fixture.test',
      position: [300, 0],
    }),
  );
  const joinedPlan = {
    nativeNodes: [
      ...nativeNodes,
      {
        id: 'join',
        capability: 'merge-append',
        parameters: { numberInputs: 2 },
      },
    ],
    edges: [
      { from: 'context', output: 'main', to: 'join', input: 'input1' },
      { from: 'source', output: 'main', to: 'join', input: 'input2' },
      { from: 'join', output: 'main', to: 'summary', input: 'main' },
    ],
    starts: ['source', 'context'],
    gaps: [],
  };
  const compiled = compilePlannedN8nWorkflow({
    id: 'mixed',
    name: 'Mixed bindings',
    materials: apiMaterials,
    apiNodes,
    capabilities,
    plan: joinedPlan,
  });
  assert.equal(
    compiled.workflow.connections.join.main[0][0].node,
    'Materialize summary',
  );
  const response = {
    price: 12.5,
    stock: 0,
    labels: ['a', 'b'],
    filter: { R: 8 },
  };
  const result = vm.runInNewContext(
    `(function(){${apiNodes[1].entry.config.parameters.jsCode}})()`,
    {
      $: (name) => ({
        all: () => [
          {
            json:
              name === 'context' ? { id: 'literal-id' } : { body: response },
          },
        ],
      }),
    },
  )[0].json;
  assert.deepEqual(JSON.parse(result.body.value), {
    id: 'literal-id',
    ...response,
  });
  const broken = globalThis.structuredClone(joinedPlan);
  broken.edges = [
    { from: 'source', output: 'main', to: 'summary', input: 'main' },
  ];
  broken.nativeNodes = nativeNodes;
  assert.throws(
    () =>
      compilePlannedN8nWorkflow({
        id: 'broken',
        name: 'Missing native route',
        materials: apiMaterials,
        apiNodes,
        capabilities,
        plan: broken,
      }),
    /not available/,
  );
});

test('graph planners connect prepared native nodes without asking the model to regenerate their values', async () => {
  for (const reviewable of [false, true]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke(messages) {
            const input = JSON.parse(messages[1].content);
            assert.deepEqual(
              input.preparedNativeNodes,
              nativeNodes.map((node) => ({
                ...node,
                inputPorts: ['main'],
                outputPorts: ['main'],
              })),
            );
            assert.deepEqual(input.nativeOutputs, nativeOutputs);
            return reviewable
              ? {
                  additionalNativeNodes: [],
                  edges: plan.edges,
                  additionalGaps: [],
                  blockedCalls: [],
                }
              : { additionalNativeNodes: [], edges: plan.edges, gaps: [] };
          },
        };
      },
    };
    const input = {
      scenario: 'Use context ID to read detail.',
      model,
      capabilities,
      preparedNativeNodes: nativeNodes,
    };
    const result = reviewable
      ? await planReviewableWorkflowGraph({
          ...input,
          materials: [{ ...graphMaterial, status: 'ready' }],
          gaps: [],
        })
      : await planWorkflowGraph({ ...input, materials: [graphMaterial] });
    assert.deepEqual(result.nativeNodes, nativeNodes);
  }
});

test('official LangGraph examples use OSS native binding and keep typed data including expression-like text', async () => {
  for (const reviewable of [false, true]) {
    const calls = [];
    const model = {
      withStructuredOutput(schema, options) {
        return {
          async invoke(messages) {
            calls.push(options.name);
            const input = JSON.parse(messages[1].content);
            if (options.name === 'select_api_operations')
              return {
                operations: [
                  {
                    candidateId: input.candidates.find(
                      (item) => item.path === '/detail/{id}',
                    ).candidateId,
                    purpose: 'Read context product',
                  },
                ],
                gaps: [],
              };
            if (options.name === 'plan_api_bindings')
              return {
                calls: [{ callId: input.materials[0].callId, bindings }],
                gaps: [],
              };
            const edges = [
              {
                from: 'context',
                output: 'main',
                to: input.materials[0].arguments.callId,
                input: 'main',
              },
            ];
            if (options.name === 'plan_workflow_graph')
              return schema.parse({
                additionalNativeNodes: [],
                edges,
                gaps: [],
              });
            if (options.name === 'plan_reviewable_workflow_graph')
              return schema.parse({
                additionalNativeNodes: [],
                edges,
                additionalGaps: [],
                blockedCalls: [],
              });
            throw new Error(`Unexpected model call ${options.name}`);
          },
        };
      },
    };
    const graph = (
      reviewable
        ? createReviewableWorkflowGenerationGraph
        : createPlannedWorkflowGenerationGraph
    )({
      model,
      capabilities,
      preparedNativeNodes: [
        { ...nativeNodes[0], parameters: { id: '{{ $json.secret }}' } },
      ],
      deployments: [{ documentId: 'fixture', baseUrl: 'https://fixture.test' }],
    });
    const result = await graph.invoke({
      workflowId: 'native-example',
      workflowName: 'Native example',
      scenario: 'Use the native context id unchanged to read detail.',
      sources: [{ id: 'fixture', spec }],
      trace: [],
    });
    const context = result.workflow.nodes.find(
      (item) => item.name === 'context',
    );
    assert.ok(context.parameters.jsonOutput.includes('\\u007b'));
    assert.equal(
      context.parameters.jsonOutput.includes('$json.secret }}'),
      false,
    );
    assert.equal(calls.includes('generate_api_arguments'), false);
    assert.equal(
      result.workflow.connections.context.main[0][0].node,
      'Materialize native-example-request-1',
    );
  }
});
