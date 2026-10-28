import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { z } from 'zod';
import {
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  validateNativeInstanceDependencies,
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
  resolveNativeProducerParameters,
  createNativeNodePlan,
  createNativeNodePlanningRecord,
  validateNativeNodePlanningRecord,
  resolveNativeMaterialSnapshot,
  describeWorkflowConnectionPlanning,
  createWorkflowGraphPlan,
  validateWorkflowGraphPlan,
} from '@openapi-flow/core';
import { createWorkflowNodeContracts } from '../packages/core/dist/workflow/create-workflow-node-contracts.js';
import { generateNativeNodeParameters } from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  createJsonOutputCapability,
} from '@openapi-flow/n8n';
import { validateNativeNodeProducerReferences } from '../packages/core/dist/workflow/planning/resolve-native-configuration-materials.js';
import { nativeParameterProducerIds } from '../packages/core/dist/workflow/planning/native-parameter-producer-ids.js';
import { nativeFeatureRegistryFixture } from './fixtures/native-feature-registry-fixture.mjs';

async function fixture(feature = N8nNativeFeature.GatherApiResponses) {
  const original = await nativeFeatureRegistryFixture();
  const apiMaterials = Array.from({ length: 14 }, (_, index) => ({
    callId: `source-${index}`,
    operation: globalThis.structuredClone(original.apiMaterials[0].operation),
  }));
  const input = {
    planId: 'source-subset',
    scenario: 'Use three of the permitted original responses unchanged.',
    apiMaterials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [feature],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: feature,
          purpose: 'selected responses',
          parameterSource: 'literal',
        },
        {
          capability: feature,
          purpose: 'later independent responses',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const [instance, later] = selection.instances;
  const allowed = apiMaterials.slice(0, 13).map((source) => source.callId);
  const actual = [allowed[8], allowed[1], allowed[11]];
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: {
      sourcesByNodeId: {
        [instance.id]: { sourceNodeIds: allowed },
        [later.id]: { sourceNodeIds: [allowed[0]] },
      },
    },
  });
  const config = { ...input, selection, dependencies, nodeId: instance.id };
  return {
    input,
    selection,
    dependencies,
    instance,
    later,
    allowed,
    actual,
    config,
  };
}

function resolve(config, parameters) {
  return resolveNativeNodeParameters({
    ...config,
    fingerprint: describeNativeNodeConfiguration(config).fingerprint,
    proposal: { decision: { status: 'provided', parameters } },
  });
}

test('13 permitted producers and 3 actual references survive configuration, receipt replay, plan, graph and official compilation', async () => {
  const f = await fixture();
  const before = JSON.stringify(f.config);
  const description = describeNativeNodeConfiguration(f.config);
  assert.deepEqual(description.sourceDependencies.sourceNodeIds, f.allowed);
  assert.equal(description.context.apiMaterials.length, 13);
  // A producer allow-list is not enough information to derive actual settings.
  assert.equal(resolveNativeProducerParameters(f.config), undefined);
  let valueCalls = 0;
  const result = await generateNativeNodeParameters({
    ...f.config,
    model: {
      withStructuredOutput() {
        valueCalls++;
        return {
          async invoke(messages) {
            const payload = JSON.parse(messages[1].content);
            assert.deepEqual(
              payload.sourceDependencies.sourceNodeIds,
              f.allowed,
            );
            return {
              decision: {
                status: 'provided',
                parameters: { sourceNodeIds: f.actual },
              },
            };
          },
        };
      },
    },
  });
  assert.equal(valueCalls, 1);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node.parameters.sourceNodeIds, f.actual);
  // This is the same public Core revalidation boundary used by host finalization.
  assert.deepEqual(
    resolveNativeNodeParameters({
      ...f.config,
      fingerprint: result.fingerprint,
      proposal: result.proposal,
    }),
    result,
  );
  // Already configured nodes must also pass subset validation for the next role.
  const nextConfig = {
    ...f.config,
    nodeId: f.later.id,
    configuredNodes: [result.node],
  };
  const next = describeNativeNodeConfiguration(nextConfig);
  assert.deepEqual(next.sourceDependencies.sourceNodeIds, [f.allowed[0]]);
  const later = resolve(nextConfig, { sourceNodeIds: [f.allowed[0]] });
  assert.deepEqual(
    resolveNativeNodeParameters({
      ...nextConfig,
      fingerprint: later.fingerprint,
      proposal: later.proposal,
    }),
    later,
  );
  const plan = createNativeNodePlan({
    ...f.input,
    proposal: { nativeNodes: [result.node, later.node], gaps: [] },
  });
  assert.deepEqual(
    plan.nativeNodes.map((node) => node.id).sort(),
    f.selection.instances.map((instance) => instance.id).sort(),
  );
  const record = createNativeNodePlanningRecord({
    ...f.input,
    plan,
    assessment: {
      kind: 'additions',
      nodes: plan.nativeNodes.map((node) => ({
        nodeId: node.id,
        reason: 'Use only actual parameter references.',
      })),
    },
  });
  assert.doesNotThrow(() =>
    validateNativeNodePlanningRecord({ ...f.input, plan, record }),
  );
  const [contract] = record.verification.contracts;
  assert.deepEqual(nativeParameterProducerIds(contract), [...f.actual].sort());
  assert.deepEqual(contract.inputs, ['input1', 'input2', 'input3']);
  assert.deepEqual(contract.dependencyNodeIds, []);
  const output = record.verification.outputs[0].schema.properties.results;
  assert.equal(output.minItems, 3);
  assert.equal(output.maxItems, 3);
  assert.deepEqual(
    output.prefixItems.map((entry) => entry.properties.callId.const),
    f.actual,
  );
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: f.input.apiMaterials,
    nativeOutputs: [],
    nativeNodes: plan.nativeNodes,
    capabilities: f.input.capabilities,
    deferredNodeIds: [],
  });
  assert.equal(snapshot.status, 'ready');
  const materials = f.input.apiMaterials.map(({ callId, operation }) => ({
    operation,
    arguments: { callId, values: {}, bindings: [], unresolvedInputs: [] },
  }));
  const connections = describeWorkflowConnectionPlanning({
    scenario: f.input.scenario,
    capabilities: snapshot.capabilities,
    nativeNodes: plan.nativeNodes,
    materials: materials.map((material) => ({ status: 'ready', ...material })),
  });
  assert.deepEqual(
    nativeParameterProducerIds(
      connections.context.nodes.find((node) => node.id === result.node.id),
    ),
    [...f.actual].sort(),
  );
  const graph = createWorkflowGraphPlan({
    materials,
    capabilities: f.input.capabilities,
    proposal: {
      ...plan,
      edges: [
        ...f.actual.map((from, index) => ({
          from,
          output: 'main',
          to: result.node.id,
          input: `input${index + 1}`,
        })),
        {
          from: f.allowed[0],
          output: 'main',
          to: later.node.id,
          input: 'input1',
        },
      ],
    },
  });
  assert.deepEqual(
    graph.edges
      .filter((edge) => edge.to === result.node.id)
      .map((edge) => edge.from),
    f.actual,
  );
  assert.equal(graph.edges.length, 4);
  const apiNodes = materials.map((material, index) =>
    createHttpRequestNode({
      ...material,
      baseUrl: 'http://localhost:5678',
      position: [0, index * 200],
    }),
  );
  const compiled = compilePlannedN8nWorkflow({
    id: 'source-subset',
    name: 'Actual source subset',
    materials,
    capabilities: snapshot.capabilities,
    apiNodes,
    plan: graph,
  }).workflow;
  const merge = compiled.nodes.find(
    (node) => node.type === 'n8n-nodes-base.merge',
  );
  assert.equal(merge.parameters.numberInputs, 3);
  assert.deepEqual(
    compiled.nodes.find((node) => node.id === result.node.id).parameters,
    {
      aggregate: 'aggregateAllItemData',
      destinationFieldName: 'results',
      include: 'allFields',
      options: { includeBinaries: false },
    },
  );
  const code = snapshot.capabilities[0]
    .compile({
      planned: result.node,
      apiNodeNames: Object.fromEntries(
        apiNodes.map((node) => [node.nodeId, node.exit.name]),
      ),
      position: [0, 0],
    })
    .nodes.find((node) => node.type === 'n8n-nodes-base.code').config
    .parameters.jsCode;
  assert.ok(
    compiled.nodes.some(
      (node) =>
        node.type === 'n8n-nodes-base.code' && node.parameters.jsCode === code,
    ),
  );
  const names = new Map(apiNodes.map((node) => [node.exit.name, node.nodeId]));
  const reads = [];
  const body = { id: '0007', rows: [0, 2] };
  const execution = vm.runInNewContext(`(function(){${code}})()`, {
    $input: { all: () => f.actual.map(() => ({ json: {} })) },
    $: (name) => {
      reads.push(names.get(name));
      return {
        all: () => [
          {
            json: {
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body,
            },
          },
        ],
      };
    },
  });
  assert.deepEqual(reads, f.actual);
  const results = JSON.parse(JSON.stringify(execution)).map(
    (entry) => entry.json,
  );
  assert.deepEqual(
    results.map((entry) => entry.callId),
    f.actual,
  );
  assert.ok(
    results.every(
      (entry) => JSON.stringify(entry.body) === JSON.stringify(body),
    ),
  );
  // Real data dependencies still need their producers on the corresponding route.
  assert.throws(() =>
    validateWorkflowGraphPlan({
      materials,
      capabilities: snapshot.capabilities,
      plan: { ...graph, edges: graph.edges.slice(1) },
    }),
  );
  assert.equal(JSON.stringify(f.config), before);
});

test('a material that exists but is outside the selected allow-list is rejected, including configured-node revalidation', async () => {
  const f = await fixture();
  const forbidden = f.input.apiMaterials[13].callId;
  assert.throws(() => resolve(f.config, { sourceNodeIds: [forbidden] }));
  const result = resolve(f.config, { sourceNodeIds: f.actual });
  const tampered = globalThis.structuredClone(result.node);
  tampered.parameters.sourceNodeIds = [forbidden];
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...f.config,
        nodeId: f.later.id,
        configuredNodes: [tampered],
      }),
    /actual parameter references must be a subset.*unselected producers: source-13/,
  );
});

test('subset selection retains pointer, source-kind and parameter-type validation', async () => {
  const f = await fixture(N8nNativeFeature.SplitApiResponseArray);
  const before = JSON.stringify(f.config);
  assert.equal(
    resolve(f.config, { sourceNodeId: f.actual[0], pointer: '/rows' }).status,
    'ready',
  );
  for (const parameters of [
    { sourceNodeId: f.actual[0], pointer: '/absent' },
    { sourceNodeId: f.actual[0], pointer: '/id' },
    { sourceNodeId: f.actual[0], pointer: 0 },
    { sourceNodeId: 7, pointer: '/rows' },
    { sourceNodeId: 'invented', pointer: '/rows' },
  ])
    assert.throws(() => resolve(f.config, parameters));
  assert.equal(JSON.stringify(f.config), before);
  const checks = await fixture(N8nNativeFeature.AssertResponses);
  assert.throws(() =>
    resolve(checks.config, {
      checks: [
        {
          left: {
            source: 'node-output',
            nodeId: checks.actual[0],
            pointer: '/id',
          },
          operator: 'equals',
          right: { source: 'literal', value: '0007' },
          message: 'Mismatch',
        },
      ],
    }),
  );
});

test('unused selected producers are not mandatory bindings, including zero actual references', async () => {
  const f = await fixture(N8nNativeFeature.AssertResponses);
  const result = resolve(f.config, {
    checks: [
      {
        left: { source: 'literal', value: false },
        operator: 'equals',
        right: { source: 'literal', value: false },
        message: 'Mismatch',
      },
    ],
  });
  assert.equal(result.status, 'ready');
  const [contract] = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [result.node],
    capabilities: f.input.capabilities,
  });
  assert.deepEqual(nativeParameterProducerIds(contract), []);
  assert.deepEqual(contract.dependencyNodeIds, []);
  assert.doesNotThrow(() =>
    validateNativeNodeProducerReferences(
      result.node,
      f.input.capabilities[0],
      [],
    ),
  );
});

test('selection/source receipt mutations, even to unused source contracts, remain stale', async () => {
  const f = await fixture();
  const before = JSON.stringify(f.config);
  for (const change of [
    (copy) => {
      copy.dependencies.proposal.sourcesByNodeId[
        f.instance.id
      ].sourceNodeIds.pop();
    },
    (copy) => {
      copy.dependencies.context.sourceCandidatesByNodeId[f.instance.id].pop();
    },
    (copy) => {
      copy.selection.instances[0].purpose = 'changed';
    },
    (copy) => {
      copy.apiMaterials[0].operation.operation.responses['200'].content[
        'application/json'
      ].schema.properties.id.type = 'number';
    },
  ]) {
    const copy = globalThis.structuredClone({
      ...f.config,
      capabilities: undefined,
    });
    copy.capabilities = f.input.capabilities;
    change(copy);
    assert.throws(
      () => describeNativeNodeConfiguration(copy),
      /stale|modified/,
    );
  }
  assert.equal(JSON.stringify(f.config), before);
});

test('reissuing a changed allow-list invalidates previous parameter fingerprints without changing the old receipt', async () => {
  const f = await fixture();
  const result = resolve(f.config, { sourceNodeIds: f.actual });
  const proposal = globalThis.structuredClone(f.dependencies.proposal);
  proposal.sourcesByNodeId[f.instance.id].sourceNodeIds = f.actual;
  const dependencies = resolveNativeInstanceDependencies({
    ...f.input,
    selection: f.selection,
    proposal,
  });
  assert.throws(
    () =>
      resolveNativeNodeParameters({
        ...f.config,
        dependencies,
        fingerprint: result.fingerprint,
        proposal: result.proposal,
      }),
    /fingerprint is stale/,
  );
  assert.deepEqual(
    validateNativeInstanceDependencies(f.config),
    f.dependencies,
  );
  assert.deepEqual(
    f.dependencies.proposal.sourcesByNodeId[f.instance.id].sourceNodeIds,
    f.allowed,
  );
});

test('mutating cloned descriptions/results/records never mutates original sources or proposals', async () => {
  const f = await fixture();
  const before = JSON.stringify(f.config);
  const description = describeNativeNodeConfiguration(f.config);
  description.sourceDependencies.sourceNodeIds.pop();
  description.context.apiMaterials[0].operation.responses['200'].description =
    'changed view';
  const parameters = { sourceNodeIds: [...f.actual] };
  const result = resolve(f.config, parameters);
  result.node.parameters.sourceNodeIds[0] = 'mutated-node';
  assert.deepEqual(result.proposal.decision.parameters, parameters);
  result.proposal.decision.parameters.sourceNodeIds.pop();
  assert.deepEqual(parameters.sourceNodeIds, f.actual);
  assert.equal(JSON.stringify(f.config), before);
  const node = resolve(f.config, parameters).node;
  const plan = createNativeNodePlan({
    ...f.input,
    proposal: { nativeNodes: [node], gaps: [] },
  });
  const record = createNativeNodePlanningRecord({
    ...f.input,
    plan,
    assessment: {
      kind: 'additions',
      nodes: [{ nodeId: node.id, reason: 'Actual subset.' }],
    },
  });
  record.verification.contracts[0].references.pop();
  assert.throws(
    () => validateNativeNodePlanningRecord({ ...f.input, plan, record }),
    /differs/,
  );
  assert.deepEqual(plan.nativeNodes[0].parameters, parameters);
});

test('all actual reference channels are checked while execution dependencies never expand the producer allow-list', () => {
  const capability = {
    name: 'reference-channels',
    parametersSchema: { parse: (parameters) => parameters },
    parameterReferenceSources: ['response', 'node-output', 'exclusive-output'],
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [
      { source: 'response', nodeId: 'api', pointer: '' },
    ],
    nodeOutputReferences: () => [
      { source: 'node-output', nodeId: 'native', pointer: '' },
    ],
    inputReferences: () => ({
      main: [{ source: 'response', nodeId: 'port-api', pointer: '' }],
    }),
    rejoinsExclusiveOutputs: () => 'branch',
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  };
  const node = { id: 'consumer', capability: capability.name, parameters: {} };
  const actual = ['api', 'branch', 'native', 'port-api'];
  assert.doesNotThrow(() =>
    validateNativeNodeProducerReferences(node, capability, [
      ...actual,
      'unused',
    ]),
  );
  for (const id of actual)
    assert.throws(
      () =>
        validateNativeNodeProducerReferences(
          node,
          capability,
          actual.filter((source) => source !== id),
        ),
      /unselected producers/,
    );
  const [contract] = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [node],
    capabilities: [capability],
  });
  contract.dependencyNodeIds = ['execution-only'];
  assert.deepEqual(nativeParameterProducerIds(contract), actual);
});

test('native source subsets retain original completed values and reject native source receipt mutations', () => {
  const source = createJsonOutputCapability({
    name: 'original-native-source',
    description: 'Original typed values.',
    parametersSchema: z.strictObject({
      id: z.string(),
      rows: z.array(z.union([z.number(), z.boolean(), z.string()])),
    }),
  });
  const preparedNativeNodes = Array.from({ length: 14 }, (_, index) => ({
    id: `native-source-${index}`,
    capability: source.name,
    parameters: { id: '0007', rows: [0, false, '={{ literal }}'] },
  }));
  const input = {
    planId: 'native-source-subset',
    scenario: 'Check three original native sources.',
    preparedNativeNodes,
    capabilities: [
      source,
      ...resolveN8nNativePlanningFeatures({
        features: [N8nNativeFeature.AssertResponses],
      }).planningCapabilities,
    ],
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.AssertResponses,
          purpose: 'check values',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const allowed = preparedNativeNodes.slice(0, 13).map((node) => node.id);
  const actual = [allowed[2], allowed[6], allowed[10]];
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: allowed } } },
  });
  const config = { ...input, selection, nodeId, dependencies };
  const before = JSON.stringify(config);
  const parameters = {
    checks: actual.map((id) => ({
      left: { source: 'node-output', nodeId: id, pointer: '/id' },
      operator: 'equals',
      right: { source: 'literal', value: '0007' },
      message: 'Mismatch',
    })),
  };
  const result = resolve(config, parameters);
  assert.equal(result.status, 'ready');
  const [contract] = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [result.node],
    capabilities: input.capabilities,
  });
  assert.deepEqual(nativeParameterProducerIds(contract), [...actual].sort());
  const plan = createNativeNodePlan({
    ...input,
    proposal: { nativeNodes: [result.node], gaps: [] },
  });
  assert.deepEqual(plan.nativeNodes[0].parameters, parameters);
  const outside = globalThis.structuredClone(parameters);
  outside.checks[0].left.nodeId = preparedNativeNodes[13].id;
  assert.throws(() => resolve(config, outside));
  const invalidPointer = globalThis.structuredClone(parameters);
  invalidPointer.checks[0].left.pointer = '/absent';
  assert.throws(() => resolve(config, invalidPointer));
  // Changing even an unused native source invalidates its original planning receipt.
  const changedSources = globalThis.structuredClone(preparedNativeNodes);
  changedSources[0].parameters.rows.push('changed source');
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...config,
        preparedNativeNodes: changedSources,
      }),
    /stale|modified/,
  );
  const receipt = globalThis.structuredClone(dependencies);
  receipt.context.preparedOutputs[0].schema.properties.id.type = 'number';
  assert.throws(
    () => describeNativeNodeConfiguration({ ...config, dependencies: receipt }),
    /stale/,
  );
  assert.equal(JSON.stringify(config), before);
});
