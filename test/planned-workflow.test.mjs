import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { deserialize, serialize } from 'node:v8';
import { z } from 'zod';
import { node } from '@n8n/workflow-sdk';
import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import { planWorkflowGraph } from '@openapi-flow/langchain';
import {
  createN8nNativeCapabilities,
  compilePlannedN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { createPlannedWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Public planner fixture', version: '1' },
  paths: Object.fromEntries(
    ['/core', '/left', '/right'].map((path) => [
      path,
      {
        get: {
          responses: {
            200: {
              description: 'Result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      code: { type: 'integer' },
                      result: {
                        type: 'object',
                        additionalProperties: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]),
  ),
};
const catalog = await createApiCatalog([{ id: 'fixture', spec }]);
const contracts = await resolveApiOperations(
  catalog,
  catalog.operations.map((item) => item.key),
);
const materials = contracts.map((operation) => ({
  operation,
  arguments: {
    callId: operation.path.slice(1),
    values: {},
    bindings: [],
    unresolvedInputs: [],
  },
}));
const capabilities = createN8nNativeCapabilities();
const response = (nodeId, pointer) => ({ source: 'response', nodeId, pointer });
const check = {
  left: response('left', '/result'),
  operator: 'equals',
  right: response('right', '/result'),
};
const edge = (from, output, to, input = 'main') => ({
  from,
  output,
  to,
  input,
});
function plan() {
  return {
    nativeNodes: [
      {
        id: 'gate',
        capability: 'if',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: response('core', '/code'),
              operator: 'equals',
              right: { source: 'literal', value: 0 },
            },
          ],
        },
      },
      {
        id: 'stop',
        capability: 'stop-and-error',
        parameters: { message: 'CORE_FAILED' },
      },
      {
        id: 'join',
        capability: 'merge-append',
        parameters: { numberInputs: 2 },
      },
      {
        id: 'assert',
        capability: 'assert-responses',
        parameters: {
          checks: [
            { ...deserialize(serialize(check)), message: 'PRICE_MISMATCH' },
          ],
        },
      },
    ],
    edges: [
      edge('core', 'main', 'gate'),
      edge('gate', 'true', 'left'),
      edge('gate', 'true', 'right'),
      edge('gate', 'false', 'stop'),
      edge('left', 'main', 'join', 'input1'),
      edge('right', 'main', 'join', 'input2'),
      edge('join', 'main', 'assert'),
    ],
    starts: ['core'],
    gaps: [],
  };
}
function compile(graphPlan = plan(), customCapabilities = capabilities) {
  return compilePlannedN8nWorkflow({
    id: 'planned',
    name: 'Planned',
    plan: graphPlan,
    materials,
    capabilities: customCapabilities,
    apiNodes: materials.map((item) =>
      createHttpRequestNode({
        ...item,
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
        position: [300, 0],
      }),
    ),
  });
}
test('typed plan compiles IF, waiting Merge, library-owned assertions and StopAndError', () => {
  const result = compile();
  assert.equal(result.workflow.nodes.length, 8);
  assert.equal(result.workflow.settings.executionOrder, 'v1');
  assert.equal(result.workflow.connections.gate.main[1][0].node, 'stop');
  assert.equal(
    result.workflow.nodes.find((item) => item.name === 'join').parameters
      .numberInputs,
    2,
  );
});
test('response comparisons execute deep JSON equality and reject missing pointers, not coercion', () => {
  const code = compile().workflow.nodes.find((item) => item.name === 'assert')
    .parameters.jsCode;
  const execute = (values) =>
    vm.runInNewContext(`(function(){${code}})()`, {
      $: (name) => ({ first: () => ({ json: { body: values[name] } }) }),
    });
  assert.equal(
    execute({
      'Request left': { result: { a: 1, b: 2 } },
      'Request right': { result: { b: 2, a: 1 } },
    })[0].json.pass,
    true,
  );
  assert.throws(
    () =>
      execute({
        'Request left': { result: { a: 1 } },
        'Request right': { result: { a: '1' } },
      }),
    /PRICE_MISMATCH/,
  );
  assert.throws(
    () => execute({ 'Request left': {}, 'Request right': { result: {} } }),
    /Missing response pointer/,
  );
});
test('IF generated expression uses the same type-strict response comparison', () => {
  const expression = compile().workflow.nodes.find(
    (item) => item.name === 'gate',
  ).parameters.conditions.conditions[0].leftValue;
  const run = (code) =>
    vm.runInNewContext(expression.slice(3, -2).trim(), {
      $: () => ({ first: () => ({ json: { body: { code } } }) }),
    });
  assert.equal(run(0), true);
  assert.equal(run('0'), false);
});

test('IF expressions encode nested JSON and brace-containing data without n8n closing delimiters', () => {
  const proposed = plan();
  proposed.nativeNodes[0].parameters.conditions[0].right.value = '}}';
  const expression = compile(proposed).workflow.nodes.find(
    (item) => item.name === 'gate',
  ).parameters.conditions.conditions[0].leftValue;
  assert.equal(expression.slice(3, -2).includes('}}'), false);
  assert.equal(
    vm.runInNewContext(expression.slice(3, -2).trim(), {
      $: () => ({ first: () => ({ json: { body: { code: '}}' } } }) }),
    }),
    true,
  );
});
test('graph validation rejects unavailable sibling responses before join', () => {
  const proposed = plan();
  proposed.edges = proposed.edges.filter((item) => item.to !== 'assert');
  proposed.edges.push(edge('left', 'main', 'assert'));
  assert.throws(() => compile(proposed), /response right is not available/);
});
test('Merge cannot wait for mutually exclusive IF outputs', () => {
  const proposed = plan();
  proposed.edges.find((item) => item.to === 'right').output = 'false';
  assert.throws(() => compile(proposed), /mutually exclusive/);
});
test('validation rejects cycles, missing IDs, ports, duplicate roots and native ID collisions', () => {
  const mutations = [
    [(p) => p.edges.push(edge('assert', 'main', 'core')), /root|cycle/],
    [(p) => (p.edges[0].from = 'missing'), /missing node/],
    [(p) => (p.edges[0].output = 'missing'), /unknown port/],
    [(p) => p.starts.push('core'), /every root/],
    [(p) => (p.nativeNodes[0].id = 'core'), /unique/],
    [(p) => p.edges.push({ ...p.edges[0] }), /duplicate edges/],
    [(p) => (p.nativeNodes[2].parameters.numberInputs = 3), /join input/],
    [
      (p) =>
        (p.nativeNodes[3].parameters.checks[0].left.pointer = '/bad~2pointer'),
      /invalid response JSON pointer/,
    ],
  ];
  for (const [mutate, expected] of mutations) {
    const proposed = plan();
    mutate(proposed);
    assert.throws(() => compile(proposed), expected);
  }
});
test('registered custom native capability extends the schema and deterministic compiler', async () => {
  const custom = {
    name: 'noop',
    description: 'Explicit host extension, main/main.',
    parametersSchema: z.strictObject({ label: z.string() }),
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned }) => {
      const sdk = node({
        type: 'n8n-nodes-base.noOp',
        version: 1,
        config: { id: planned.id, name: planned.id },
      });
      return {
        nodeId: planned.id,
        nodes: [sdk],
        entry: sdk,
        exit: sdk,
        inputPorts: { main: 0 },
        outputPorts: { main: 0 },
      };
    },
  };
  const proposed = plan();
  proposed.nativeNodes.push({
    id: 'after',
    capability: 'noop',
    parameters: { label: 'Reviewed' },
  });
  proposed.edges.push(edge('assert', 'main', 'after'));
  assert.equal(
    compile(proposed, [...capabilities, custom]).workflow.nodes.at(-1).type,
    'n8n-nodes-base.noOp',
  );
});
test('planner sends OAS response contracts and described native schemas, deriving only root metadata', async () => {
  const expected = plan();
  let calls = 0;
  const model = {
    withStructuredOutput(schema, options) {
      assert.equal(options.name, 'plan_workflow_graph');
      assert.equal(options.method, 'functionCalling');
      assert.equal(options.strict, true);
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          assert.deepEqual(
            payload.materials[0].operation.operation.responses,
            materials[0].operation.operation.responses,
          );
          assert.ok(
            payload.capabilities[0].parametersSchema.properties.conditions
              .description,
          );
          assert.equal(
            JSON.stringify(z.toJSONSchema(schema)).includes('"oneOf"'),
            false,
          );
          const { starts, ...proposal } = expected;
          assert.equal(z.toJSONSchema(schema).properties.starts, undefined);
          assert.ok(schema.safeParse(proposal).success);
          assert.equal(schema.safeParse(expected).success, false);
          assert.deepEqual(starts, ['core']);
          return proposal;
        },
      };
    },
  };
  assert.deepEqual(
    await planWorkflowGraph({
      scenario: 'Compare two response maps after a successful core request',
      materials,
      capabilities,
      model,
    }),
    expected,
  );
  assert.equal(calls, 1);
});
test('official graph adds the model graph-plan stage without any compose callback', async () => {
  let calls = 0;
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          if (options.name === 'select_api_operations')
            return {
              operations: [...payload.candidates].reverse().map((item) => ({
                candidateId: item.candidateId,
                purpose: 'Read fixture',
              })),
              gaps: [],
            };
          if (options.name === 'generate_api_arguments') return { values: {} };
          if (options.name === 'plan_api_bindings')
            return {
              calls: payload.materials.map((item) => ({
                callId: item.callId,
                bindings: [],
              })),
              gaps: [],
            };
          const ids = Object.fromEntries(
            payload.materials.map((item) => [
              item.operation.path.slice(1),
              item.arguments.callId,
            ]),
          );
          const proposed = plan();
          delete proposed.starts;
          for (const e of proposed.edges) {
            if (ids[e.from]) e.from = ids[e.from];
            if (ids[e.to]) e.to = ids[e.to];
          }
          for (const n of proposed.nativeNodes)
            for (const c of [
              ...(n.parameters.conditions ?? []),
              ...(n.parameters.checks ?? []),
            ])
              for (const operand of [c.left, c.right])
                if (operand.source === 'response')
                  operand.nodeId = ids[operand.nodeId];
          return proposed;
        },
      };
    },
  };
  const result = await createPlannedWorkflowGenerationGraph({
    model,
    capabilities,
    deployments: [
      {
        documentId: 'fixture',
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
  }).invoke({
    workflowId: 'planned',
    workflowName: 'Planned',
    scenario: 'Read core; if code 0 join left/right and compare, else stop',
    sources: [{ id: 'fixture', spec }],
    trace: [],
  });
  assert.equal(calls, 3); // Selection, bindings, graph; these APIs have no literal inputs.
  assert.deepEqual(result.trace, [
    'catalog',
    'select',
    'resolve',
    'request-media',
    'bindings',
    'arguments',
    'graph-plan',
    'compile',
  ]);
  assert.equal(result.workflow.nodes.length, 8);
});
test('unmet requirements return a gap proposal and cannot be compiled', async () => {
  const expected = {
    nativeNodes: [],
    edges: [],
    starts: [],
    gaps: [{ description: 'No registered email capability' }],
  };
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          const { starts, ...proposal } = expected;
          assert.deepEqual(starts, []);
          return proposal;
        },
      };
    },
  };
  assert.deepEqual(
    await planWorkflowGraph({
      scenario: 'Send email',
      model,
      materials,
      capabilities,
    }),
    expected,
  );
  assert.throws(() => compile(expected), /Workflow needs review/);
});
test('invalid typed model output fails without substitution', async () => {
  const expected = plan();
  delete expected.starts;
  expected.nativeNodes[0].parameters.conditions[0].operator = 'eval';
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          return expected;
        },
      };
    },
  };
  await assert.rejects(
    planWorkflowGraph({ scenario: 'Compare', model, materials, capabilities }),
    /model workflow graph/,
  );
});
