import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import {
  createApiCatalog,
  resolveApiOperations,
  createWorkflowGraphPlan,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  planWorkflowGraph,
  WorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';

const catalog = await createApiCatalog([
  {
    id: 'fixture',
    spec: {
      openapi: '3.1.0',
      info: { title: 'Graph roots', version: '1' },
      paths: Object.fromEntries(
        ['a', 'b', 'c'].map((id) => [
          `/${id}`,
          { get: { responses: { 200: { description: 'Result' } } } },
        ]),
      ),
    },
  },
]);
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
const edge = (from, to) => ({ from, to, input: 'main', output: 'main' });
const proposal = () => ({ nativeNodes: [], edges: [edge('a', 'c')], gaps: [] });
const finalize = (output) =>
  createWorkflowGraphPlan({ proposal: output, materials, capabilities });

test('root metadata includes every independent API root without adding edges', () => {
  const output = proposal();
  const original = globalThis.structuredClone(output);
  const plan = finalize(output);
  assert.deepEqual(plan.starts, ['a', 'b']);
  assert.deepEqual(output, original);
  assert.deepEqual(plan.edges, original.edges);
  assert.deepEqual(plan.nativeNodes, original.nativeNodes);
});

test('material order cannot change dependency edges or the set of roots', () => {
  const output = proposal();
  const plan = createWorkflowGraphPlan({
    proposal: output,
    materials: [...materials].reverse(),
    capabilities,
  });
  assert.deepEqual([...plan.starts].sort(), ['a', 'b']);
  assert.deepEqual(plan.edges, output.edges);
});

test('native root is derived from explicit graph topology', () => {
  const output = {
    nativeNodes: [
      {
        id: 'guard',
        capability: 'if',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'literal', value: 1 },
              operator: 'equals',
              right: { source: 'literal', value: 1 },
            },
          ],
        },
      },
    ],
    edges: [
      { ...edge('guard', 'a'), output: 'true' },
      edge('a', 'b'),
      edge('a', 'c'),
    ],
    gaps: [],
  };
  assert.deepEqual(finalize(output).starts, ['guard']);
});

test('root derivation never repairs missing nodes, invalid ports or cycles', () => {
  for (const [edges, expected] of [
    [[edge('missing', 'a')], /missing node/],
    [[{ ...edge('a', 'b'), output: 'unknown' }], /unknown port/],
    [[edge('a', 'b'), edge('b', 'c'), edge('c', 'a')], /no root.*cycle/],
    [[edge('b', 'c'), edge('c', 'b')], /DAG has a cycle/],
  ]) {
    const output = { nativeNodes: [], edges, gaps: [] };
    const original = globalThis.structuredClone(output);
    assert.throws(() => finalize(output), expected);
    assert.deepEqual(output, original);
  }
});

test('manual plans still reject wrong starts with expected and received IDs', () => {
  const plan = { ...proposal(), starts: ['c', 'c'] };
  assert.throws(
    () => validateWorkflowGraphPlan({ plan, materials, capabilities }),
    /expected \["a","b"\], received \["c","c"\]/,
  );
});

test('gap reports remain non-executable and have no derived starts', () => {
  const output = { ...proposal(), gaps: [{ description: 'Missing API' }] };
  assert.deepEqual(finalize(output), { ...output, starts: [] });
});

test('deriving roots does not make a disconnected response consumer valid', () => {
  const output = {
    nativeNodes: [
      {
        id: 'dependent-gate',
        capability: 'if',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'response', nodeId: 'a', pointer: '' },
              operator: 'equals',
              right: { source: 'literal', value: 1 },
            },
          ],
        },
      },
    ],
    edges: [],
    gaps: [],
  };
  assert.throws(
    () => finalize(output),
    /response a is not available on every incoming route/,
  );
});

test('failed graph proposal is exposed unchanged through a typed error without retry', async () => {
  const output = { ...proposal(), edges: [edge('missing', 'c')] };
  const original = globalThis.structuredClone(output);
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          return output;
        },
      };
    },
  };
  await assert.rejects(
    planWorkflowGraph({
      scenario: 'Read three APIs',
      model,
      materials,
      capabilities,
    }),
    (error) => {
      assert.ok(error instanceof WorkflowGraphPlanningError);
      assert.equal(error.failure.stage, 'graph-validation');
      assert.deepEqual(error.failure.output, original);
      assert.match(error.cause.message, /missing node/);
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(output, original);
});

test('unexpected model starts are rejected by schema, not discarded or repaired', async () => {
  const output = { ...proposal(), starts: ['c'] };
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          return output;
        },
      };
    },
  };
  await assert.rejects(
    planWorkflowGraph({
      scenario: 'Read APIs',
      model,
      materials,
      capabilities,
    }),
    (error) => {
      assert.ok(error instanceof WorkflowGraphPlanningError);
      assert.equal(error.failure.stage, 'proposal-schema');
      assert.deepEqual(error.failure.output, output);
      assert.match(error.message, /starts/);
      return true;
    },
  );
});

test('actual ChatOpenAI tool schema excludes starts and exposes a rejected graph without retry', async () => {
  const requests = [];
  let output = proposal();
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'chatcmpl-graph-test',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-graph',
                  type: 'function',
                  function: {
                    name: 'plan_workflow_graph',
                    arguments: JSON.stringify(output),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'test-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const input = {
      scenario: 'Read all three APIs',
      model,
      materials,
      capabilities,
    };
    const plan = await planWorkflowGraph(input);
    assert.deepEqual(plan.starts, ['a', 'b']);
    output = { ...proposal(), edges: [edge('missing', 'c')] };
    await assert.rejects(planWorkflowGraph(input), (error) => {
      assert.ok(error instanceof WorkflowGraphPlanningError);
      assert.equal(error.failure.stage, 'graph-validation');
      assert.deepEqual(error.failure.output, output);
      return true;
    });
    assert.equal(requests.length, 2);
    for (const request of requests) {
      const tool = request.tools[0].function;
      assert.equal(tool.strict, true);
      assert.equal(tool.parameters.additionalProperties, false);
      assert.deepEqual(tool.parameters.required, [
        'nativeNodes',
        'edges',
        'gaps',
      ]);
      assert.equal(tool.parameters.properties.starts, undefined);
    }
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
