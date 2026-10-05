import assert from 'node:assert/strict';
import test from 'node:test';
import { node } from '@n8n/workflow-sdk';
import { createDagWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const paths = ['/item', '/price', '/prices', '/items', '/prices-by-list'];
const spec = {
  openapi: '3.1.0',
  info: { title: 'Public DAG fixture', version: '1' },
  paths: Object.fromEntries(
    paths.map((path) => [
      path,
      {
        get: {
          summary: `Read ${path}`,
          parameters: [
            {
              in: 'query',
              name: 'id',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: { 200: { description: 'Success' } },
        },
      },
    ]),
  ),
};
const input = {
  workflowId: 'public-five-api-dag',
  workflowName: 'Five APIs and native nodes',
  scenario:
    'Read five APIs for item-1, gate success, join branches, compare results',
  sources: [{ id: 'inventory', spec }],
  trace: [],
};

function model(missingValue = false) {
  let calls = 0;
  return {
    calls: () => calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          if (options.name === 'select_api_operations') {
            return {
              operations: [...payload.candidates]
                .reverse()
                .map((candidate) => ({
                  candidateId: candidate.candidateId,
                  purpose: `Read ${candidate.path}`,
                })),
              gaps: [],
            };
          }
          assert.equal(options.method, 'functionCalling');
          assert.equal(
            schema.safeParse({ values: { query: { id: 123 } } }).success,
            false,
          );
          return { values: missingValue ? {} : { query: { id: 'item-1' } } };
        },
      };
    },
  };
}

function native(type, version, id, parameters, inputPorts, outputPorts) {
  const sdkNode = node({ type, version, config: { id, name: id, parameters } });
  return {
    nodeId: id,
    nodes: [sdkNode],
    entry: sdkNode,
    exit: sdkNode,
    inputPorts,
    outputPorts,
  };
}

function compose(requests) {
  function request(path) {
    const selected = requests.find((item) => item.operation.path === path);
    assert.ok(selected);
    return selected.fragment;
  }
  const [first, single, query, items, body] = paths.map(request);
  const gate = native(
    'n8n-nodes-base.if',
    2.2,
    'gate',
    {
      conditions: {
        options: { version: 2, typeValidation: 'strict' },
        conditions: [
          {
            leftValue: '={{ $json.body.code }}',
            rightValue: 0,
            operator: { type: 'number', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    { main: 0 },
    { true: 0, false: 1 },
  );
  const stop = native(
    'n8n-nodes-base.stopAndError',
    1,
    'stop',
    { errorType: 'errorMessage', errorMessage: 'CORE_FAILED' },
    { main: 0 },
    {},
  );
  const merge = native(
    'n8n-nodes-base.merge',
    3.2,
    'join',
    { mode: 'append', numberInputs: 2 },
    { left: 0, right: 1 },
    { main: 0 },
  );
  const compare = native(
    'n8n-nodes-base.code',
    2,
    'compare',
    {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const items = $input.all(); if (items.length !== 2) throw new Error('JOIN_COUNT'); return [{json: {pass: true}}];",
    },
    { main: 0 },
    { main: 0 },
  );
  const edge = (from, output, to, targetInput = 'main') => ({
    from: from.nodeId,
    output,
    to: to.nodeId,
    input: targetInput,
  });
  return {
    nodes: [first, single, query, items, body, gate, stop, merge, compare],
    edges: [
      edge(first, 'main', gate),
      edge(gate, 'false', stop),
      edge(gate, 'true', single),
      edge(gate, 'true', items),
      edge(single, 'main', query),
      edge(items, 'main', body),
      edge(query, 'main', merge, 'left'),
      edge(body, 'main', merge, 'right'),
      edge(merge, 'main', compare),
    ],
    starts: [first.nodeId],
  };
}

function dependencies(chatModel, overrides = {}) {
  return {
    model: chatModel,
    deployments: [
      {
        documentId: 'inventory',
        baseUrl: 'https://inventory.example.test',
        credentialBindings: {},
      },
    ],
    reviewSelection(selection) {
      assert.equal(selection.operations.length, 5);
    },
    composeDag: compose,
    ...overrides,
  };
}

test('DAG example combines five API fragments with named native ports independently of selection order', async () => {
  const chat = model();
  const result = await createDagWorkflowGenerationGraph(
    dependencies(chat),
  ).invoke(input);
  assert.equal(chat.calls(), 6);
  assert.equal(result.arguments.length, 5);
  assert.equal(result.workflow.nodes.length, 10);
  assert.equal(result.contracts[0].path, paths.at(-1));
  const firstRequest = result.workflow.nodes.find(
    (item) =>
      item.parameters.url === 'https://inventory.example.test/item?id=item-1',
  );
  assert.ok(firstRequest);
  assert.equal(
    result.workflow.connections.Start.main[0][0].node,
    firstRequest.name,
  );
  assert.equal(result.workflow.connections.gate.main[1][0].node, 'stop');
  const mergeEdges = Object.values(result.workflow.connections)
    .flatMap((connections) => connections.main.flat())
    .filter((edge) => edge.node === 'join');
  assert.deepEqual(mergeEdges.map((edge) => edge.index).sort(), [0, 1]);
});

test('host selection review rejects a plan before generating any arguments', async () => {
  const chat = model();
  await assert.rejects(
    createDagWorkflowGenerationGraph(
      dependencies(chat, {
        reviewSelection() {
          throw new Error('HOST_REVIEW_REQUIRED');
        },
      }),
    ).invoke(input),
    /HOST_REVIEW_REQUIRED/,
  );
  assert.equal(chat.calls(), 1);
});

test('DAG example fails on missing OAS inputs without asking the model for defaults', async () => {
  const chat = model(true);
  await assert.rejects(
    createDagWorkflowGenerationGraph(dependencies(chat)).invoke(input),
    /user clarification.*\/query\/id/,
  );
  assert.equal(chat.calls(), 2);
});

test('host composition cannot silently omit a selected API', async () => {
  await assert.rejects(
    createDagWorkflowGenerationGraph(
      dependencies(model(), {
        composeDag(requests) {
          return {
            nodes: [requests[0].fragment],
            edges: [],
            starts: [requests[0].fragment.nodeId],
          };
        },
      }),
    ).invoke(input),
    /Host DAG omitted selected request/,
  );
});
