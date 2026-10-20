import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { findSingletonApiResponses } from '../packages/n8n/dist/workflow/find-singleton-api-responses.js';
import {
  singletonResponseOperation as operation,
  singletonResponseBody,
  singletonResponseCheck as check,
  compileSingletonResponseWorkflow as compileGraph,
} from './fixtures/native-singleton-response-fixture.mjs';

const envelope = {
  json: {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: singletonResponseBody,
  },
};
function run(code, count = 1, source = envelope) {
  return vm.runInNewContext(`(function(){${code}})()`, {
    $input: { all: () => [{ json: {} }, { json: {} }] },
    $: () => ({
      all: () => Array.from({ length: count }, () => source),
      itemMatching: () => {
        throw new Error('Independent branch has no item ancestry');
      },
    }),
  });
}

test('public compiler proves independent API singleton responses before an append, retaining both strict OAS checks', () => {
  const workflow = compileGraph();
  const code = workflow.nodes.find((node) => node.id === 'check').parameters
    .jsCode;
  const output = run(code);
  assert.equal(output.length, 2);
  assert.equal(output[0].json.assertionCount, 2);
  assert.equal(output[1].pairedItem.item, 1);
  for (const count of [0, 2])
    assert.throws(
      () => run(code, count),
      /requires an unambiguous single JSON item/,
    );
  assert.throws(
    () =>
      run(code, 1, {
        json: {
          ...envelope.json,
          body: { receipt: 42, input: { id: 'same', amount: 2 } },
        },
      }),
    /OAS contract/,
  );
  assert.throws(
    () =>
      run(code, 1, {
        json: {
          ...envelope.json,
          body: { receipt: 'r', input: { id: 'same', amount: 3 } },
        },
      }),
    /Amount must match/,
  );
});

test('IF guard and expression use the same graph-proven singleton policy', () => {
  const workflow = compileGraph('if');
  const guard = workflow.nodes.find(
    (node) => node.id === 'check-response-contract',
  );
  assert.equal(run(guard.parameters.jsCode).length, 2);
  const gate = workflow.nodes.find((node) => node.id === 'check');
  for (const condition of gate.parameters.conditions.conditions) {
    const expression = condition.leftValue.slice(3, -2);
    assert.equal(
      vm.runInNewContext(expression, {
        $itemIndex: 1,
        $: () => ({
          all: () => [envelope],
          itemMatching: () => {
            throw new Error('No item ancestry');
          },
        }),
      }),
      true,
    );
    assert.throws(
      () =>
        vm.runInNewContext(expression, {
          $itemIndex: 0,
          $: () => ({ all: () => [] }),
        }),
      /unambiguous single JSON item/,
    );
  }
});

test('singleton proof does not infer through expansion, native streams, multi-input or undeclared entry nodes', () => {
  const apiNodes = [
    'root',
    'chain',
    'expanded',
    'multi',
    'not-start',
    'opaque',
  ].map((nodeId) => ({
    nodeId,
    preservesInputItems: nodeId !== 'opaque',
  }));
  assert.deepEqual(
    findSingletonApiResponses({
      apiNodes,
      plan: {
        starts: ['root', 'opaque'],
        edges: [
          { from: 'root', to: 'chain' },
          { from: 'split', to: 'expanded' },
          { from: 'root', to: 'multi' },
          { from: 'chain', to: 'multi' },
        ],
      },
    }),
    ['root', 'chain'],
  );
});

test('unproven standalone linked responses never recover through a singleton all-items result', () => {
  const capability = createN8nNativeCapabilities({ itemMode: 'linked' }).find(
    (item) => item.name === 'assert-responses',
  );
  const compiled = capability.compile({
    planned: {
      id: 'check',
      capability: 'assert-responses',
      parameters: { checks: [check('left')] },
    },
    apiNodeNames: { left: 'Request left' },
    apiResponseContracts: { left: operation },
    position: [0, 0],
  });
  assert.throws(
    () => run(compiled.entry.config.parameters.jsCode),
    /Independent branch has no item ancestry/,
  );
});
