import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createN8nNativeCapabilities,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  compileConditionalIteration,
  materials,
  names,
} from './fixtures/array-iteration-fixture.mjs';

const contracts = Object.fromEntries(
  materials.map((item) => [item.callId, item.operation]),
);
const body = { receipt: 'r', input: { id: 'same', amount: 2 } };
const envelope = (
  value,
  statusCode = 200,
  contentType = 'application/json',
) => ({
  body: value,
  statusCode,
  headers: { 'content-type': contentType },
});
const planned = (capability) => ({
  id: 'check',
  capability,
  parameters:
    capability === 'if'
      ? {
          combinator: 'and',
          conditions: [
            {
              left: {
                source: 'response',
                nodeId: 'details',
                pointer: '/input/amount',
              },
              operator: 'greaterThan',
              right: { source: 'literal', value: 3 },
            },
          ],
        }
      : {
          checks: [
            {
              left: {
                source: 'response',
                nodeId: 'details',
                pointer: '/input/amount',
              },
              operator: 'equals',
              right: { source: 'literal', value: 2 },
              message: 'Amount must match',
            },
          ],
        },
});
function compile(name, linked = false, extra = {}) {
  const capability = createN8nNativeCapabilities(
    linked ? { itemMode: 'linked' } : {},
  ).find((item) => item.name === name);
  return capability.compile({
    planned: planned(name),
    apiNodeNames: names,
    apiResponseContracts: contracts,
    position: [100, 200],
    ...extra,
  });
}
function run(fragment, data, input = [{ json: { unchanged: true } }]) {
  return vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => input },
      $: () => ({
        all: () => [{ json: data }],
        itemMatching: () => ({ json: data }),
      }),
    },
  );
}

test('native IF rejects an invalid unexamined field even when its condition would be false', () => {
  for (const linked of [false, true]) {
    const fragment = compile('if', linked);
    assert.equal(fragment.nodes.length, 2);
    assert.equal(fragment.entry.type, 'n8n-nodes-base.code');
    assert.equal(fragment.exit.type, 'n8n-nodes-base.if');
    assert.throws(
      () => run(fragment, envelope({ ...body, receipt: 42 })),
      /Response details does not match its OAS contract/,
    );
    assert.throws(() => run(fragment, envelope(body, 503)), /OAS contract/);
    assert.throws(
      () => run(fragment, envelope(body, 200, 'text/plain')),
      /OAS contract/,
    );
  }
});
test('native assertions validate full original responses before accepting a matching field', () => {
  for (const linked of [false, true]) {
    const fragment = compile('assert-responses', linked);
    assert.throws(
      () => run(fragment, envelope({ ...body, receipt: 42 })),
      /OAS contract/,
    );
    assert.throws(() => run(fragment, envelope(body, 503)), /OAS contract/);
    assert.throws(
      () => run(fragment, envelope(body, 200, 'text/plain')),
      /OAS contract/,
    );
    assert.equal(run(fragment, envelope(body))[0].json.pass, true);
  }
});
test('response contracts and producer names are required only for actual API operands', () => {
  for (const name of ['if', 'assert-responses']) {
    assert.throws(
      () => compile(name, false, { apiResponseContracts: undefined }),
      /native node check: apiResponseContracts is missing details/,
    );
    assert.throws(
      () => compile(name, false, { apiNodeNames: {} }),
      /native node check: apiNodeNames is missing details/,
    );
    const capability = createN8nNativeCapabilities().find(
      (item) => item.name === name,
    );
    const literal = planned(name);
    const check =
      name === 'if'
        ? literal.parameters.conditions[0]
        : literal.parameters.checks[0];
    check.left = { source: 'literal', value: 2 };
    const fragment = capability.compile({
      planned: literal,
      apiNodeNames: {},
      position: [0, 0],
    });
    assert.equal(fragment.nodes.length, 1);
    assert.deepEqual(fragment.bindingSources ?? [], []);
  }
});
test('IF guards retain every input value, binary payload and original input link without fabricating items', () => {
  const fragment = compile('if', true);
  const input = [
    { json: { value: null }, binary: { data: { id: 'binary-ref' } } },
    { json: { value: ['x', 2] } },
  ];
  const before = globalThis.structuredClone(input);
  const output = run(fragment, envelope(body), input);
  assert.equal(output.length, input.length);
  for (const [index, item] of output.entries()) {
    assert.equal(item.json, input[index].json);
    assert.equal(item.binary, input[index].binary);
    assert.equal(item.pairedItem.item, index);
  }
  assert.deepEqual(input, before);
  assert.equal(run(fragment, envelope(body), []).length, 0);
});
test('the public compiler derives guard contracts from materials, with explicit internal SDK edges and small IF expressions', () => {
  const { workflow } = compileConditionalIteration();
  const guard = workflow.nodes.find(
    (node) => node.id === 'amount-gate-response-contract',
  );
  const gate = workflow.nodes.find((node) => node.id === 'amount-gate');
  assert.equal(
    workflow.connections['Request details'].main[0][0].node,
    guard.name,
  );
  assert.equal(workflow.connections[guard.name].main[0][0].node, gate.name);
  const expression = gate.parameters.conditions.conditions[0].leftValue;
  assert.equal(expression.slice(3, -2).includes('}}'), false);
  assert.equal(expression.includes('OpenApiFlowRequestRuntime'), false);
  assert.equal(
    guard.parameters.jsCode.includes('OpenApiFlowRequestRuntime'),
    true,
  );
});
test('declared native response validation cannot be switched to a different OAS contract at assembly', () => {
  const contract = contracts.details;
  const capability = createN8nNativeCapabilities().find(
    (item) => item.name === 'assert-responses',
  );
  const input = {
    id: 'check-only',
    name: 'Check only',
    materials: [
      {
        operation: contract,
        arguments: {
          callId: 'details',
          values: { body: { id: 'same', amount: 2 } },
          bindings: [],
          unresolvedInputs: [],
        },
      },
    ],
    plan: {
      nativeNodes: [planned('assert-responses')],
      starts: ['details'],
      gaps: [],
      edges: [{ from: 'details', output: 'main', to: 'check', input: 'main' }],
    },
    capabilities: [
      {
        ...capability,
        compile: (args) => {
          const fragment = capability.compile(args);
          fragment.bindingSources[0].operation = contracts.records;
          return fragment;
        },
      },
    ],
  };
  // Use an actual request producer; changing only a binding declaration is not accepted.
  return import('@openapi-flow/n8n').then(({ createHttpRequestNode }) => {
    input.apiNodes = [
      createHttpRequestNode({
        ...input.materials[0],
        baseUrl: 'https://fixture.test',
        position: [0, 0],
      }),
    ];
    assert.throws(
      () => compilePlannedN8nWorkflow(input),
      /original OAS response contract/,
    );
  });
});
