import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import vm from 'node:vm';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '../examples/langgraph-workflow/dist/public-api.js';
import { z } from 'zod';
import {
  resolveNativeInstanceSelection,
  inspectNativeNodeConfigurationReadiness,
  describeNativeNodeConfiguration,
  createNativeNodeParametersSchema,
  resolveNativeNodeParameters,
  createNativeNodePlan,
  resolveNativeMaterialSnapshot,
  createWorkflowDraft,
  createNativeNodePlanningRecord,
  validateNativeNodePlanningRecord,
} from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
  createJsonOutputCapability,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';
import { generateNativeNodeParameters } from '@openapi-flow/langchain';
import {
  nativeFeatureRegistryFixture,
  nativeFeatureParameters,
} from './fixtures/native-feature-registry-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');

function fixture() {
  const capabilities = [
    ...resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.SplitNativeOutputArray],
    }).planningCapabilities,
    createJsonOutputCapability({
      name: 'typed-source',
      description: 'Original nested array data, unchanged.',
      parametersSchema: z.strictObject({
        groups: z.array(
          z.strictObject({
            children: z.array(z.union([z.number(), z.boolean(), z.string()])),
          }),
        ),
      }),
    }),
  ];
  const input = {
    planId: 'material-config',
    scenario: 'Split groups then their children, keeping each value unchanged.',
    capabilities,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.SplitNativeOutputArray,
          purpose: 'child items',
          parameterSource: 'literal',
        },
        {
          capability: N8nNativeFeature.SplitNativeOutputArray,
          purpose: 'parent groups',
          parameterSource: 'literal',
        },
        {
          capability: 'typed-source',
          purpose: 'original groups',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const [child, parent, source] = selection.instances;
  return { input, selection, child, parent, source };
}

function configure(fixture, instance, parameters, configuredNodes = []) {
  const input = {
    ...fixture.input,
    selection: fixture.selection,
    nodeId: instance.id,
    configuredNodes,
  };
  return resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: { decision: { status: 'provided', parameters } },
  }).node;
}

function completed() {
  const f = fixture();
  const source = configure(f, f.source, {
    groups: [{ children: [0, false, '={{ literal }}'] }],
  });
  const parent = configure(
    f,
    f.parent,
    { sourceNodeId: source.id, pointer: '/groups' },
    [source],
  );
  const child = configure(
    f,
    f.child,
    { sourceNodeId: parent.id, pointer: '/item/children' },
    [parent, source],
  );
  return { ...f, nodes: [child, parent, source] };
}

test('material prerequisites report actual completed outputs, not selected future roles; no model is called', async () => {
  const f = fixture();
  const input = { ...f.input, selection: f.selection, nodeId: f.parent.id };
  assert.deepEqual(inspectNativeNodeConfigurationReadiness(input), {
    status: 'awaiting-materials',
    nodeId: f.parent.id,
    capability: N8nNativeFeature.SplitNativeOutputArray,
    missingContext: [
      { field: 'nativeOutputs', minimumItems: 1, availableItems: 0 },
    ],
  });
  let calls = 0;
  await assert.rejects(
    generateNativeNodeParameters({
      ...input,
      model: {
        withStructuredOutput() {
          calls++;
          throw new Error('must not call');
        },
      },
    }),
    /requires nativeOutputs \(at least 1, available 0\)/,
  );
  assert.equal(calls, 0);
});

test('value schemas bind only actual producer IDs while original selection stays byte-for-byte unchanged', async () => {
  const f = fixture(),
    original = JSON.stringify(f.selection);
  const source = configure(f, f.source, { groups: [] });
  const input = {
    ...f.input,
    selection: f.selection,
    nodeId: f.parent.id,
    configuredNodes: [source],
  };
  assert.deepEqual(inspectNativeNodeConfigurationReadiness(input), {
    status: 'ready',
    nodeId: f.parent.id,
  });
  const schema = createNativeNodeParametersSchema(input);
  for (const sourceNodeId of [f.parent.id, f.child.id, 'invented'])
    assert.equal(
      schema.safeParse({
        decision: {
          status: 'provided',
          parameters: { sourceNodeId, pointer: '/groups' },
        },
      }).success,
      false,
    );
  let calls = 0;
  const result = await generateNativeNodeParameters({
    ...input,
    model: {
      withStructuredOutput(schema) {
        calls++;
        assert.deepEqual(
          schema.properties.decision.anyOf[0].properties.parameters.properties
            .sourceNodeId.enum,
          [source.id],
        );
        return {
          async invoke(messages) {
            const context = JSON.parse(messages[1].content);
            assert.deepEqual(
              context.outputs.map((output) => output.nodeId),
              [source.id],
            );
            assert.deepEqual(
              context.parametersSchema.properties.sourceNodeId.enum,
              [source.id],
            );
            return {
              decision: {
                status: 'provided',
                parameters: { sourceNodeId: source.id, pointer: '/groups' },
              },
            };
          },
        };
      },
    },
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(f.selection), original);
});

test('nested consumers resolve contracts in dependency order, not the selected or configured array order', () => {
  const f = completed();
  const plan = createNativeNodePlan({
    ...f.input,
    proposal: { nativeNodes: f.nodes, gaps: [] },
  });
  assert.deepEqual(plan.nativeNodes, f.nodes);
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: [],
    nativeOutputs: [],
    capabilities: f.input.capabilities,
    nativeNodes: f.nodes,
    deferredNodeIds: [],
  });
  assert.equal(snapshot.status, 'ready');
  const validate = new Ajv2020({ strict: false }).compile(
    snapshot.outputs.find((output) => output.nodeId === f.child.id).schema,
  );
  for (const item of [0, false, '={{ literal }}'])
    assert.equal(validate({ item }), true);
  for (const item of [null, [], {}]) assert.equal(validate({ item }), false);
});

test('planning records verify bound ports and outputs while retaining the original unbound selection material', () => {
  const f = completed();
  const plan = createNativeNodePlan({
    ...f.input,
    proposal: { nativeNodes: f.nodes, gaps: [] },
  });
  const record = createNativeNodePlanningRecord({
    ...f.input,
    plan,
    assessment: {
      kind: 'additions',
      nodes: f.nodes.map((node) => ({
        nodeId: node.id,
        reason: 'Use the explicitly selected actual producer contract.',
      })),
    },
  });
  assert.equal(record.verification.outputs.length, 3);
  assert.equal(record.verification.contracts.length, 3);
  assert.doesNotThrow(() =>
    validateNativeNodePlanningRecord({ ...f.input, plan, record }),
  );
  const changed = globalThis.structuredClone(record);
  changed.verification.outputs[0].schema = { type: 'null' };
  assert.throws(
    () =>
      validateNativeNodePlanningRecord({ ...f.input, plan, record: changed }),
    /differs from/,
  );
  assert.equal(
    record.evidence.context.capabilities.find(
      (capability) =>
        capability.name === N8nNativeFeature.SplitNativeOutputArray,
    ).parametersSchema.properties.sourceNodeId.type,
    'string',
  );
});

test('prepared source-dependent materials are bound from their real upstream before configuring a new consumer', () => {
  const f = completed();
  const input = {
    ...f.input,
    preparedNativeNodes: f.nodes.filter((node) => node.id !== f.child.id),
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.SplitNativeOutputArray,
          purpose: 'child items',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const config = { ...input, selection, nodeId: selection.instances[0].id };
  const description = describeNativeNodeConfiguration(config);
  assert.equal(description.outputs.length, 2);
  const result = resolveNativeNodeParameters({
    ...config,
    fingerprint: description.fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters: { sourceNodeId: f.parent.id, pointer: '/item/children' },
      },
    },
  });
  assert.equal(result.status, 'ready');
});

test('official SDK template compilation accepts the resulting source-bound plan without fabricated runtime names', () => {
  const f = completed();
  const context = {
    operations: [],
    capabilities: f.input.capabilities,
    messages: [],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'staged-materials',
      requirements: [],
      apiCalls: [],
      nativeNodes: f.nodes,
      edges: [
        { from: f.source.id, output: 'main', to: f.parent.id, input: 'main' },
        { from: f.parent.id, output: 'main', to: f.child.id, input: 'main' },
      ],
    },
  });
  const result = compileN8nWorkflowTemplate({
    draft,
    context,
    name: 'Actual nested native contracts',
    deployments: [],
  });
  assert.ok(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.splitOut',
    ),
  );
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.splitOut',
    ).length,
    2,
  );
  const expression = result.workflow.nodes.find(
    (node) => node.id === f.source.id,
  ).parameters.jsonOutput;
  assert.ok(expression.startsWith('={{ ') && expression.endsWith(' }}'));
  const actual = vm.runInNewContext(
    expression.slice(3, -3),
    {},
    { timeout: 1000 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(actual)),
    f.nodes.find((node) => node.id === f.source.id).parameters,
  );
});

test('actual API materials bind collection enums and retain original response contracts', async () => {
  const materials = (await nativeFeatureRegistryFixture()).apiMaterials;
  const input = {
    planId: 'api-material-config',
    scenario: 'Collect the supplied API responses unchanged.',
    apiMaterials: materials,
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
          purpose: 'response collection',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  const config = { ...input, selection, nodeId: selection.instances[0].id };
  const description = describeNativeNodeConfiguration(config);
  assert.deepEqual(
    description.instance.literalParametersSchema.properties.sourceNodeId.enum,
    materials.map((material) => material.callId),
  );
  assert.deepEqual(
    description.context.apiMaterials.map((material) => material.operation),
    materials.map((material) => material.operation.operation),
  );
  const result = resolveNativeNodeParameters({
    ...config,
    fingerprint: description.fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters:
          nativeFeatureParameters[N8nNativeFeature.CollectApiResponses],
      },
    },
  });
  assert.equal(result.status, 'ready');
  assert.throws(() =>
    resolveNativeNodeParameters({
      ...config,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          parameters: { sourceNodeId: 'not-provided', pointer: '' },
        },
      },
    }),
  );
});

test('invalid pointers and unknown producer nodes fail before accepting executable material', () => {
  const f = fixture(),
    source = configure(f, f.source, { groups: [] });
  assert.throws(() =>
    configure(f, f.parent, { sourceNodeId: source.id, pointer: '/missing' }, [
      source,
    ]),
  );
  assert.throws(() =>
    configure(f, f.parent, { sourceNodeId: 'invented', pointer: '/groups' }, [
      source,
    ]),
  );
  assert.throws(
    () =>
      describeNativeNodeConfiguration({
        ...f.input,
        selection: f.selection,
        nodeId: f.parent.id,
        configuredNodes: [{ ...source, id: 'not-selected' }],
      }),
    /distinct selected role/,
  );
});

test('configuration fingerprints reject changed completed values and retain original question receipts', () => {
  const f = fixture(),
    source = configure(f, f.source, { groups: [] });
  const input = {
    ...f.input,
    selection: f.selection,
    nodeId: f.parent.id,
    configuredNodes: [source],
  };
  const fingerprint = describeNativeNodeConfiguration(input).fingerprint;
  const question = resolveNativeNodeParameters({
    ...input,
    fingerprint,
    proposal: {
      decision: {
        status: 'needs-clarification',
        message: 'Which declared array should be split?',
      },
    },
  });
  assert.equal(question.status, 'needs-clarification');
  const answered = {
    ...input,
    replies: [{ question, text: 'Use /groups unchanged.' }],
  };
  const description = describeNativeNodeConfiguration(answered);
  assert.deepEqual(description.replies, answered.replies);
  const changed = {
    ...answered,
    configuredNodes: [
      { ...source, parameters: { groups: [{ children: [false] }] } },
    ],
  };
  assert.throws(
    () => describeNativeNodeConfiguration(changed),
    /stale, out of order/,
  );
  assert.throws(
    () =>
      resolveNativeNodeParameters({
        ...input,
        configuredNodes: changed.configuredNodes,
        fingerprint,
        proposal: {
          decision: {
            status: 'provided',
            parameters: { sourceNodeId: source.id, pointer: '/groups' },
          },
        },
      }),
    /fingerprint is stale/,
  );
});

test('constructor requirement mutations invalidate selection instead of silently changing scheduling policy', () => {
  const f = fixture();
  const changed = f.input.capabilities.map((capability) =>
    capability.name === N8nNativeFeature.SplitNativeOutputArray
      ? {
          ...capability,
          materialRequirements: [{ field: 'nativeOutputs', minimumItems: 2 }],
        }
      : capability,
  );
  assert.throws(
    () =>
      inspectNativeNodeConfigurationReadiness({
        ...f.input,
        capabilities: changed,
        selection: f.selection,
        nodeId: f.parent.id,
      }),
    /selection is stale/,
  );
});

for (const [name, create] of [
  ['orchestrated', createOrchestratedWorkflowGenerationGraph],
  ['conversational', createConversationalWorkflowGenerationGraph],
]) {
  test(`${name} schedules a producer before a constructor-dependent consumer and resumes its original question`, async () => {
    const f = fixture(),
      calls = [];
    const model = {
      withStructuredOutput(schema, options) {
        return {
          async invoke(messages) {
            const input = JSON.parse(messages[1].content);
            calls.push({ name: options.name, input, schema });
            if (options.name === 'select_native_node_instances')
              return {
                instances: [
                  {
                    capability: N8nNativeFeature.SplitNativeOutputArray,
                    purpose: 'parent groups',
                    parameterSource: 'literal',
                  },
                  {
                    capability: 'typed-source',
                    purpose: 'original groups',
                    parameterSource: 'literal',
                  },
                ],
                gaps: [],
              };
            if (options.name === 'generate_native_node_parameters') {
              if (input.target.capability.name === 'typed-source')
                return {
                  decision: input.replies?.length
                    ? {
                        status: 'provided',
                        parameters: {
                          groups: [{ children: [0, false, '={{ literal }}'] }],
                        },
                      }
                    : {
                        status: 'needs-clarification',
                        message: '원본 groups 값을 알려주세요.',
                      },
                };
              assert.equal(input.outputs.length, 1);
              return {
                decision: {
                  status: 'provided',
                  parameters: {
                    sourceNodeId: input.outputs[0].nodeId,
                    pointer: '/groups',
                  },
                },
              };
            }
            if (options.name === 'plan_workflow_connections') {
              const source = input.nativeNodes.find(
                (node) => node.capability === 'typed-source',
              );
              const consumer = input.nativeNodes.find(
                (node) =>
                  node.capability === N8nNativeFeature.SplitNativeOutputArray,
              );
              return {
                edges: [
                  {
                    from: source.id,
                    output: 'main',
                    to: consumer.id,
                    input: 'main',
                  },
                ],
                additionalGaps: [],
              };
            }
            throw new Error('Unexpected stage ' + options.name);
          },
        };
      },
    };
    const graph = create({
      model,
      capabilities: f.input.capabilities,
      checkpointer: new MemorySaver(),
      nativePlanning: { mode: 'staged' },
    });
    const config = {
      configurable: { thread_id: 'source-dependent-' + name },
      recursionLimit: 100,
    };
    const paused = await graph.invoke(
      {
        workflowId: 'dependent-' + name,
        workflowName: 'Actual source contract',
        scenario: f.input.scenario,
        sources: [],
        trace: [],
      },
      config,
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[1].input.target.capability.name, 'typed-source');
    const selection = JSON.stringify(paused.nativeSelection);
    const question = paused.__interrupt__[0].value.questions[0];
    const result = await graph.invoke(
      new Command({
        resume: {
          action: 'reply',
          questionId: question.id,
          text: 'groups는 children에 숫자 0, false, 문자열 ={{ literal }}이 들어 있는 객체 하나입니다.',
        },
      }),
      config,
    );
    assert.equal(result.status, 'complete');
    assert.equal(JSON.stringify(result.nativeSelection), selection);
    assert.deepEqual(
      calls.map((call) => call.name),
      [
        'select_native_node_instances',
        'generate_native_node_parameters',
        'generate_native_node_parameters',
        'generate_native_node_parameters',
        'plan_workflow_connections',
      ],
    );
    assert.equal(
      result.workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.splitOut',
      ).length,
      1,
    );
    assert.equal(result.nativeConfigurations.length, 2);
    assert.ok(
      result.nativeConfigurations.every(
        (task) => task.result.status === 'ready',
      ),
    );
    assert.ok(
      result.nativeConfigurations[1].configuredNodes.some(
        (node) => node.capability === 'typed-source',
      ),
    );
  });
}

test('a stalled constructor worklist names missing actual contracts before any value call', async () => {
  const f = fixture();
  let calls = 0;
  const graph = createOrchestratedWorkflowGenerationGraph({
    model: {
      withStructuredOutput() {
        return {
          async invoke() {
            calls++;
            return {
              instances: [
                {
                  capability: N8nNativeFeature.SplitNativeOutputArray,
                  purpose: 'no supplied producer',
                  parameterSource: 'literal',
                },
              ],
              gaps: [],
            };
          },
        };
      },
    },
    capabilities: f.input.capabilities.slice(0, 1),
    checkpointer: new MemorySaver(),
    nativePlanning: { mode: 'staged' },
  });
  await assert.rejects(
    graph.invoke(
      {
        workflowId: 'no-output',
        workflowName: 'No fabricated source',
        scenario: 'Split a native array.',
        sources: [],
        trace: [],
      },
      { configurable: { thread_id: 'no-source-output' } },
    ),
    /require unavailable completed material contracts.*nativeOutputs/,
  );
  assert.equal(calls, 1);
});
