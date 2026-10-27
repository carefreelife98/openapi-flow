import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createNativeInstanceDependenciesSchema,
  describeNativeInstanceDependencies,
  resolveNativeInstanceDependencies,
  validateNativeInstanceDependencies,
  resolveNativeInstanceSelection,
  inspectNativeNodeConfigurationReadiness,
  describeNativeNodeConfiguration,
  createNativeNodeParametersSchema,
  resolveNativeNodeParameters,
} from '@openapi-flow/core';
import {
  planNativeInstanceDependencies,
  generateNativeNodeParameters,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import { nativeFeatureRegistryFixture } from './fixtures/native-feature-registry-fixture.mjs';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '../examples/langgraph-workflow/dist/public-api.js';
import {
  nativeDependencyFixture,
  nativeDependencyConfiguration,
  configureNativeDependency,
  nativeDependencyValues,
  nativeDependencyChoices,
  nativeDependencyCapabilities,
} from './fixtures/native-instance-dependencies-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

function selectedInput(f) {
  return { ...f.input, selection: f.selection };
}
function modelReply(output, calls = [], inspect) {
  return {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push({ schema, options, messages });
          if (inspect) inspect();
          if (output instanceof Error) throw output;
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

test('display dependency reasons do not change producer selection or weaken DAG checks', async () => {
  const f = nativeDependencyFixture({ explanations: true });
  for (const reason of [undefined, null, '', 7, { reason: 'not text' }]) {
    const proposal = globalThis.structuredClone(f.proposal);
    for (const row of Object.values(proposal.sourcesByNodeId)) {
      delete row.reason;
      if (reason !== undefined) row.reason = reason;
    }
    const calls = [];
    const result = await planNativeInstanceDependencies({
      ...selectedInput(f),
      model: modelReply(proposal, calls),
    });
    for (const [id, row] of Object.entries(result.proposal.sourcesByNodeId)) {
      assert.deepEqual(
        row.sourceNodeIds,
        f.proposal.sourcesByNodeId[id].sourceNodeIds,
      );
      assert.equal(Object.hasOwn(row, 'reason'), false);
    }
    assert.equal(calls.length, 1);
  }
  const invalid = globalThis.structuredClone(f.proposal);
  invalid.sourcesByNodeId[f.child.id].sourceNodeIds = ['unknown-producer'];
  await assert.rejects(
    planNativeInstanceDependencies({
      ...selectedInput(f),
      model: modelReply(invalid),
    }),
  );
});

test('registered producer-owned settings copy the chosen original IDs without a second model decision', async () => {
  const { apiMaterials } = await nativeFeatureRegistryFixture();
  const capabilities = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.GatherApiResponses],
  }).planningCapabilities;
  const input = {
    planId: 'producer-owned-results',
    scenario: 'Gather complete original responses from the two supplied calls.',
    apiMaterials,
    capabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.GatherApiResponses,
          purpose: 'Original results',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: {
      sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['right', 'left'] } },
    },
  });
  const before = globalThis.structuredClone(dependencies);
  const calls = [];
  const result = await generateNativeNodeParameters({
    ...input,
    selection,
    dependencies,
    nodeId,
    model: modelReply(new Error('No value choice remains'), calls),
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.node.parameters, {
    sourceNodeIds: ['right', 'left'],
  });
  assert.deepEqual(dependencies, before);
  assert.equal(calls.length, 0);
});

test('producer-owned settings use the registered contract, not a capability or parameter name convention', async () => {
  const { apiMaterials } = await nativeFeatureRegistryFixture();
  const parametersSchema = z.strictObject({
    chosen: z.array(z.string()).min(1),
  });
  for (const invalid of [false, true]) {
    const capability = {
      name: 'custom-producer-collector',
      description: 'Use the explicitly selected complete responses.',
      parametersSchema,
      parametersFromProducerDependencies: (ids) => ({
        chosen: invalid ? ['left'] : [...ids],
      }),
      parameterReferenceSources: ['response'],
      parameterReferenceBindings: (parameters) =>
        parametersSchema.parse(parameters).chosen.map((nodeId, index) => ({
          nodeIdPointer: `/chosen/${index}`,
          reference: { source: 'response', nodeId, pointer: '' },
        })),
      responseReferences: (parameters) =>
        parametersSchema.parse(parameters).chosen.map((nodeId) => ({
          source: 'response',
          nodeId,
          pointer: '',
        })),
      inputPorts: (parameters) =>
        parametersSchema
          .parse(parameters)
          .chosen.map((_, index) => `input${index + 1}`),
      outputPorts: () => ['main'],
      waitsForAllInputs: true,
      exclusiveOutputPorts: false,
    };
    const input = {
      planId: `custom-producer-${invalid}`,
      scenario: 'Gather both complete supplied responses.',
      apiMaterials,
      capabilities: [capability],
    };
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: capability.name,
            purpose: 'Original results',
            parameterSource: 'literal',
          },
        ],
        gaps: [],
      },
    });
    const nodeId = selection.instances[0].id;
    const dependencies = resolveNativeInstanceDependencies({
      ...input,
      selection,
      proposal: {
        sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['right', 'left'] } },
      },
    });
    const calls = [];
    const execute = () =>
      generateNativeNodeParameters({
        ...input,
        selection,
        dependencies,
        nodeId,
        model: modelReply(new Error('No model decision remains'), calls),
      });
    if (invalid) await assert.rejects(execute, /exactly match/);
    else
      assert.deepEqual((await execute()).node.parameters, {
        chosen: ['right', 'left'],
      });
    assert.equal(calls.length, 0);
  }
});

test('dependency row keys and source enums contain only actual original IDs, with no future output schemas', () => {
  const f = nativeDependencyFixture({ withPrepared: true, explanations: true });
  const input = selectedInput(f),
    context = describeNativeInstanceDependencies(input);
  assert.deepEqual(
    context.preparedOutputs.map((output) => output.nodeId),
    ['unrelated-existing'],
  );
  assert.deepEqual(
    context.instances.map((node) => node.id),
    [f.child.id, f.parent.id, f.source.id],
  );
  for (const node of context.instances) {
    assert.equal(
      context.sourceCandidatesByNodeId[node.id].includes(node.id),
      false,
    );
    assert.equal(
      context.sourceCandidatesByNodeId[node.id].includes('unrelated-existing'),
      node.id !== f.source.id,
    );
    assert.equal(Object.hasOwn(node, 'outputSchema'), false);
  }
  const schema = createNativeInstanceDependenciesSchema(input);
  assert.deepEqual(schema.parse(f.proposal), f.proposal);
  const original = globalThis.structuredClone(f.selection);
  assert.deepEqual(
    validateNativeInstanceDependencies({
      ...input,
      dependencies: f.dependencies,
    }),
    f.dependencies,
  );
  assert.deepEqual(f.selection, original);
});

test('missing/foreign rows, unknown/self/duplicate producers, metadata and dependency cycles fail without repair', () => {
  const f = nativeDependencyFixture(),
    input = selectedInput(f);
  const invalid = [];
  let proposal = globalThis.structuredClone(f.proposal);
  delete proposal.sourcesByNodeId[f.source.id];
  invalid.push(proposal);
  proposal = globalThis.structuredClone(f.proposal);
  proposal.sourcesByNodeId.extra = { sourceNodeIds: [] };
  invalid.push(proposal);
  for (const ids of [['invented'], [f.child.id], [f.parent.id, f.parent.id]]) {
    proposal = globalThis.structuredClone(f.proposal);
    proposal.sourcesByNodeId[f.child.id].sourceNodeIds = ids;
    invalid.push(proposal);
  }
  proposal = globalThis.structuredClone(f.proposal);
  proposal.sourcesByNodeId[f.source.id].sourceNodeIds = [f.child.id];
  invalid.push(proposal);
  proposal = globalThis.structuredClone(f.proposal);
  proposal.sourcesByNodeId[f.parent.id].sourceNodeIds = [f.child.id];
  invalid.push(proposal);
  proposal = globalThis.structuredClone(f.proposal);
  proposal.edges = [];
  invalid.push(proposal);
  for (const entry of invalid)
    assert.throws(() =>
      resolveNativeInstanceDependencies({ ...input, proposal: entry }),
    );
});

test('a consumer waits for its chosen producer even when unrelated outputs satisfy the old constructor count', () => {
  const f = nativeDependencyFixture({ withPrepared: true });
  const source = configureNativeDependency(f, f.source, nativeDependencyValues);
  const pending = inspectNativeNodeConfigurationReadiness(
    nativeDependencyConfiguration(f, f.child, [source]),
  );
  assert.equal(pending.status, 'awaiting-materials');
  assert.deepEqual(pending.pendingSourceNodeIds, [f.parent.id]);
  assert.deepEqual(pending.missingContext, [
    { field: 'nativeOutputs', minimumItems: 1, availableItems: 0 },
  ]);
  const parent = configureNativeDependency(
    f,
    f.parent,
    { sourceNodeId: source.id, pointer: '/groups' },
    [source],
  );
  const input = nativeDependencyConfiguration(f, f.child, [source, parent]);
  const description = describeNativeNodeConfiguration(input);
  assert.deepEqual(
    description.outputs.map((output) => output.nodeId),
    [parent.id],
  );
  assert.deepEqual(
    description.configuredNodes.map((node) => node.id),
    [parent.id],
  );
  assert.deepEqual(description.context.preparedNativeNodes, []);
  assert.deepEqual(
    description.instance.literalParametersSchema.properties.sourceNodeId.enum,
    [parent.id],
  );
  assert.equal(
    createNativeNodeParametersSchema(input).safeParse({
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: source.id, pointer: '/groups' },
      },
    }).success,
    false,
  );
  assert.equal(
    configureNativeDependency(
      f,
      f.child,
      { sourceNodeId: parent.id, pointer: '/item/children' },
      [source, parent],
    ).id,
    f.child.id,
  );
});

test('an explicit empty producer choice never exposes all available sources or tolerates unused declared references', () => {
  const f = nativeDependencyFixture({ withPrepared: true });
  const input = nativeDependencyConfiguration(f, f.source);
  const description = describeNativeNodeConfiguration(input);
  assert.deepEqual(description.outputs, []);
  assert.deepEqual(description.context.preparedNativeNodes, []);
  const changed = globalThis.structuredClone(f.proposal);
  changed.sourcesByNodeId[f.source.id].sourceNodeIds = ['unrelated-existing'];
  assert.throws(() =>
    resolveNativeInstanceDependencies({
      ...selectedInput(f),
      proposal: changed,
    }),
  );
});

test('completed supplied consumers cannot substitute a different available producer with the same schema', async () => {
  const f = nativeDependencyFixture({ withPrepared: true });
  const source = configureNativeDependency(f, f.source, nativeDependencyValues);
  const parent = configureNativeDependency(
    f,
    f.parent,
    { sourceNodeId: source.id, pointer: '/groups' },
    [source],
  );
  const altered = {
    ...parent,
    parameters: { ...parent.parameters, sourceNodeId: 'unrelated-existing' },
  };
  const calls = [];
  await assert.rejects(
    generateNativeNodeParameters({
      ...nativeDependencyConfiguration(f, f.child, [source, altered]),
      model: modelReply({}, calls),
    }),
    /actual parameter references must exactly match/,
  );
  assert.equal(calls.length, 0);
});

test('selected OAS producers narrow both API value schemas and model-visible contracts without changing the original OAS', async () => {
  const apiMaterials = (await nativeFeatureRegistryFixture()).apiMaterials;
  const original = globalThis.structuredClone(apiMaterials);
  const input = {
    planId: 'selected-api-producers',
    scenario: 'Collect only the right API response.',
    apiMaterials,
    capabilities: resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.CollectApiResponses],
    }).planningCapabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.CollectApiResponses,
          purpose: 'right responses',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const nodeId = selection.instances[0].id;
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal: {
      sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['right'] } },
    },
  });
  const config = { ...input, selection, nodeId, dependencies };
  assert.deepEqual(inspectNativeNodeConfigurationReadiness(config), {
    status: 'ready',
    nodeId,
  });
  const description = describeNativeNodeConfiguration(config);
  assert.deepEqual(
    description.context.apiMaterials.map((source) => source.callId),
    ['right'],
  );
  assert.deepEqual(
    description.instance.literalParametersSchema.properties.sourceNodeId.enum,
    ['right'],
  );
  assert.equal(
    resolveNativeNodeParameters({
      ...config,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          parameters: { sourceNodeId: 'right', pointer: '' },
        },
      },
    }).status,
    'ready',
  );
  assert.equal(
    createNativeNodeParametersSchema(config).safeParse({
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: 'left', pointer: '' },
      },
    }).success,
    false,
  );
  assert.deepEqual(apiMaterials, original);
});

test('changed dependency choices invalidate old question fingerprints and altered receipts fail before model calls', async () => {
  const f = nativeDependencyFixture();
  const source = configureNativeDependency(f, f.source, nativeDependencyValues);
  const parent = configureNativeDependency(
    f,
    f.parent,
    { sourceNodeId: source.id, pointer: '/groups' },
    [source],
  );
  const input = nativeDependencyConfiguration(f, f.child, [source, parent]);
  const question = resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: {
      decision: {
        status: 'needs-clarification',
        message: 'Which child array pointer?',
      },
    },
  });
  const changed = globalThis.structuredClone(f.proposal);
  changed.sourcesByNodeId[f.child.id].sourceNodeIds = [source.id];
  const dependencies = resolveNativeInstanceDependencies({
    ...selectedInput(f),
    proposal: changed,
  });
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...input,
        dependencies,
        replies: [{ question, text: 'Use /item/children.' }],
      }),
    /stale, out of order/,
  );
  const altered = globalThis.structuredClone(f.dependencies);
  altered.id += '-changed';
  const calls = [];
  await assert.rejects(
    generateNativeNodeParameters({
      ...input,
      dependencies: altered,
      model: modelReply({}, calls),
    }),
    /dependency plan is stale/,
  );
  assert.equal(calls.length, 0);
});

test('the LangChain stage sends valid constrained JSON Schema and returns only producer choices once', async () => {
  const f = nativeDependencyFixture({ explanations: true }),
    calls = [];
  const result = await planNativeInstanceDependencies({
    ...selectedInput(f),
    model: modelReply(f.proposal, calls),
  });
  assert.deepEqual(result, f.dependencies);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.options.name, 'plan_native_instance_dependencies');
  assert.ok(call.messages[0] instanceof SystemMessage);
  assert.ok(call.messages[1] instanceof HumanMessage);
  const validate = new Ajv2020({ strict: false }).compile(call.schema);
  assert.equal(validate(f.proposal), true);
  const bad = globalThis.structuredClone(f.proposal);
  bad.sourcesByNodeId[f.child.id].sourceNodeIds = ['invented'];
  assert.equal(validate(bad), false);
  assert.deepEqual(Object.keys(call.schema.properties), ['sourcesByNodeId']);
});

test('no available producer choices require zero model calls; transport and concurrent-source errors are preserved', async () => {
  const f = nativeDependencyFixture();
  const input = { ...f.input, preparedNativeNodes: [] };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: { instances: [nativeDependencyChoices()[2]], gaps: [] },
  });
  const result = await planNativeInstanceDependencies({ ...input, selection });
  assert.deepEqual(result.proposal, {
    sourcesByNodeId: { [selection.instances[0].id]: { sourceNodeIds: [] } },
  });
  const failure = new Error('original dependency transport error');
  await assert.rejects(
    planNativeInstanceDependencies({
      ...selectedInput(f),
      model: modelReply(failure),
    }),
    (error) => error === failure,
  );
  const mutable = selectedInput(f);
  await assert.rejects(
    planNativeInstanceDependencies({
      ...mutable,
      model: modelReply(f.proposal, [], () => {
        mutable.capabilities[0].description += ' changed';
      }),
    }),
    (error) =>
      error instanceof NativeNodePlanningError &&
      error.failure.stage === 'dependency-plan' &&
      assert.deepEqual(error.failure.output, f.proposal) === undefined,
  );
});

function hostModel(options = {}) {
  const calls = [];
  let dependencyAttempts = 0;
  return {
    calls,
    withStructuredOutput(schema, config) {
      return {
        async invoke(messages) {
          const input = JSON.parse(messages[1].content);
          calls.push({ name: config.name, input, schema });
          if (config.name === 'select_native_node_instances')
            return { instances: nativeDependencyChoices(), gaps: [] };
          if (config.name === 'plan_native_instance_dependencies') {
            dependencyAttempts++;
            const [child, parent, source] = input.instances;
            return {
              sourcesByNodeId: {
                [child.id]: { sourceNodeIds: [parent.id] },
                [parent.id]: {
                  sourceNodeIds:
                    options.cycleFirst && dependencyAttempts === 1
                      ? [child.id]
                      : [source.id],
                },
                [source.id]: {
                  sourceNodeIds: [],
                },
              },
            };
          }
          if (config.name === 'generate_native_node_parameters') {
            if (input.target.capability.name === 'original-groups')
              return {
                decision:
                  options.ask && !input.replies?.length
                    ? {
                        status: 'needs-clarification',
                        message: '원본 groups 값을 알려주세요.',
                      }
                    : {
                        status: 'provided',
                        parameters: nativeDependencyValues,
                      },
              };
            assert.equal(input.outputs.length, 1);
            return {
              decision: {
                status: 'provided',
                parameters: {
                  sourceNodeId: input.outputs[0].nodeId,
                  pointer:
                    input.purpose === 'parent groups'
                      ? '/groups'
                      : '/item/children',
                },
              },
            };
          }
          if (config.name === 'plan_workflow_connections')
            return {
              edges: input.nativeNodes
                .filter(
                  (node) =>
                    node.capability === N8nNativeFeature.SplitNativeOutputArray,
                )
                .map((node) => ({
                  from: node.parameters.sourceNodeId,
                  output: 'main',
                  to: node.id,
                  input: 'main',
                })),
              additionalGaps: [],
            };
          throw new Error('Unexpected model stage ' + config.name);
        },
      };
    },
  };
}

for (const [name, create] of [
  ['orchestrated', createOrchestratedWorkflowGenerationGraph],
  ['conversational', createConversationalWorkflowGenerationGraph],
]) {
  test(`${name} configures a reverse-selected three-role chain in dependency order with original HITL receipts`, async () => {
    const f = nativeDependencyFixture({ withPrepared: true }),
      model = hostModel({ ask: true });
    const graph = create({
      model,
      capabilities: f.input.capabilities,
      preparedNativeNodes: f.input.preparedNativeNodes,
      nativePlanning: { mode: 'staged', planDependencies: true },
      checkpointer: new MemorySaver(),
    });
    const config = {
      configurable: { thread_id: 'dependencies-' + name },
      recursionLimit: 100,
    };
    const paused = await graph.invoke(
      {
        workflowId: 'dependencies-' + name,
        workflowName: 'Explicit actual producer chain',
        scenario: f.input.scenario,
        sources: [],
        trace: [],
      },
      config,
    );
    const selection = JSON.stringify(paused.nativeSelection),
      dependencies = JSON.stringify(paused.nativeDependencies);
    assert.deepEqual(
      model.calls.map((call) => call.name),
      [
        'select_native_node_instances',
        'plan_native_instance_dependencies',
        'generate_native_node_parameters',
      ],
    );
    const question = paused.__interrupt__[0].value.questions[0];
    const complete = await graph.invoke(
      new Command({
        resume: {
          action: 'reply',
          questionId: question.id,
          text: 'groups는 children [0, false, "={{ literal child }}"]와 children [3]의 두 객체입니다.',
        },
      }),
      config,
    );
    assert.equal(complete.status, 'complete');
    assert.equal(JSON.stringify(complete.nativeSelection), selection);
    assert.equal(JSON.stringify(complete.nativeDependencies), dependencies);
    assert.deepEqual(
      model.calls
        .filter((call) => call.name === 'generate_native_node_parameters')
        .map((call) => call.input.purpose),
      ['original groups', 'original groups', 'parent groups', 'final children'],
    );
    const values = model.calls.filter(
      (call) => call.name === 'generate_native_node_parameters',
    );
    assert.deepEqual(values[0].input.outputs, []);
    assert.deepEqual(values[0].input.preparedNativeNodes, []);
    assert.ok(
      values
        .slice(2)
        .every(
          (call) =>
            call.input.outputs.length === 1 &&
            call.input.outputs[0].nodeId !== 'unrelated-existing',
        ),
    );
    assert.equal(
      complete.workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.splitOut',
      ).length,
      2,
    );
    assert.equal(
      complete.nativeConfigurations[0].result.node.capability,
      'original-groups',
    );
  });
}

test('a cyclic dependency result is checkpointed as failure; explicit retry repeats only that stage', async () => {
  const model = hostModel({ cycleFirst: true });
  const graph = createOrchestratedWorkflowGenerationGraph({
    model,
    capabilities: nativeDependencyCapabilities(),
    nativePlanning: { mode: 'staged', planDependencies: true },
    checkpointer: new MemorySaver(),
  });
  const config = {
    configurable: { thread_id: 'dependency-retry' },
    recursionLimit: 100,
  };
  await assert.rejects(
    graph.invoke(
      {
        workflowId: 'dependency-retry',
        workflowName: 'No hidden retry',
        scenario: nativeDependencyFixture().input.scenario,
        sources: [],
        trace: [],
      },
      config,
    ),
    /dependency cycle/,
  );
  assert.deepEqual(
    model.calls.map((call) => call.name),
    ['select_native_node_instances', 'plan_native_instance_dependencies'],
  );
  const complete = await graph.invoke(null, config);
  assert.equal(complete.status, 'complete');
  assert.equal(
    model.calls.filter((call) => call.name === 'select_native_node_instances')
      .length,
    1,
  );
  assert.equal(
    model.calls.filter(
      (call) => call.name === 'plan_native_instance_dependencies',
    ).length,
    2,
  );
});
