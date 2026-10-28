import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createWorkflowPlanningCapabilities,
  validateNativeOutputContracts,
  createNativeObjectEntrySchema,
  resolveNativeMaterialSnapshot,
} from '@openapi-flow/core';
import {
  createResponseEvaluationCapability,
  resolveN8nNativePlanningFeatures,
  responseEvaluationParametersSchema,
} from '@openapi-flow/n8n';
import {
  evaluationParameters as parameters,
  evaluationBody as body,
  createEvaluationOperation,
} from './fixtures/response-evaluation-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const operation = await createEvaluationOperation();
const sources = {
  apiMaterials: [{ callId: 'snapshot', operation }],
  nativeOutputs: [],
};
const outcome = (operator, expected, status) => ({
  operator,
  expected,
  status,
});

function compile(value = parameters, itemMode) {
  const capability = createResponseEvaluationCapability({ sources, itemMode });
  return {
    capability,
    fragment: capability.compile({
      planned: {
        id: 'evaluate',
        capability: capability.name,
        parameters: value,
      },
      apiNodeNames: { snapshot: 'Original HTTP response' },
      apiResponseContracts: { snapshot: operation },
      position: [0, 0],
    }),
  };
}
function execute(value, parametersValue = parameters, itemMode) {
  const { capability, fragment } = compile(parametersValue, itemMode);
  const inputs = itemMode === 'linked' ? value : [value];
  const rows = inputs.map((entry) => ({
    json: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: entry,
    },
  }));
  const output = vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => rows },
      $: (name) => {
        assert.equal(name, 'Original HTTP response');
        return { all: () => rows, itemMatching: (index) => rows[index] };
      },
    },
  );
  const schema = capability.outputSchema(parametersValue);
  validateNativeOutputContracts([{ nodeId: 'report', schema }]);
  const validate = new Ajv2020({ strict: false }).compile(schema);
  for (const entry of output)
    assert.equal(validate(entry.json), true, JSON.stringify(validate.errors));
  return JSON.parse(JSON.stringify(output));
}

test('evaluation reports all outcomes and exact source pointers while preserving original JSON values', () => {
  const original = globalThis.structuredClone(body);
  const [result] = execute(body);
  assert.deepEqual(result.json.summary, {
    normal: 1,
    warning: 2,
    abnormal: 1,
    undetermined: 1,
  });
  assert.equal(result.json.checks[2].source.pointer, '/pools/a~1b~0c/waiting');
  assert.deepEqual(result.json.checks[3].actualValue, body.records);
  assert.equal(result.json.checks[3].measuredValue, 1);
  assert.deepEqual(
    result.json.checks[0].policy.cases,
    parameters.checks[0].cases,
  );
  assert.deepEqual(result.pairedItem, [{ item: 0 }]);
  assert.deepEqual(body, original);
});

test('missing optional values, empty collections and unassessed observations remain undetermined without invented values', () => {
  const value = {
    ...body,
    state: 'done',
    pools: { optional: {} },
    records: [],
  };
  const [result] = execute(value);
  const missing = result.json.checks[1];
  assert.equal(missing.reason, 'missing-value');
  assert.equal(missing.status, 'undetermined');
  assert.equal(Object.hasOwn(missing, 'actualValue'), false);
  assert.equal(result.json.checks[2].measuredValue, 0);
  assert.equal(result.json.checks[2].status, 'normal');
  const [empty] = execute({ ...value, pools: {} });
  assert.equal(empty.json.checks[1].reason, 'empty-collection');
  assert.equal(empty.json.checks[1].status, 'undetermined');
  assert.equal(empty.json.checks[3].reason, 'no-rule');
});

test('adverse and unmatched results complete, while invalid OAS bodies remain technical failures', () => {
  const [aborted] = execute({ ...body, state: 'aborted' });
  assert.equal(aborted.json.checks[0].status, 'abnormal');
  const [unmatched] = execute({ ...body, pools: { counter: { waiting: -1 } } });
  assert.equal(unmatched.json.checks[1].status, 'undetermined');
  assert.equal(unmatched.json.checks[1].reason, 'unmatched');
  assert.throws(
    () => execute({ ...body, state: 'invented' }),
    /does not match its OAS contract/,
  );
  assert.throws(
    () => execute({ ...body, pools: { primary: { waiting: '0' } } }),
    /does not match its OAS contract/,
  );
});

test('linked evaluation keeps one result per input with exact item ancestry', () => {
  const output = execute(
    [body, { ...body, state: 'done', records: [] }],
    parameters,
    'linked',
  );
  assert.equal(output.length, 2);
  assert.equal(output[0].json.checks[0].status, 'warning');
  assert.equal(output[1].json.checks[0].status, 'normal');
  assert.deepEqual(
    output.map((entry) => entry.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
});

test('actual native outputs, local references and object-entry projection retain their contracts', () => {
  const schema = {
    $defs: {
      metrics: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { count: { type: 'integer' } },
          required: ['count'],
          additionalProperties: false,
        },
      },
    },
    type: 'object',
    properties: { metrics: { $ref: '#/$defs/metrics' } },
    required: ['metrics'],
    additionalProperties: false,
  };
  const native = { nodeId: 'metrics', schema };
  const entries = createNativeObjectEntrySchema(native, '/metrics');
  const validate = new Ajv2020({ strict: false }).compile(entries);
  assert.equal(validate({ count: 1 }), true);
  assert.equal(validate({ count: '1' }), false);
  const capability = createResponseEvaluationCapability({
    sources: { apiMaterials: [], nativeOutputs: [native] },
  });
  const params = {
    checks: [
      {
        kind: 'compare',
        source: {
          source: 'node-output',
          nodeId: native.nodeId,
          pointer: '/metrics',
        },
        scope: 'object-values',
        valuePointer: '/count',
        measurement: 'value',
        cases: [outcome('equals', 1, 'normal')],
        otherwise: 'abnormal',
      },
    ],
  };
  const fragment = capability.compile({
    planned: {
      id: 'native-report',
      capability: capability.name,
      parameters: params,
    },
    apiNodeNames: {},
    nativeOutputSources: [{ ...native, nodeName: 'Metrics producer' }],
    position: [0, 0],
  });
  const json = { metrics: { x: { count: 1 }, y: { count: 2 } } };
  const result = vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    { $input: { all: () => [{ json }] }, $: () => ({ all: () => [{ json }] }) },
  );
  assert.equal(result[0].json.summary.normal, 1);
  assert.equal(result[0].json.summary.abnormal, 1);
  assert.equal(result[0].json.checks[1].source.pointer, '/metrics/y/count');
});

test('planning and material binding expose only actual identities and preserve the factory receipt', () => {
  const registry = resolveN8nNativePlanningFeatures();
  const definition = registry.planningCapabilities.find(
    (capability) => capability.name === 'evaluate-responses',
  );
  const [planning] = createWorkflowPlanningCapabilities({
    capabilities: [definition],
    apiCallIds: ['snapshot'],
    nativeOutputs: [],
  });
  assert.equal(planning.parametersSchema.safeParse(parameters).success, true);
  const invented = globalThis.structuredClone(parameters);
  invented.checks[0].source.nodeId = 'future';
  assert.equal(planning.parametersSchema.safeParse(invented).success, false);
  const snapshot = resolveNativeMaterialSnapshot({
    ...sources,
    nativeNodes: [{ id: 'report', capability: definition.name, parameters }],
    capabilities: [definition],
    deferredNodeIds: [],
  });
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.outputs[0].nodeId, 'report');
  assert.equal(
    responseEvaluationParametersSchema.safeParse({ checks: [] }).success,
    false,
  );
  const invalidPointer = globalThis.structuredClone(parameters);
  invalidPointer.checks[0].valuePointer = '/not-declared';
  assert.throws(
    () => compile(invalidPointer).capability.outputSchema(invalidPointer),
    /no declared value/,
  );
  const wrongMeasurement = globalThis.structuredClone(parameters);
  wrongMeasurement.checks[0].measurement = 'array-length';
  assert.throws(
    () => compile(wrongMeasurement),
    /cannot measure a declared non-array/,
  );
});
