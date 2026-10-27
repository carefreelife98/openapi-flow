import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  assembleApiBindingPlan,
  createApiCatalog,
  describeApiCallBindingPlanning,
  resolveApiOperations,
  validateApiCallBindingPlan,
  validateApiBindingPlanningRecord,
} from '@openapi-flow/core';
import {
  planApiBindingsByCall,
  selectApiBindingSources,
  planApiCallBindings,
} from '@openapi-flow/langchain';
import { materials, bindingPlan } from './fixtures/request-binding-fixture.mjs';
import { createApiBindingSourceDecisionFixture } from './fixtures/api-binding-source-decision-fixture.mjs';
import {
  material as nativeMaterial,
  nativeOutputs,
  bindings as nativeBindings,
} from './fixtures/native-output-binding-fixture.mjs';

const scenario =
  'Use the original source ID for detail, price and stock, then send their original fields, arrays and objects to summary.';

function bindingModel(plan, inspect = async () => {}, presentation) {
  return {
    withStructuredOutput(schema, options) {
      assert.equal(options.strict, true);
      const properties = schema.properties;
      assert.equal(Object.hasOwn(properties, 'calls'), false);
      assert.equal(Object.hasOwn(properties, 'callId'), false);
      return {
        async invoke(messages, configuration) {
          const context = JSON.parse(messages[1].content);
          await inspect({ context, options, configuration, schema });
          const call = plan.calls.find(
            (call) => call.callId === context.target.nodeId,
          );
          assert.ok(
            call,
            'The test fixture must explicitly define this target',
          );
          const gaps = plan.gaps
            .filter((gap) => gap.callId === call.callId)
            .map(({ targetPointer, description }) => ({
              targetPointer,
              description,
            }));
          const reason = Object.hasOwn(properties, 'reason')
            ? (presentation ?? {
                reason: `Use only the declared dependencies for ${call.callId}.`,
              })
            : {};
          if (options.name === 'select_api_binding_sources') {
            assert.equal(Object.hasOwn(context, 'materials'), false);
            assert.equal(
              context.sourceCandidates.some(
                (source) => source.nodeId === call.callId,
              ),
              false,
            );
            assert.equal(
              JSON.stringify(context.sourceCandidates).includes('"responses"'),
              false,
            );
            return createApiBindingSourceDecisionFixture({
              sourceNodeIds: [
                ...new Set(
                  call.bindings.map((binding) => binding.sourceNodeId),
                ),
              ],
              gaps,
              ...reason,
            });
          }
          assert.equal(options.name, 'plan_api_call_bindings');
          const wanted = new Set(
            call.bindings.map((binding) => binding.sourceNodeId),
          );
          assert.deepEqual(
            new Set(
              [...context.apiSources, ...(context.nativeSources ?? [])].map(
                (source) => source.nodeId,
              ),
            ),
            wanted,
          );
          return {
            bindings: call.bindings.map(
              ({ targetPointer, sourceNodeId, sourcePointer }) => ({
                targetPointer,
                sourceNodeId,
                sourcePointer,
              }),
            ),
            gaps: [],
            ...reason,
          };
        },
      };
    },
  };
}

test('optional binding display failures do not reject executable per-call plans or their aggregate record', async () => {
  for (const reason of [
    undefined,
    '',
    ' ',
    false,
    7,
    null,
    [],
    { text: 'display only' },
  ]) {
    const plan = await planApiBindingsByCall({
      scenario,
      materials,
      concurrency: 2,
      includeExplanations: true,
      model: bindingModel(
        bindingPlan,
        async ({ schema }) => {
          assert.equal(schema.properties.reason.type, 'string');
          assert(schema.required.includes('reason'));
        },
        reason === undefined ? {} : { reason },
      ),
    });
    assert.deepEqual(plan.calls, bindingPlan.calls);
    assert.deepEqual(plan.gaps, []);
    assert.equal(plan.bindingPlanning.calls.length, bindingPlan.calls.length);
    for (const call of plan.bindingPlanning.calls)
      if (call.bindings.length > 0)
        assert.equal(Object.hasOwn(call, 'reason'), false);
    validateApiBindingPlanningRecord({
      scenario,
      materials,
      plan,
      record: plan.bindingPlanning,
    });
  }
});

test('independent required inputs leave source lists and gaps to code, without a field-planning model call', async () => {
  const input = {
    scenario:
      'Retrieve the detail. Its independent request value will be supplied later.',
    materials,
    callId: 'detail',
  };
  const detail = materials.find((material) => material.callId === 'detail');
  assert.ok(
    detail.operation.effective.parameters.some(
      (item) => item.name === 'id' && item.required,
    ),
  );
  let calls = 0;
  const sources = await selectApiBindingSources({
    ...input,
    model: {
      withStructuredOutput(schema, options) {
        assert.equal(options.name, 'select_api_binding_sources');
        const json = schema;
        assert.deepEqual(Object.keys(json.properties), ['decision']);
        return {
          invoke: async () => {
            calls++;
            return { decision: { kind: 'independent-inputs' } };
          },
        };
      },
    },
  });
  assert.deepEqual(sources.sourceNodeIds, []);
  assert.deepEqual(sources.gaps, []);
  const result = await planApiCallBindings({
    ...input,
    sources,
    model: {
      withStructuredOutput() {
        throw new Error('Independent inputs must not invoke field mapping');
      },
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.gaps, []);
});

test('contradictory independent extras and the old flat output fail without stripping or repairing model fields', async () => {
  const gap = {
    targetPointer: '/path/id',
    description: 'An absent independent literal is not a producer gap.',
  };
  for (const output of [
    { sourceNodeIds: [], gaps: [gap] },
    { decision: { kind: 'independent-inputs', gaps: [gap] } },
    { decision: { kind: 'independent-inputs', sourceNodeIds: [] } },
    { decision: { kind: 'selected-response-sources', sourceNodeIds: [] } },
    { decision: { kind: 'missing-response-sources', gaps: [] } },
  ]) {
    const before = globalThis.structuredClone(output);
    let calls = 0;
    await assert.rejects(
      selectApiBindingSources({
        scenario: 'Retrieve the detail independently.',
        materials,
        callId: 'detail',
        model: {
          withStructuredOutput() {
            return {
              invoke: async () => {
                calls++;
                return output;
              },
            };
          },
        },
      }),
      (error) =>
        error.diagnostic.code === 'MODEL_OUTPUT_INVALID' &&
        error.diagnostic.stage === 'model-output',
    );
    assert.equal(calls, 1);
    assert.deepEqual(output, before);
  }
});

test('partially missing response dependencies retain both original provided sources and genuine missing dependencies', async () => {
  const gap = {
    targetPointer: '/body/stock',
    description: 'The explicitly requested stock producer is absent.',
  };
  const sources = await selectApiBindingSources({
    scenario: 'Use the detail ID and stock producer response in summary.',
    materials: materials.filter((item) => item.callId !== 'stock'),
    callId: 'summary',
    includeExplanations: true,
    model: {
      withStructuredOutput() {
        return {
          invoke: async () => ({
            decision: {
              kind: 'partially-missing-response-sources',
              sourceNodeIds: ['detail'],
              gaps: [gap],
            },
            reason:
              'Retain the provided detail source and report the requested absent producer.',
          }),
        };
      },
    },
  });
  assert.deepEqual(sources.sourceNodeIds, ['detail']);
  assert.deepEqual(sources.gaps, [gap]);
  assert.match(sources.reason, /Retain/);
});

test('an empty producer inventory excludes provided-source decisions rather than inventing candidates or empty enums', async () => {
  const input = {
    scenario: 'Retrieve the detail independently.',
    materials: materials.filter((item) => item.callId === 'detail'),
    callId: 'detail',
  };
  let schema;
  const sources = await selectApiBindingSources({
    ...input,
    model: {
      withStructuredOutput(value) {
        schema = value;
        return {
          invoke: async () => ({ decision: { kind: 'independent-inputs' } }),
        };
      },
    },
  });
  assert.deepEqual(sources.sourceNodeIds, []);
  assert.equal(
    JSON.stringify(schema).includes('selected-response-sources'),
    false,
  );
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(
    validate({
      decision: {
        kind: 'selected-response-sources',
        sourceNodeIds: ['detail'],
      },
    }),
    false,
  );
  assert.equal(
    validate({
      decision: {
        kind: 'missing-response-sources',
        gaps: [
          {
            targetPointer: '/path/id',
            description: 'An explicitly requested unavailable source.',
          },
        ],
      },
    }),
    true,
  );
});

test('per-call source discovery hydrates only selected original contracts; code owns identities and whole-plan evidence', async () => {
  const original = globalThis.structuredClone(materials);
  const completed = [];
  const invocations = [];
  const plan = await planApiBindingsByCall({
    scenario,
    materials,
    concurrency: 2,
    includeExplanations: true,
    onCallPlanned: (result) => completed.push(result),
    model: bindingModel(bindingPlan, async ({ context, options }) => {
      invocations.push([context.target.nodeId, options.name]);
      if (options.name === 'plan_api_call_bindings')
        for (const source of context.apiSources)
          assert.deepEqual(
            source.responses,
            materials.find((item) => item.callId === source.nodeId).operation
              .operation.responses,
          );
    }),
  });
  assert.deepEqual(plan.calls, bindingPlan.calls);
  assert.deepEqual(plan.gaps, []);
  assert.equal(completed.length, materials.length);
  assert.equal(invocations.length, 8);
  assert.equal(
    invocations.some(([id]) => id === 'source'),
    false,
  );
  validateApiBindingPlanningRecord({
    scenario,
    materials,
    plan,
    record: plan.bindingPlanning,
  });
  assert.deepEqual(materials, original);
});

test('explicit source and field stages can be independently checkpointed, with strict source snapshots and no extra literal call', async () => {
  const input = {
    scenario,
    materials,
    callId: 'detail',
    model: bindingModel(bindingPlan),
  };
  const sources = await selectApiBindingSources(input);
  const result = await planApiCallBindings({ ...input, sources });
  validateApiCallBindingPlan({ ...input, result });
  assert.deepEqual(
    result.bindings,
    bindingPlan.calls.find((call) => call.callId === 'detail').bindings,
  );
  for (const changed of [
    { ...input, scenario: 'Changed scenario' },
    { ...input, callId: 'price' },
    {
      ...input,
      materials: materials.map((material) => ({
        ...material,
        purpose: 'Changed role',
      })),
    },
  ]) {
    let invoked = false;
    await assert.rejects(
      planApiCallBindings({
        ...changed,
        sources,
        model: {
          withStructuredOutput() {
            invoked = true;
            throw new Error('must not run');
          },
        },
      }),
    );
    assert.equal(invoked, false);
  }
  assert.throws(() =>
    validateApiCallBindingPlan({
      ...input,
      result: { ...result, fingerprint: 'changed' },
    }),
  );
});

test('a failed call preserves completed validated results; explicit resume does not repeat them or infer a new snapshot', async () => {
  const checkpoints = [];
  const cause = new Error('source provider failed');
  await assert.rejects(
    planApiBindingsByCall({
      scenario,
      materials,
      concurrency: 1,
      onCallPlanned: (result) => checkpoints.push(result),
      model: bindingModel(bindingPlan, async ({ context, options }) => {
        if (
          context.target.nodeId === 'price' &&
          options.name === 'plan_api_call_bindings'
        )
          throw cause;
      }),
    }),
    (error) =>
      error.cause === cause &&
      error.diagnostic.operation === 'planApiCallBindings',
  );
  assert.deepEqual(
    checkpoints.map((result) => result.callId),
    ['source', 'detail'],
  );
  const resumed = [];
  const plan = await planApiBindingsByCall({
    scenario,
    materials,
    concurrency: 2,
    completedCalls: checkpoints,
    model: bindingModel(bindingPlan, async ({ context }) =>
      resumed.push(context.target.nodeId),
    ),
  });
  assert.deepEqual(plan, bindingPlan);
  assert.ok(resumed.every((id) => !['source', 'detail'].includes(id)));
  for (const extra of [
    { scenario: 'Changed request' },
    { completedCalls: [checkpoints[0], checkpoints[0]] },
  ]) {
    let invoked = false;
    await assert.rejects(
      planApiBindingsByCall({
        scenario,
        materials,
        concurrency: 1,
        completedCalls: checkpoints,
        ...extra,
        model: {
          withStructuredOutput() {
            invoked = true;
            throw new Error('must not run');
          },
        },
      }),
    );
    assert.equal(invoked, false);
  }
});

test('all selected calls remain represented, including independent no-binding decisions and original binding gaps', async () => {
  const proposal = {
    calls: materials.map(({ callId }) => ({ callId, bindings: [] })),
    gaps: [
      {
        callId: 'detail',
        targetPointer: '/path/id',
        description: 'The explicitly requested producer is unavailable.',
      },
    ],
  };
  let fieldCalls = 0;
  const results = [];
  const actual = await planApiBindingsByCall({
    scenario,
    materials,
    concurrency: 3,
    onCallPlanned: (result) => results.push(result),
    model: bindingModel(proposal, async ({ options }) => {
      if (options.name === 'plan_api_call_bindings') fieldCalls++;
    }),
  });
  assert.deepEqual(actual, proposal);
  assert.equal(fieldCalls, 0);
  assert.throws(
    () =>
      assembleApiBindingPlan({
        scenario,
        materials,
        results: results.slice(1),
      }),
    (error) => error.diagnostic.code === 'API_BINDING_CALL_COVERAGE_MISMATCH',
  );
});

test('native output binding keeps the unchanged native contract and cannot hydrate an invented API source', async () => {
  const input = {
    scenario: 'Use the declared native ID in the detail request.',
    materials: [nativeMaterial],
    nativeOutputs,
  };
  const plan = {
    calls: [{ callId: nativeMaterial.callId, bindings: nativeBindings }],
    gaps: [],
  };
  const result = await planApiBindingsByCall({
    ...input,
    concurrency: 1,
    model: bindingModel(plan, async ({ context, options }) => {
      if (options.name === 'plan_api_call_bindings') {
        assert.deepEqual(context.apiSources, []);
        assert.deepEqual(
          context.nativeSources,
          nativeOutputs.filter((output) =>
            nativeBindings.some(
              (binding) => binding.sourceNodeId === output.nodeId,
            ),
          ),
        );
      }
    }),
  });
  assert.deepEqual(result, plan);
});

test('global cycle checks remain mandatory across individually valid call decisions', async () => {
  const cyclic = globalThis.structuredClone(bindingPlan);
  cyclic.calls.find(
    (call) => call.callId === 'detail',
  ).bindings[0].sourceNodeId = 'summary';
  await assert.rejects(
    planApiBindingsByCall({
      scenario,
      materials,
      concurrency: 2,
      model: bindingModel(cyclic),
    }),
    (error) => error.diagnostic.code === 'API_BINDING_CYCLE',
  );
});

test('source identities cannot be guessed, duplicated, self-referenced or silently broadened during field planning', async () => {
  for (const ids of [['detail'], ['absent'], ['source', 'source']]) {
    await assert.rejects(
      selectApiBindingSources({
        scenario,
        materials,
        callId: 'detail',
        model: {
          withStructuredOutput() {
            return {
              invoke: async () => ({
                decision: {
                  kind: 'selected-response-sources',
                  sourceNodeIds: ids,
                },
              }),
            };
          },
        },
      }),
    );
  }
  const sources = await selectApiBindingSources({
    scenario,
    materials,
    callId: 'detail',
    model: bindingModel(bindingPlan),
  });
  for (const binding of [
    { targetPointer: '/path/id', sourceNodeId: 'price', sourcePointer: '/id' },
    {
      targetPointer: '/path/id',
      sourceNodeId: 'source',
      sourcePointer: '/stock',
    },
    {
      targetPointer: '/path/not-declared',
      sourceNodeId: 'source',
      sourcePointer: '/id',
    },
  ])
    await assert.rejects(
      planApiCallBindings({
        scenario,
        materials,
        callId: 'detail',
        sources,
        model: {
          withStructuredOutput() {
            return { invoke: async () => ({ bindings: [binding], gaps: [] }) };
          },
        },
      }),
    );
});

test('cancellation reaches the runnable, stops field planning and never creates a partial whole plan', async () => {
  const controller = new globalThis.AbortController();
  let requests = 0;
  const original = new globalThis.DOMException(
    'cancelled by caller',
    'AbortError',
  );
  await assert.rejects(
    planApiBindingsByCall({
      scenario,
      materials,
      concurrency: 1,
      signal: controller.signal,
      model: bindingModel(bindingPlan, async ({ configuration }) => {
        requests++;
        assert.equal(configuration.signal, controller.signal);
        controller.abort(original);
      }),
    }),
    (error) => error === original,
  );
  assert.equal(requests, 1);
});

test('170 distinct APIs across two OAS use bounded workers and local outputs rather than a regenerated call list', async () => {
  const response = {
    200: {
      description: 'Original ID',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
    },
  };
  const sources = ['first', 'second'].map((id) => ({
    id,
    spec: {
      openapi: '3.1.0',
      info: { title: id, version: '1' },
      paths: Object.fromEntries(
        Array.from({ length: 85 }, (_, index) => [
          `/item-${index}/{id}`,
          {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: response,
            },
          },
        ]),
      ),
    },
  }));
  const catalog = await createApiCatalog(sources);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  const large = operations.map((operation, index) => ({
    callId: `call-${index}`,
    operation,
  }));
  const expected = {
    calls: large.map(({ callId }) => ({
      callId,
      bindings:
        callId === 'call-0'
          ? []
          : [
              {
                kind: 'node-output',
                targetPointer: '/path/id',
                sourceNodeId: 'call-0',
                sourcePointer: '/id',
              },
            ],
    })),
    gaps: [],
  };
  let active = 0,
    maximum = 0,
    invocations = 0;
  const actual = await planApiBindingsByCall({
    scenario:
      'Use independent root input and preserve the root response ID for all dependent calls.',
    materials: [...large].reverse(),
    concurrency: 3,
    model: bindingModel(expected, async ({ context }) => {
      active++;
      maximum = Math.max(maximum, active);
      invocations++;
      assert.equal(
        context.sourceCandidates?.length ?? context.apiSources.length,
        context.sourceCandidates ? 169 : 1,
      );
      await setTimeout(1);
      active--;
    }),
  });
  assert.deepEqual(actual.calls, [...expected.calls].reverse());
  assert.deepEqual(actual.gaps, []);
  assert.equal(invocations, 339);
  assert.ok(maximum > 1 && maximum <= 3);
  assert.equal(actual.calls.length, 170);
  assert.equal(new Set(actual.calls.map((call) => call.callId)).size, 170);
  assert.equal(
    describeApiCallBindingPlanning({
      scenario,
      materials: large,
      callId: 'call-1',
    }).sourceCandidates.length,
    169,
  );
});
