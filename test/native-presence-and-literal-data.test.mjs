import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { z } from 'zod';
import {
  createN8nNativeCapabilities,
  createLiteralDataCapability,
  resolveN8nNativePlanningFeatures,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import { createComparisonEvaluationCode } from '../packages/n8n/dist/nodes/native/comparisons/create-comparison-evaluation-code.js';

const gate = createN8nNativeCapabilities().find((c) => c.name === 'if');
const left = { source: 'response', nodeId: 'source', pointer: '/result/id' };
function evaluate(body, operator) {
  return vm.runInNewContext(
    `${createComparisonEvaluationCode('const responses={source:body};')}\ncompare(check)`,
    { body, check: { left, operator } },
  );
}

test('presence and emptiness distinguish missing, null, falsy values and empty containers without changing the original', () => {
  for (const body of [
    {},
    { result: {} },
    { result: null },
    { result: { id: null } },
    { result: { id: '' } },
    { result: { id: [] } },
    { result: { id: {} } },
    { result: { id: 0 } },
    { result: { id: false } },
    { result: { id: '0007' } },
  ]) {
    const before = globalThis.structuredClone(body);
    const value = body.result?.id;
    const exists = value !== undefined && value !== null;
    const empty =
      !exists ||
      value === '' ||
      (Array.isArray(value)
        ? !value.length
        : typeof value === 'object' && !Object.keys(value).length);
    assert.equal(evaluate(body, 'exists'), exists);
    assert.equal(evaluate(body, 'notExists'), !exists);
    assert.equal(evaluate(body, 'isEmpty'), empty);
    assert.equal(evaluate(body, 'isNotEmpty'), !empty);
    assert.deepEqual(body, before);
  }
  assert.throws(
    () =>
      vm.runInNewContext(
        `${createComparisonEvaluationCode('const responses={};')} compare(check)`,
        { check: { left, operator: 'exists' } },
      ),
    /Missing response body/,
  );
  assert.throws(
    () =>
      vm.runInNewContext(
        `${createComparisonEvaluationCode('const responses={source:{}};')} compare(check)`,
        {
          check: {
            left,
            operator: 'equals',
            right: { source: 'literal', value: '' },
          },
        },
      ),
    /Missing response pointer/,
  );
});

test('unary schema omits right and compiled official IF guard accepts absent optional parents', () => {
  const source = {
    nodeId: 'source',
    nodeName: 'Original output',
    schema: z.toJSONSchema(
      z.object({ result: z.object({ id: z.string().optional() }).optional() }),
    ),
  };
  const parameters = {
    combinator: 'and',
    conditions: [
      { left: { ...left, source: 'node-output' }, operator: 'isNotEmpty' },
    ],
  };
  assert.equal(gate.parametersSchema.safeParse(parameters).success, true);
  assert.equal(
    gate.parametersSchema.safeParse({
      ...parameters,
      conditions: [
        {
          ...parameters.conditions[0],
          right: { source: 'literal', value: null },
        },
      ],
    }).success,
    false,
  );
  const fragment = gate.compile({
    planned: { id: 'gate', capability: 'if', parameters },
    apiNodeNames: {},
    nativeOutputSources: [source],
    position: [0, 0],
  });
  const official = fragment.nodes.find((n) => n.type === 'n8n-nodes-base.if');
  assert.ok(official);
  for (const body of [
    {},
    { result: {} },
    { result: { id: '' } },
    { result: { id: '0007' } },
  ]) {
    const item = { json: body };
    const runtime = {
      $input: { all: () => [item] },
      $: () => ({ all: () => [item] }),
    };
    vm.runInNewContext(
      `(function(){${fragment.entry.config.parameters.jsCode}})()`,
      runtime,
    );
    const expression =
      official.config.parameters.conditions.conditions[0].leftValue;
    assert.equal(
      vm.runInNewContext(expression.slice(3, -2), runtime),
      Boolean(body.result?.id),
    );
  }
});

test('literal results are available without host schemas and compile typed values through Edit Fields', () => {
  assert.ok(
    resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.EmitLiteralData],
    }).planningCapabilities.some((c) => c.name === 'emit-literal-data'),
  );
  const capability = createLiteralDataCapability();
  const parameters = {
    fields: [
      { name: 'reason', value: '商品番号がありません' },
      { name: 'skipped', value: true },
      { name: 'count', value: 0 },
      { name: 'literal', value: '={{ not an expression }}' },
    ],
  };
  const fragment = capability.compile({
    planned: { id: 'skip', capability: capability.name, parameters },
    apiNodeNames: {},
    position: [0, 0],
  });
  assert.equal(fragment.entry.type, 'n8n-nodes-base.set');
  const expression = fragment.entry.config.parameters.jsonOutput;
  const result = vm.runInNewContext(expression.slice(3, -2));
  assert.equal(result.reason, parameters.fields[0].value);
  assert.equal(result.skipped, true);
  assert.equal(result.count, 0);
  assert.equal(result.literal, '={{ not an expression }}');
  assert.equal(
    capability.outputSchema(parameters).properties.skipped.const,
    true,
  );
  assert.equal(
    capability.parametersSchema.safeParse({
      fields: [
        { name: 'a', value: 1 },
        { name: 'a', value: 2 },
      ],
    }).success,
    false,
  );
});
