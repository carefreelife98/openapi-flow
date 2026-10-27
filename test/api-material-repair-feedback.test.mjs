import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import {
  describeWorkflowConnectionApiRepair,
  describeWorkflowConnectionGoals,
  describeWorkflowConnectionPlanning,
  describeWorkflowConnectionMaterialRepairWork,
  applyWorkflowConnectionMaterialRepair,
  applyWorkflowConnectionMaterialRepairWork,
  selectWorkflowConnectionArgumentValues,
} from '@openapi-flow/core';
import {
  selectApiBindingSources,
  planApiCallBindings,
  generateApiArguments,
  createApiArgumentRejection,
} from '@openapi-flow/langchain';
import {
  initialConnectionRecoveryFixture,
  recoveryQueueModel,
} from './fixtures/initial-connection-recovery-fixture.mjs';

function fixture() {
  const original = initialConnectionRecoveryFixture();
  const { broken, receipt, replacement } = original;
  const bindingInput = {
    scenario: broken.scenario,
    callId: 'price',
    materials: broken.materials.map((item) => ({
      callId: item.arguments.callId,
      operation: item.operation,
      purpose: item.purpose,
      requestMediaType: item.arguments.requestMediaType,
    })),
    nativeOutputs:
      describeWorkflowConnectionPlanning(broken).sources.nativeOutputs,
  };
  return {
    ...original,
    bindingInput,
    repair: { source: broken, request: receipt },
    proposedBindings: replacement.apiArguments[0].bindings.map(
      ({ targetPointer, sourceNodeId, sourcePointer }) => ({
        targetPointer,
        sourceNodeId,
        sourcePointer,
      }),
    ),
  };
}

function literalFixture() {
  const result = fixture();
  result.broken.scenario += ' Use the price identifier "request-only-7".';
  result.receipt.sourceFingerprint = describeWorkflowConnectionGoals(
    result.broken,
  ).sourceFingerprint;
  result.replacement.apiArguments[0].bindings =
    result.replacement.apiArguments[0].bindings.filter(
      (binding) => binding.targetPointer !== '/query/id',
    );
  const work = describeWorkflowConnectionMaterialRepairWork({
    source: result.broken,
    request: result.receipt,
    replacement: result.replacement,
  });
  return {
    ...result,
    work,
    literalInput: work.apiArgumentTasks[0].input,
    repair: { ...result.repair, pendingReplacement: result.replacement },
  };
}

function literalOutput(value) {
  return {
    literalInputs: {
      state: 'provided',
      values: { query: { id: value } },
      literalSources: [
        {
          targetPointer: '/query/id',
          sourceFormat: 'json',
          sourceText: JSON.stringify(value),
        },
      ],
    },
    requestedInputs: ['/query/id'],
  };
}

test('Core derives feedback only for the exact requested stage, actual OAS, role, inventory and original scenario', () => {
  const { repair, bindingInput } = fixture();
  const before = globalThis.structuredClone({
    ...repair.source,
    capabilities: undefined,
  });
  const description = describeWorkflowConnectionApiRepair({
    stage: 'api-bindings',
    repair,
    planning: bindingInput,
  });
  assert.deepEqual(description.target, {
    stage: 'api-bindings',
    nodeId: 'price',
  });
  assert.deepEqual(description.requirements, repair.source.requirements);
  assert.equal(description.reason, repair.request.request.reason);
  assert.ok(description.previousBindings.length);
  for (const planning of [
    { ...bindingInput, callId: 'detail' },
    { ...bindingInput, scenario: bindingInput.scenario + ' altered' },
    { ...bindingInput, materials: bindingInput.materials.slice(1) },
    {
      ...bindingInput,
      nativeOutputs: [{ nodeId: 'invented', schema: { type: 'string' } }],
    },
    {
      ...bindingInput,
      materials: bindingInput.materials.map((material) =>
        material.callId === 'price'
          ? { ...material, purpose: 'another role' }
          : material,
      ),
    },
    {
      ...bindingInput,
      materials: bindingInput.materials.map((material) =>
        material.callId === 'price'
          ? {
              ...material,
              operation: {
                ...material.operation,
                operation: {
                  ...material.operation.operation,
                  summary: 'changed contract',
                },
              },
            }
          : material,
      ),
    },
  ])
    assert.throws(() =>
      describeWorkflowConnectionApiRepair({
        stage: 'api-bindings',
        repair,
        planning,
      }),
    );
  for (const changed of [
    null,
    {},
    { source: repair.source },
    {
      ...repair,
      request: { ...repair.request, sourceFingerprint: 'a'.repeat(64) },
    },
    {
      ...repair,
      request: {
        ...repair.request,
        request: { ...repair.request.request, factIds: ['unknown'] },
      },
    },
    {
      ...repair,
      request: {
        ...repair.request,
        request: { ...repair.request.request, extra: true },
      },
    },
    { ...repair, pendingReplacement: { apiArguments: [], nativeNodes: [] } },
  ])
    assert.throws(() =>
      describeWorkflowConnectionApiRepair({
        stage: 'api-bindings',
        repair: changed,
        planning: bindingInput,
      }),
    );
  description.requirements[0].text = 'changed returned copy';
  description.previousBindings[0].sourceNodeId = 'changed returned copy';
  assert.deepEqual({ ...repair.source, capabilities: undefined }, before);
});

test('selection and field mapping receive separate repair feedback and return a Core-validated replacement without altering the scenario', async () => {
  const { repair, bindingInput, proposedBindings, replacement } = fixture();
  const sourceNodeIds = [
    ...new Set(proposedBindings.map((binding) => binding.sourceNodeId)),
  ];
  const model = recoveryQueueModel([
    { decision: { kind: 'selected-response-sources', sourceNodeIds } },
    { bindings: proposedBindings, gaps: [] },
  ]);
  const sources = await selectApiBindingSources({
    ...bindingInput,
    materialRepair: repair,
    model,
  });
  const result = await planApiCallBindings({
    ...bindingInput,
    materialRepair: repair,
    model,
    sources,
  });
  assert.equal(model.requests.length, 2);
  for (const request of model.requests) {
    assert.equal(request.payload.scenario, bindingInput.scenario);
    assert.equal(
      request.payload.materialRepair.reason,
      repair.request.request.reason,
    );
    assert.ok(request.payload.materialRepair.previousBindings.length);
  }
  const adopted = applyWorkflowConnectionMaterialRepair({
    ...repair,
    replacement: {
      ...replacement,
      apiArguments: [
        { ...replacement.apiArguments[0], bindings: result.bindings },
      ],
    },
  });
  assert.deepEqual(
    adopted.source.materials.find((item) => item.arguments.callId === 'price')
      .arguments.bindings,
    result.bindings,
  );
  assert.equal(
    repair.source.materials.find((item) => item.arguments.callId === 'price')
      .arguments.bindings[0].sourceNodeId,
    'detail',
  );
});

test('invalid feedback fails before a model call, including deterministic empty-input paths', async () => {
  const { repair, bindingInput } = fixture();
  const model = recoveryQueueModel([]);
  await assert.rejects(
    selectApiBindingSources({
      ...bindingInput,
      callId: 'source',
      materialRepair: repair,
      model,
    }),
  );
  await assert.rejects(
    generateApiArguments({
      operation: bindingInput.materials[0].operation,
      callId: 'source',
      scenario: repair.source.scenario,
      bindings: [],
      materialRepair: repair,
      model,
    }),
  );
  assert.equal(model.requests.length, 0);
});

test('independent source decisions still avoid a field-mapping model call when repair feedback is valid', async () => {
  const { repair, bindingInput } = fixture();
  const model = recoveryQueueModel([
    { decision: { kind: 'independent-inputs' } },
  ]);
  const sources = await selectApiBindingSources({
    ...bindingInput,
    materialRepair: repair,
    model,
  });
  const result = await planApiCallBindings({
    ...bindingInput,
    materialRepair: repair,
    model,
    sources,
  });
  assert.deepEqual(result.bindings, []);
  assert.equal(model.requests.length, 1);
});

test('a fully bound authorized argument stage stays code-only even with repair feedback', async () => {
  const { repair } = fixture();
  repair.request.request.targets.push({
    stage: 'api-arguments',
    nodeId: 'price',
  });
  const material = repair.source.materials.find(
    (item) => item.arguments.callId === 'price',
  );
  const model = recoveryQueueModel([]);
  const result = await generateApiArguments({
    callId: 'price',
    scenario: repair.source.scenario,
    operation: material.operation,
    purpose: material.purpose,
    bindings: material.arguments.bindings,
    materialRepair: repair,
    model,
  });
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.bindings, material.arguments.bindings);
  assert.equal(model.requests.length, 0);
});

test('source selection rejects repair feedback mutated while the model was running', async () => {
  const { repair, bindingInput } = fixture();
  const model = recoveryQueueModel(
    [{ decision: { kind: 'independent-inputs' } }],
    () => {
      repair.request.request.reason = 'another reason';
    },
  );
  await assert.rejects(
    selectApiBindingSources({ ...bindingInput, materialRepair: repair, model }),
    /feedback changed/,
  );
  assert.equal(model.requests.length, 1);
});

test('field mapping rejects original source changes while the model was running', async () => {
  const { repair, bindingInput, proposedBindings } = fixture();
  const sources = await selectApiBindingSources({
    ...bindingInput,
    materialRepair: repair,
    model: recoveryQueueModel([
      {
        decision: {
          kind: 'selected-response-sources',
          sourceNodeIds: ['source'],
        },
      },
    ]),
  });
  const model = recoveryQueueModel(
    [{ bindings: proposedBindings, gaps: [] }],
    () => {
      repair.source.scenario += ' changed';
    },
  );
  await assert.rejects(
    planApiCallBindings({
      ...bindingInput,
      materialRepair: repair,
      sources,
      model,
    }),
    /different source snapshot/,
  );
  assert.equal(model.requests.length, 1);
});

test('the whole authorized repair request is immutable, even when the selected target and reason stay the same', async () => {
  const { repair, bindingInput } = fixture();
  const model = recoveryQueueModel(
    [{ decision: { kind: 'independent-inputs' } }],
    () => {
      repair.request.request.targets.push({
        stage: 'api-arguments',
        nodeId: 'price',
      });
    },
  );
  await assert.rejects(
    selectApiBindingSources({ ...bindingInput, materialRepair: repair, model }),
    /feedback changed/,
  );
  assert.equal(model.requests.length, 1);
});

test('released literal inputs require validated pending binding work; typed values and receipts remain code-owned', async () => {
  const { repair, literalInput, work, replacement } = literalFixture();
  const feedback = describeWorkflowConnectionApiRepair({
    stage: 'api-arguments',
    repair,
    planning: literalInput,
  });
  assert.equal(Object.hasOwn(feedback, 'previousBindings'), false);
  assert.equal(Object.hasOwn(feedback, 'values'), false);
  assert.throws(
    () =>
      describeWorkflowConnectionApiRepair({
        stage: 'api-arguments',
        repair: { source: repair.source, request: repair.request },
        planning: literalInput,
      }),
    /does not authorize/,
  );
  const model = recoveryQueueModel([literalOutput('request-only-7')]);
  const generated = await generateApiArguments({
    ...literalInput,
    materialRepair: repair,
    model,
  });
  assert.deepEqual(generated.values, { query: { id: 'request-only-7' } });
  assert.ok(generated.literalSources.length);
  assert.equal(model.requests[0].payload.scenario, literalInput.scenario);
  assert.deepEqual(model.requests[0].payload.materialRepair, feedback);
  const adopted = applyWorkflowConnectionMaterialRepairWork({
    source: repair.source,
    work,
    pendingReplacement: replacement,
    replacement: {
      ...replacement,
      apiArguments: [
        {
          callId: generated.callId,
          ...selectWorkflowConnectionArgumentValues(generated),
        },
      ],
    },
  });
  assert.deepEqual(
    adopted.source.materials.find((item) => item.arguments.callId === 'price')
      .arguments.values,
    generated.values,
  );
});

test('forged pending work and changed literal contracts fail before model invocation', async () => {
  const { repair, literalInput } = literalFixture();
  const model = recoveryQueueModel([]);
  for (const planning of [
    { ...literalInput, scenario: literalInput.scenario + ' new value' },
    { ...literalInput, purpose: 'different purpose' },
    { ...literalInput, bindings: [] },
    { ...literalInput, requestMediaType: 'text/plain' },
  ])
    await assert.rejects(
      generateApiArguments({ ...planning, materialRepair: repair, model }),
    );
  await assert.rejects(
    generateApiArguments({
      ...literalInput,
      model,
      materialRepair: {
        ...repair,
        pendingReplacement: { ...repair.pendingReplacement, apiArguments: [] },
      },
    }),
  );
  assert.equal(model.requests.length, 0);
});

test('repair-only values cannot be quoted as user literals, and rejection feedback belongs to this exact repair context', async () => {
  const { repair, literalInput } = literalFixture();
  repair.request.request.reason += ' Use "repair-only-value".';
  const model = recoveryQueueModel([literalOutput('repair-only-value')]);
  let failure;
  try {
    await generateApiArguments({
      ...literalInput,
      materialRepair: repair,
      model,
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure);
  const rejection = createApiArgumentRejection({
    ...literalInput,
    materialRepair: repair,
    error: failure,
  });
  assert.ok(rejection);
  assert.equal(
    createApiArgumentRejection({ ...literalInput, error: failure }),
    undefined,
  );
  repair.request.request.reason += ' changed feedback';
  assert.equal(
    createApiArgumentRejection({
      ...literalInput,
      materialRepair: repair,
      error: failure,
    }),
    undefined,
  );
  assert.equal(model.requests.length, 1);
});

test('literal generation rejects mutated recovery requests after one model response without a hidden retry', async () => {
  const { repair, literalInput } = literalFixture();
  const model = recoveryQueueModel([literalOutput('request-only-7')], () => {
    repair.request.request.reason += ' changed';
  });
  await assert.rejects(
    generateApiArguments({ ...literalInput, materialRepair: repair, model }),
    /feedback changed/,
  );
  assert.equal(model.requests.length, 1);
});

test('real ChatOpenAI transport keeps recovery data separate in all three API planning calls', async () => {
  const binding = fixture();
  const literal = literalFixture();
  const outputs = [
    {
      decision: {
        kind: 'selected-response-sources',
        sourceNodeIds: ['source'],
      },
    },
    { bindings: binding.proposedBindings, gaps: [] },
    literalOutput('request-only-7'),
  ];
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const output = outputs[requests.length];
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'api-repair-wire',
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
                  id: 'api-repair',
                  type: 'function',
                  function: {
                    name: body.tools[0].function.name,
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
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const sources = await selectApiBindingSources({
      ...binding.bindingInput,
      materialRepair: binding.repair,
      model,
    });
    const mapped = await planApiCallBindings({
      ...binding.bindingInput,
      materialRepair: binding.repair,
      model,
      sources,
    });
    assert.deepEqual(
      mapped.bindings,
      binding.replacement.apiArguments[0].bindings,
    );
    const generated = await generateApiArguments({
      ...literal.literalInput,
      materialRepair: literal.repair,
      model,
    });
    assert.deepEqual(generated.values, { query: { id: 'request-only-7' } });
    assert.deepEqual(
      requests.map((request) => request.tools[0].function.name),
      [
        'select_api_binding_sources',
        'plan_api_call_bindings',
        'generate_api_arguments',
      ],
    );
    for (const [index, request] of requests.entries()) {
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(
        payload.scenario,
        index < 2 ? binding.broken.scenario : literal.broken.scenario,
      );
      assert.equal(payload.materialRepair.target.nodeId, 'price');
      assert.match(request.messages[0].content, /not a new user request/);
      assert.equal(JSON.stringify(payload).includes('capabilities'), false);
      assert.equal(Object.hasOwn(payload, 'source'), false);
    }
    const payload = JSON.parse(requests[2].messages[1].content);
    assert.equal(
      Object.hasOwn(payload.materialRepair, 'previousBindings'),
      false,
    );
    assert.equal(
      JSON.stringify(payload.literalInputSchema).includes('"labels"'),
      false,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
