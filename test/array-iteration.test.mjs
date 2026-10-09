import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { validateApiBindingPlan } from '@openapi-flow/core';
import { generateApiArguments, planNativeNodes } from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import {
  materials,
  outputs,
  graphMaterials,
  capabilities,
  nativeNodes,
  names,
  requestNode,
  compileIteration,
  compileConditionalIteration,
} from './fixtures/array-iteration-fixture.mjs';

const envelope = (body, statusCode = 200, mediaType = 'application/json') => ({
  body,
  statusCode,
  headers: { 'content-type': mediaType },
});
const run = (code, globals) =>
  vm.runInNewContext(`(function(){${code}})()`, globals);
test('linked API reads require original response contracts at compilation', () => {
  assert.throws(
    () =>
      createHttpRequestNode({
        ...graphMaterials[2],
        apiNodeNames: names,
        nativeOutputSources: outputs.map((output) => ({
          ...output,
          nodeName: output.nodeId,
        })),
        itemMode: 'linked',
        position: [0, 0],
      }),
    /apiResponseContracts is missing details/,
  );
});
test('ordinary native response checks reject ambiguous items rather than taking the first', () => {
  const capability = createN8nNativeCapabilities().find(
    (item) => item.name === 'assert-responses',
  );
  const fragment = capability.compile({
    planned: {
      id: 'single-check',
      capability: capability.name,
      parameters: {
        checks: [
          {
            left: {
              source: 'response',
              nodeId: 'details',
              pointer: '/receipt',
            },
            operator: 'equals',
            right: { source: 'literal', value: 'r' },
            message: 'Receipt must match',
          },
        ],
      },
    },
    apiNodeNames: names,
    position: [0, 0],
  });
  assert.throws(
    () =>
      run(fragment.entry.config.parameters.jsCode, {
        $: () => ({
          all: () => [
            { json: envelope({ receipt: 'r' }) },
            { json: envelope({ receipt: 'r' }) },
          ],
        }),
      }),
    /unambiguous single JSON item/,
  );
});
test('linked native IF and assertions use the current item rather than the first response', () => {
  const workflow = compileConditionalIteration().workflow;
  const gate = workflow.nodes.find((node) => node.id === 'amount-gate');
  const expression = gate.parameters.conditions.conditions[0].leftValue;
  assert.equal(
    vm.runInNewContext(expression.slice(3, -2), {
      $itemIndex: 1,
      $: () => ({
        itemMatching: (index) => ({
          json: envelope({
            input: { id: 'x', amount: index === 1 ? 2 : 8 },
            receipt: 'r',
          }),
        }),
      }),
    }),
    false,
  );
  const assertion = workflow.nodes.find((node) => node.id === 'verify-item')
    .parameters.jsCode;
  const result = run(assertion, {
    $input: { all: () => [{ json: {} }, { json: {} }] },
    $: (name) => ({
      itemMatching: (index) => ({
        json: envelope(
          name === names.confirm
            ? { id: 'x', amount: index + 4 }
            : { receipt: 'r', input: { id: 'x', amount: index + 4 } },
        ),
      }),
    }),
  });
  assert.deepEqual(
    Array.from(result, (item) => item.pairedItem.item),
    [0, 1],
  );
});
test('OAS-derived array capability compiles official Split Out and independent DAG stages', () => {
  const compiled = compileIteration();
  const split = compiled.workflow.nodes.find(
    (node) => node.id === 'each-record',
  );
  assert.equal(split.type, 'n8n-nodes-base.splitOut');
  assert.equal(split.parameters.options.destinationFieldName, 'item');
  assert.equal(
    outputs[0].schema.properties.item.anyOf[0].properties.amount.type,
    'number',
  );
  validateApiBindingPlan({
    materials,
    nativeOutputs: outputs,
    plan: {
      calls: graphMaterials.map((material) => ({
        callId: material.arguments.callId,
        bindings: material.arguments.bindings,
      })),
      gaps: [],
    },
  });
});
test('linked request mode uses ancestry, not first item, numeric zip or ID matching', () => {
  const inputs = [
    { item: { id: 'repeat', amount: 8 } },
    { item: { id: 'other', amount: 2 } },
    { item: { id: 'repeat', amount: 5 } },
  ];
  const indices = [];
  const result = run(requestNode('details').entry.config.parameters.jsCode, {
    $input: { all: () => inputs.map((json) => ({ json })) },
    $: () => ({
      all: () => {
        throw Error('global selection is forbidden');
      },
      itemMatching: (index) => {
        indices.push(index);
        return { json: inputs[index] };
      },
    }),
  });
  assert.deepEqual(indices, [0, 1, 2]);
  assert.deepEqual(
    Array.from(result, (item) => JSON.parse(item.json.body.value)),
    inputs.map((item) => item.item),
  );
  assert.deepEqual(
    Array.from(result, (item) => item.pairedItem.item),
    [0, 1, 2],
  );
});
test('a following API binds both current prior response and its original array element', () => {
  const records = [
    { id: 'B', amount: 9 },
    { id: 'A', amount: 3 },
  ];
  const result = run(requestNode('confirm').entry.config.parameters.jsCode, {
    $input: { all: () => records.map(() => ({ json: {} })) },
    $: (name) => ({
      itemMatching: (index) => ({
        json:
          name === names.details
            ? envelope({
                receipt: 'receipt/' + records[index].id,
                input: records[index],
              })
            : { item: records[index] },
      }),
    }),
  });
  assert.deepEqual(
    Array.from(result, (item) => item.json.url),
    [
      'https://fixture.test/confirm/receipt%2FB',
      'https://fixture.test/confirm/receipt%2FA',
    ],
  );
  assert.deepEqual(
    Array.from(result, (item) => JSON.parse(item.json.body.value)),
    records,
  );
});
test('empty input has no fake request; missing pairing and invalid items fail without repair', () => {
  const code = requestNode('details').entry.config.parameters.jsCode;
  assert.equal(run(code, { $input: { all: () => [] } }).length, 0);
  assert.throws(
    () =>
      run(code, {
        $input: { all: () => [{ json: {} }] },
        $: () => ({
          itemMatching: () => {
            throw Error('ambiguous ancestry');
          },
        }),
      }),
    /ambiguous ancestry/,
  );
  assert.throws(
    () =>
      run(code, {
        $input: { all: () => [{ json: {} }] },
        $: () => ({
          itemMatching: () => ({ json: { item: { id: 'x', amount: '9' } } }),
        }),
      }),
    /Native output/,
  );
});
test('response extraction validates the original array, retaining mixed values and empty arrays', () => {
  const fragment = capabilities[0].compile({
    planned: nativeNodes[0],
    position: [0, 0],
    apiNodeNames: names,
  });
  const extract = (body) =>
    run(fragment.entry.config.parameters.jsCode, {
      $input: { all: () => [{ json: {} }] },
      $: () => ({ all: () => [{ json: envelope(body) }] }),
    });
  assert.equal(extract({ records: [] })[0].json.items.length, 0);
  assert.equal(
    extract({ records: [{ id: 'same', amount: 0 }] })[0].json.items[0].amount,
    0,
  );
  for (const body of [
    { records: null },
    { records: [{ id: 'x', amount: '4' }] },
    { records: [{ id: 'x', amount: 4, extra: true }] },
  ])
    assert.throws(() => extract(body), /OAS contract/);
  assert.throws(
    () =>
      run(fragment.entry.config.parameters.jsCode, {
        $input: { all: () => [{ json: {} }, { json: {} }] },
      }),
    /requires one input item/,
  );
});
test('array selection is model-owned, output schema/SDK parameters are code-owned; bound arguments skip the model', async () => {
  const result = await planNativeNodes({
    planId: 'iteration',
    scenario:
      'For every returned record, submit its unchanged values to details.',
    apiMaterials: materials,
    capabilities,
    model: {
      withStructuredOutput() {
        return { invoke: async () => ({ nativeNodes, gaps: [] }) };
      },
    },
  });
  assert.ok(result);
  const material = graphMaterials[1];
  const args = await generateApiArguments({
    operation: material.operation,
    callId: 'details',
    bindings: material.arguments.bindings,
    scenario: 'Use each record.',
    model: {
      withStructuredOutput() {
        throw Error('no literal choice remains');
      },
    },
  });
  assert.deepEqual(args.values, {});
});
