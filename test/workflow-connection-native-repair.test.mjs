import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import { createResponseCollectionCapability } from '@openapi-flow/n8n';
import {
  describeWorkflowConnectionNativeDependencies,
  createWorkflowConnectionNativeDependenciesSchema,
  resolveWorkflowConnectionNativeDependencies,
  describeWorkflowConnectionNativeParameters,
  resolveWorkflowConnectionNativeParameters,
  applyWorkflowConnectionMaterialRepair,
  replayWorkflowConnectionMaterialRepair,
  describeWorkflowConnectionGoals,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionNativeDependencies,
  generateWorkflowConnectionNativeParameters,
} from '@openapi-flow/langchain';
import { connectionNativeRepairFixture } from './fixtures/connection-native-repair-fixture.mjs';
import { recoveryQueueModel } from './fixtures/initial-connection-recovery-fixture.mjs';
import { initialConnectionRecoveryFixture } from './fixtures/initial-connection-recovery-fixture.mjs';

function choices(f, producerId = f.original.id) {
  return {
    sourcesByNodeId: { [f.parent.id]: { sourceNodeIds: [producerId] } },
  };
}
function selected(f) {
  return resolveWorkflowConnectionNativeDependencies({
    ...f,
    proposal: choices(f),
  });
}
function values(f, producerId = f.original.id, pointer = '/groups') {
  return {
    decision: {
      status: 'provided',
      parameters: { sourceNodeId: producerId, pointer },
    },
  };
}

test('native repair exposes only authorized existing target keys and actual supported producers', () => {
  const f = connectionNativeRepairFixture();
  const before = globalThis.structuredClone({
    ...f.source,
    capabilities: undefined,
  });
  const context = describeWorkflowConnectionNativeDependencies(f);
  assert.deepEqual(
    context.targets.map((target) => target.nodeId),
    [f.parent.id],
  );
  assert.ok(context.targets[0].sourceNodeIds.includes(f.original.id));
  assert.ok(context.targets[0].sourceNodeIds.includes('unrelated-existing'));
  assert.equal(context.targets[0].sourceNodeIds.includes(f.parent.id), false);
  const schema = createWorkflowConnectionNativeDependenciesSchema(f);
  assert.equal(schema.safeParse(choices(f)).success, true);
  for (const proposal of [
    choices(f, 'invented'),
    choices(f, f.parent.id),
    {
      sourcesByNodeId: {
        ...choices(f).sourcesByNodeId,
        [f.child.id]: { sourceNodeIds: [] },
      },
    },
    { sourcesByNodeId: {} },
  ])
    assert.equal(schema.safeParse(proposal).success, false);
  context.nativeNodes[0].parameters.groups.push('changed returned copy');
  assert.deepEqual({ ...f.source, capabilities: undefined }, before);
});

test('dependency repair checks preserved consumers and API/native data dependencies, not just proposed rows', () => {
  const f = connectionNativeRepairFixture();
  assert.throws(
    () =>
      resolveWorkflowConnectionNativeDependencies({
        ...f,
        proposal: choices(f, f.child.id),
      }),
    /cycle/,
  );
  const dependencies = selected(f);
  assert.deepEqual(Object.keys(dependencies.proposal.sourcesByNodeId), [
    f.parent.id,
  ]);
  assert.deepEqual(dependencies.proposal, choices(f));
});

test('two independent calls repair the original ID and preserve every unrelated instance before explicit apply and replay', async () => {
  const f = connectionNativeRepairFixture();
  const model = recoveryQueueModel([choices(f), values(f)]);
  const dependencies = await planWorkflowConnectionNativeDependencies({
    ...f,
    model,
  });
  const result = await generateWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
    dependencies,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node, f.parent);
  assert.equal(model.requests.length, 2);
  const payload = model.requests[1].payload;
  assert.deepEqual(payload.sourceNodeIds, [f.original.id]);
  assert.deepEqual(
    payload.outputs.map((output) => output.nodeId),
    [f.original.id],
  );
  assert.deepEqual(
    payload.nativeNodes.map((node) => node.id),
    [f.original.id],
  );
  assert.equal(payload.scenario, f.source.scenario);
  assert.equal(payload.target.id, f.parent.id);
  assert.equal(Object.hasOwn(payload, 'capabilities'), false);
  assert.equal(
    f.source.nativeNodes.find((node) => node.id === f.parent.id).parameters
      .sourceNodeId,
    'unrelated-existing',
  );
  const replacement = { apiArguments: [], nativeNodes: [result.node] };
  const applied = applyWorkflowConnectionMaterialRepair({ ...f, replacement });
  for (const node of f.source.nativeNodes) {
    const after = applied.source.nativeNodes.find(
      (item) => item.id === node.id,
    );
    assert.deepEqual(after, node.id === f.parent.id ? f.parent : node);
  }
  assert.deepEqual(
    replayWorkflowConnectionMaterialRepair({
      source: f.source,
      receipt: applied.receipt,
    }).nativeNodes,
    applied.source.nativeNodes,
  );
});

test('wrong stage, missing/fabricated targets, stale source, unknown facts and invalid options fail before invocation', async () => {
  const f = connectionNativeRepairFixture();
  const model = recoveryQueueModel([]);
  for (const request of [
    { ...f.request, sourceFingerprint: 'f'.repeat(64) },
    { ...f.request, request: { ...f.request.request, factIds: ['invented'] } },
    {
      ...f.request,
      request: {
        ...f.request.request,
        targets: [{ stage: 'native-parameters', nodeId: f.parent.id }],
      },
    },
    {
      ...f.request,
      request: {
        ...f.request.request,
        targets: [{ stage: 'native-dependencies', nodeId: 'invented' }],
      },
    },
  ])
    await assert.rejects(
      planWorkflowConnectionNativeDependencies({ ...f, request, model }),
    );
  await assert.rejects(
    planWorkflowConnectionNativeDependencies({
      ...f,
      includeExplanations: 'yes',
      model,
    }),
  );
  assert.equal(model.requests.length, 0);
});

test('a dependency target requires an unchanged checked choice before parameter generation', async () => {
  const f = connectionNativeRepairFixture();
  const model = recoveryQueueModel([]);
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.parent.id,
      model,
    }),
    /checked dependency/,
  );
  const dependencies = selected(f);
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.parent.id,
      dependencies: { ...dependencies, fingerprint: 'invented' },
      model,
    }),
    /stale/,
  );
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.child.id,
      dependencies,
      model,
    }),
    /authorized/,
  );
  assert.equal(model.requests.length, 0);
});

test('parameter-only repair keeps actual producer IDs and forbids producer substitutions at direct apply too', async () => {
  const f = connectionNativeRepairFixture('native-parameters');
  const context = describeWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
  });
  assert.deepEqual(context.sourceNodeIds, ['unrelated-existing']);
  const model = recoveryQueueModel([values(f)]);
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.parent.id,
      model,
    }),
  );
  assert.throws(
    () =>
      applyWorkflowConnectionMaterialRepair({
        ...f,
        replacement: { apiArguments: [], nativeNodes: [f.parent] },
      }),
    /cannot change producers/,
  );
  const same = resolveWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
    fingerprint: context.fingerprint,
    proposal: values(f, 'unrelated-existing'),
  });
  assert.deepEqual(same.node, f.broken);
});

test('invalid pointers, extra identity fields, wrong value types and runtime ownership never repair themselves', async () => {
  const f = connectionNativeRepairFixture();
  const dependencies = selected(f);
  for (const output of [
    values(f, f.original.id, '/invented'),
    { decision: { ...values(f).decision, id: 'new-role' } },
    {
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: 1, pointer: '/groups' },
      },
    },
    {
      decision: {
        status: 'provided',
        parameters: {
          ...values(f).decision.parameters,
          runtimeParameters: true,
        },
      },
    },
  ]) {
    const model = recoveryQueueModel([output]);
    await assert.rejects(
      generateWorkflowConnectionNativeParameters({
        ...f,
        nodeId: f.parent.id,
        dependencies,
        model,
      }),
      (error) => {
        assert.equal(
          error.diagnostic.operation,
          'generateWorkflowConnectionNativeParameters',
        );
        assert.equal(error.diagnostic.code, 'NATIVE_NODE_PLANNING_FAILED');
        assert.deepEqual(error.failure.output, output);
        assert.equal(typeof error.failure.fingerprint, 'string');
        assert.ok(error.cause);
        return true;
      },
    );
    assert.equal(model.requests.length, 1);
  }
});

test('repair reasons and full request changes during either call reject their result without hidden retries', async () => {
  for (const stage of ['dependencies', 'parameters']) {
    const f = connectionNativeRepairFixture();
    const dependencies = selected(f);
    const model = recoveryQueueModel(
      [stage === 'dependencies' ? choices(f) : values(f)],
      () => {
        f.request.request.reason += ' changed';
      },
    );
    await assert.rejects(
      stage === 'dependencies'
        ? planWorkflowConnectionNativeDependencies({ ...f, model })
        : generateWorkflowConnectionNativeParameters({
            ...f,
            nodeId: f.parent.id,
            dependencies,
            model,
          }),
    );
    assert.equal(model.requests.length, 1);
  }
});

test('an actual missing business choice returns an explicit source-bound question, not a fake ready node', async () => {
  const f = connectionNativeRepairFixture();
  const dependencies = selected(f);
  const model = recoveryQueueModel([
    {
      decision: {
        status: 'needs-clarification',
        message: 'Which original group should this workflow use?',
      },
    },
  ]);
  const result = await generateWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
    dependencies,
    model,
  });
  assert.equal(result.status, 'needs-clarification');
  assert.equal(result.nodeId, f.parent.id);
  assert.equal(Object.hasOwn(result, 'node'), false);
  assert.equal(model.requests.length, 1);
});

test('independent no-source roles have code-only producer repair, not a fabricated LLM proposal', async () => {
  const f = connectionNativeRepairFixture();
  f.request.request.targets = [
    { stage: 'native-dependencies', nodeId: f.original.id },
  ];
  const model = recoveryQueueModel([]);
  const result = await planWorkflowConnectionNativeDependencies({
    ...f,
    model,
  });
  assert.deepEqual(result.proposal.sourcesByNodeId, {
    [f.original.id]: { sourceNodeIds: [] },
  });
  assert.equal(model.requests.length, 0);
});

test('source changes invalidate saved dependency work without mutating old receipts', () => {
  const f = connectionNativeRepairFixture();
  const dependencies = selected(f);
  const before = globalThis.structuredClone(dependencies);
  f.source.scenario += ' A different requirement epoch.';
  f.source.requirements[0].text = f.source.scenario;
  f.source.requirements[0].sources[0].quote = f.source.scenario;
  f.request.sourceFingerprint = describeWorkflowConnectionGoals(
    f.source,
  ).sourceFingerprint;
  assert.throws(
    () =>
      describeWorkflowConnectionNativeParameters({
        ...f,
        nodeId: f.parent.id,
        dependencies,
      }),
    /stale/,
  );
  assert.deepEqual(dependencies, before);
});

test('multiple targets use checked completed producers, never stale pending output or forged replay records', async () => {
  const f = connectionNativeRepairFixture();
  f.request.request.targets.push({
    stage: 'native-parameters',
    nodeId: f.child.id,
  });
  const dependencies = selected(f);
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.child.id,
      dependencies,
      model: recoveryQueueModel([]),
    }),
    /completed producer/,
  );
  const parent = await generateWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
    dependencies,
    model: recoveryQueueModel([values(f)]),
  });
  assert.equal(parent.status, 'ready');
  const next = {
    ...f,
    nodeId: f.child.id,
    dependencies,
    completedParameters: [parent],
  };
  const child = await generateWorkflowConnectionNativeParameters({
    ...next,
    model: recoveryQueueModel([
      { decision: { status: 'provided', parameters: f.child.parameters } },
    ]),
  });
  assert.deepEqual(child.node, f.child);
  const applied = applyWorkflowConnectionMaterialRepair({
    ...f,
    replacement: { apiArguments: [], nativeNodes: [parent.node, child.node] },
  });
  assert.equal(
    applied.source.nativeNodes.find((node) => node.id === f.parent.id)
      .parameters.sourceNodeId,
    f.original.id,
  );
  for (const completedParameters of [
    [parent, parent],
    [{ ...parent, fingerprint: 'forged' }],
    [
      {
        ...parent,
        node: {
          ...parent.node,
          parameters: {
            ...parent.node.parameters,
            sourceNodeId: 'unrelated-existing',
          },
        },
      },
    ],
    [child, parent],
  ])
    assert.throws(() =>
      describeWorkflowConnectionNativeParameters({
        ...next,
        completedParameters,
      }),
    );
});

test('a completed producer with a changed output cannot lend its former schema to a consumer', async () => {
  const f = connectionNativeRepairFixture();
  f.request.request.targets.push({
    stage: 'native-parameters',
    nodeId: f.child.id,
  });
  const dependencies = selected(f);
  const parent = await generateWorkflowConnectionNativeParameters({
    ...f,
    nodeId: f.parent.id,
    dependencies,
    model: recoveryQueueModel([values(f, f.original.id, '/groups/0/children')]),
  });
  assert.equal(parent.status, 'ready');
  const model = recoveryQueueModel([
    { decision: { status: 'provided', parameters: f.child.parameters } },
  ]);
  await assert.rejects(
    generateWorkflowConnectionNativeParameters({
      ...f,
      nodeId: f.child.id,
      dependencies,
      completedParameters: [parent],
      model,
    }),
  );
  assert.ok(model.requests.length <= 1);
  assert.deepEqual(
    f.source.nativeNodes.find((node) => node.id === f.parent.id),
    f.broken,
  );
});

test('runtime-owned native values stay code-only and retain the original ownership', async () => {
  const f = connectionNativeRepairFixture('native-parameters');
  const original = f.source.nativeNodes.find(
    (node) => node.id === f.original.id,
  );
  original.runtimeParameters = true;
  original.parameters = {};
  f.request.request.targets = [
    { stage: 'native-parameters', nodeId: original.id },
  ];
  f.request.sourceFingerprint = describeWorkflowConnectionGoals(
    f.source,
  ).sourceFingerprint;
  const model = recoveryQueueModel([]);
  const result = await generateWorkflowConnectionNativeParameters({
    ...f,
    nodeId: original.id,
    model,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node, original);
  assert.equal(model.requests.length, 0);
});

test('transport failures and cancellation keep their original cause and never retry a repair model', async () => {
  const f = connectionNativeRepairFixture();
  const cause = new Error('original transport failure');
  const model = recoveryQueueModel([cause]);
  await assert.rejects(
    planWorkflowConnectionNativeDependencies({ ...f, model }),
    (error) => error.cause === cause,
  );
  assert.equal(model.requests.length, 1);
  const controller = new globalThis.AbortController();
  const cancelled = recoveryQueueModel([choices(f)], () => controller.abort());
  await assert.rejects(
    planWorkflowConnectionNativeDependencies({
      ...f,
      model: cancelled,
      signal: controller.signal,
    }),
  );
  assert.equal(cancelled.requests.length, 1);
});

test('actual ChatOpenAI wire sends only scoped producer/settings decisions and preserves separate repair reasoning', async () => {
  const f = connectionNativeRepairFixture();
  const requests = [];
  const outputs = [choices(f), values(f)];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const output = outputs[requests.length];
    requests.push(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'repair-wire',
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
                  id: 'repair',
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
    const dependencies = await planWorkflowConnectionNativeDependencies({
      ...f,
      model,
    });
    const result = await generateWorkflowConnectionNativeParameters({
      ...f,
      dependencies,
      nodeId: f.parent.id,
      model,
    });
    assert.deepEqual(result.node, f.parent);
    assert.deepEqual(
      requests.map((request) => request.tools[0].function.name),
      ['repair_native_dependencies', 'repair_native_parameters'],
    );
    for (const request of requests) {
      const payload = JSON.parse(request.messages[1].content);
      assert.equal(payload.scenario, f.source.scenario);
      assert.equal(payload.reason, f.request.request.reason);
      assert.equal(Object.hasOwn(payload, 'source'), false);
      assert.equal(Object.hasOwn(payload, 'capabilities'), false);
    }
    assert.deepEqual(
      Object.keys(
        requests[0].tools[0].function.parameters.properties.sourcesByNodeId
          .properties,
      ),
      [f.parent.id],
    );
    assert.deepEqual(
      Object.keys(requests[1].tools[0].function.parameters.properties),
      ['decision'],
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('API producers use only the selected original response contract and cannot introduce a request-to-native cycle', async () => {
  const base = initialConnectionRecoveryFixture();
  const source = {
    ...base.source,
    capabilities: [...base.source.capabilities],
    nativeNodes: [...base.source.nativeNodes],
  };
  const collection = createResponseCollectionCapability({
    materials: source.materials.map((material) => ({
      callId: material.arguments.callId,
      operation: material.operation,
    })),
  });
  source.capabilities.push(collection);
  source.nativeNodes.push({
    id: 'collected',
    capability: collection.name,
    parameters: { sourceNodeId: 'detail', pointer: '/id' },
  });
  const request = {
    kind: 'replan-materials',
    sourceFingerprint:
      describeWorkflowConnectionGoals(source).sourceFingerprint,
    request: {
      kind: 'replan-materials',
      targets: [{ stage: 'native-dependencies', nodeId: 'collected' }],
      factIds: ['intent'],
      reason:
        'Collect the actual source response IDs rather than the detail IDs.',
    },
  };
  const input = { source, request };
  const model = recoveryQueueModel([
    { sourcesByNodeId: { collected: { sourceNodeIds: ['source'] } } },
    {
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: 'source', pointer: '/id' },
      },
    },
  ]);
  const dependencies = await planWorkflowConnectionNativeDependencies({
    ...input,
    model,
  });
  const result = await generateWorkflowConnectionNativeParameters({
    ...input,
    dependencies,
    nodeId: 'collected',
    model,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(
    model.requests[1].payload.apiMaterials.map((material) => material.nodeId),
    ['source'],
  );
  for (const material of model.requests[0].payload.apiMaterials) {
    assert.equal(Object.hasOwn(material, 'effective'), false);
    assert.equal(Object.hasOwn(material, 'operation'), false);
    assert.ok(material.responses);
  }
  const applied = applyWorkflowConnectionMaterialRepair({
    ...input,
    replacement: { apiArguments: [], nativeNodes: [result.node] },
  });
  assert.equal(
    applied.source.nativeNodes.find((node) => node.id === 'collected')
      .parameters.sourceNodeId,
    'source',
  );
  const cycle = {
    ...source,
    materials: globalThis.structuredClone(source.materials),
  };
  const detail = cycle.materials.find(
    (material) => material.arguments.callId === 'detail',
  );
  detail.arguments.bindings[0] = {
    kind: 'node-output',
    targetPointer: '/path/id',
    sourceNodeId: 'collected',
    sourcePointer: '/items/0',
  };
  const cycleInput = {
    source: cycle,
    request: {
      ...request,
      sourceFingerprint:
        describeWorkflowConnectionGoals(cycle).sourceFingerprint,
    },
  };
  assert.throws(
    () =>
      resolveWorkflowConnectionNativeDependencies({
        ...cycleInput,
        proposal: {
          sourcesByNodeId: { collected: { sourceNodeIds: ['detail'] } },
        },
      }),
    /cycle/,
  );
});
