import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  resolveNativeInstanceSelection,
  describeNativeInstanceDependencies,
  resolveNativeInstanceDependencies,
  createNativeInstanceDependenciesSchema,
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
  describeWorkflowDraftNativeDependencies,
  createWorkflowDraftNativeDependenciesSchema,
  resolveWorkflowDraftNativeDependencies,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';
import { createWorkflowNodeContracts } from '../packages/core/dist/workflow/create-workflow-node-contracts.js';
import {
  planNativeInstanceDependencies,
  planWorkflowDraftNativeDependencies,
} from '@openapi-flow/langchain';
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import {
  nativeFeatureRegistryFixture,
  nativeFeatureParameters,
} from './fixtures/native-feature-registry-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const { z } = require('zod');

async function fixture() {
  const material = await nativeFeatureRegistryFixture();
  const registry = resolveN8nNativePlanningFeatures(material);
  const capabilities = registry.planningCapabilities;
  const preparedNativeNodes = [
    {
      id: 'context',
      capability: material.jsonOutput.name,
      parameters: nativeFeatureParameters[N8nNativeFeature.JsonOutput],
    },
    {
      id: 'prepared-if',
      capability: N8nNativeFeature.If,
      parameters: nativeFeatureParameters[N8nNativeFeature.If],
    },
  ];
  const input = {
    planId: 'reference-kind-eligibility',
    scenario: 'Use only actual supported parameter reference kinds.',
    capabilities,
    apiMaterials: material.apiMaterials,
    preparedNativeNodes,
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: capabilities.map((capability) => ({
        capability: capability.name,
        purpose: `Role for ${capability.name}`,
        parameterSource: 'literal',
      })),
      gaps: [],
    },
  });
  return { ...input, selection, material, registry };
}

const expectedKinds = {
  [N8nNativeFeature.If]: ['response'],
  [N8nNativeFeature.MergeAppend]: [],
  [N8nNativeFeature.AssertResponses]: ['response'],
  [N8nNativeFeature.StopAndError]: [],
  [N8nNativeFeature.PassThrough]: [],
  [N8nNativeFeature.RejoinExclusiveBranches]: ['exclusive-output'],
  [N8nNativeFeature.JsonOutput]: [],
  [N8nNativeFeature.SplitApiResponseArray]: ['response'],
  [N8nNativeFeature.CollectApiResponses]: ['response'],
  [N8nNativeFeature.SplitNativeOutputArray]: ['node-output'],
  [N8nNativeFeature.JoinApiItems]: ['response', 'node-output'],
};

test('all registered stable and bound native implementations explicitly declare the same supported reference kinds', async () => {
  const f = await fixture();
  assert.deepEqual(Object.keys(expectedKinds), Object.values(N8nNativeFeature));
  for (const registration of f.registry.planningRegistrations)
    assert.deepEqual(
      registration.capability.parameterReferenceSources,
      expectedKinds[registration.feature],
    );
  for (const registration of f.registry.registrations) {
    assert.equal(registration.status, 'ready');
    assert.deepEqual(
      registration.capability.parameterReferenceSources,
      expectedKinds[registration.feature],
    );
  }
});

test('standalone source choices distinguish actual API responses, native JSON and exclusive control from execution predecessors', async () => {
  const f = await fixture();
  const context = describeNativeInstanceDependencies(f);
  const byFeature = (feature) =>
    f.selection.instances.find((node) => node.capability === feature);
  assert.deepEqual(
    context.sourceCandidatesByNodeId[
      byFeature(N8nNativeFeature.MergeAppend).id
    ],
    [],
  );
  assert.deepEqual(
    context.sourceCandidatesByNodeId[
      byFeature(N8nNativeFeature.AssertResponses).id
    ],
    ['left', 'right'],
  );
  assert.deepEqual(
    context.sourceCandidatesByNodeId[
      byFeature(N8nNativeFeature.RejoinExclusiveBranches).id
    ],
    ['prepared-if', byFeature(N8nNativeFeature.If).id],
  );
  const nativeOnly =
    context.sourceCandidatesByNodeId[
      byFeature(N8nNativeFeature.SplitNativeOutputArray).id
    ];
  assert.ok(nativeOnly.includes('context'));
  assert.ok(
    nativeOnly.includes(byFeature(N8nNativeFeature.SplitApiResponseArray).id),
  );
  for (const id of [
    'left',
    'right',
    'prepared-if',
    byFeature(N8nNativeFeature.MergeAppend).id,
    byFeature(N8nNativeFeature.AssertResponses).id,
  ])
    assert.ok(!nativeOnly.includes(id));
  const joinIds =
    context.sourceCandidatesByNodeId[
      byFeature(N8nNativeFeature.JoinApiItems).id
    ];
  assert.ok(
    joinIds.includes('left') &&
      joinIds.includes('right') &&
      joinIds.includes('context'),
  );
  const proposal = {
    sourcesByNodeId: Object.fromEntries(
      f.selection.instances.map((node) => [node.id, { sourceNodeIds: [] }]),
    ),
  };
  const schema = createNativeInstanceDependenciesSchema(f);
  const wire = z.toJSONSchema(schema);
  const validate = new Ajv2020({ strict: false }).compile(wire);
  assert.equal(validate(proposal), true);
  const forged = globalThis.structuredClone(proposal);
  forged.sourcesByNodeId[
    byFeature(N8nNativeFeature.MergeAppend).id
  ].sourceNodeIds = ['left'];
  assert.equal(validate(forged), false);
  forged.sourcesByNodeId[
    byFeature(N8nNativeFeature.MergeAppend).id
  ].sourceNodeIds = [];
  forged.sourcesByNodeId[
    byFeature(N8nNativeFeature.AssertResponses).id
  ].sourceNodeIds = [byFeature(N8nNativeFeature.MergeAppend).id];
  assert.equal(validate(forged), false);
  assert.ok(!JSON.stringify(wire).includes('"not"'));
});

test('canonical edit roles use the same implementation eligibility before any value configuration or connection planning', async () => {
  const f = await fixture();
  const context = {
    operations: f.apiMaterials.map((material) => material.operation),
    capabilities: f.capabilities,
    messages: [
      {
        id: 'request',
        text: 'Merge the completed independent calls, then check both API response IDs.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'canonical-source-eligibility',
      apiCalls: f.apiMaterials.map((material) => ({
        id: material.callId,
        operation: material.operation.key,
        values: {},
        bindings: [],
      })),
      nativeNodes: f.preparedNativeNodes,
      requirements: [],
      edges: [],
    },
  });
  const input = {
    draft,
    context,
    requestMessageIds: ['request'],
    options: { includeExplanations: false },
  };
  const sources = [
    { kind: 'message', messageId: 'request', quote: context.messages[0].text },
  ];
  const plan = createWorkflowDraftEditPlan({
    ...input,
    proposal: {
      decisions: [
        N8nNativeFeature.MergeAppend,
        N8nNativeFeature.AssertResponses,
        N8nNativeFeature.RejoinExclusiveBranches,
      ].map((capability) => ({
        kind: 'add-native-node',
        capability,
        instruction: `Add ${capability}`,
        sources,
      })),
    },
  });
  const described = describeWorkflowDraftNativeDependencies({ ...input, plan });
  const [merge, checks, rejoin] = described.roles;
  assert.deepEqual(merge.parameterReferenceSources, []);
  assert.deepEqual(checks.parameterReferenceSources, ['response']);
  assert.deepEqual(described.sourceCandidatesByNodeId[merge.nodeId], []);
  assert.deepEqual(described.sourceCandidatesByNodeId[checks.nodeId], [
    'left',
    'right',
  ]);
  assert.deepEqual(described.sourceCandidatesByNodeId[rejoin.nodeId], [
    'prepared-if',
  ]);
  const proposal = {
    sourcesByNodeId: {
      [merge.nodeId]: { sourceNodeIds: [] },
      [checks.nodeId]: { sourceNodeIds: ['left', 'right'] },
      [rejoin.nodeId]: { sourceNodeIds: ['prepared-if'] },
    },
  };
  assert.deepEqual(
    createWorkflowDraftNativeDependenciesSchema({ ...input, plan }).parse(
      proposal,
    ),
    proposal,
  );
  proposal.sourcesByNodeId[merge.nodeId].sourceNodeIds = ['left'];
  assert.throws(() =>
    resolveWorkflowDraftNativeDependencies({ ...input, plan, proposal }),
  );
  const independentPlan = createWorkflowDraftEditPlan({
    ...input,
    proposal: {
      decisions: [
        {
          kind: 'add-native-node',
          capability: N8nNativeFeature.MergeAppend,
          instruction: 'Merge completed independent branches',
          sources,
        },
      ],
    },
  });
  let calls = 0;
  const independent = await planWorkflowDraftNativeDependencies({
    ...input,
    plan: independentPlan,
    model: {
      withStructuredOutput() {
        calls++;
        throw new Error('No source choices');
      },
    },
  });
  assert.deepEqual(
    independent.proposal.sourcesByNodeId[independentPlan.steps[0].newNodeId],
    { sourceNodeIds: [] },
  );
  assert.equal(calls, 0);
});

test('no-reference roles make zero model calls even with API/native producers; missing or invalid extension declarations fail before a model call', async () => {
  const f = await fixture();
  const selected = resolveNativeInstanceSelection({
    ...f,
    proposal: {
      instances: [
        {
          capability: N8nNativeFeature.MergeAppend,
          purpose: 'join independent branches',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  let calls = 0;
  const model = {
    withStructuredOutput() {
      calls++;
      throw new Error('No choices require no model');
    },
  };
  const result = await planNativeInstanceDependencies({
    ...f,
    selection: selected,
    model,
  });
  assert.deepEqual(result.proposal.sourcesByNodeId[selected.instances[0].id], {
    sourceNodeIds: [],
  });
  assert.equal(calls, 0);
  for (const declaration of [
    undefined,
    ['invented'],
    ['response', 'response'],
  ]) {
    const custom = {
      ...f.capabilities.find(
        (entry) => entry.name === N8nNativeFeature.MergeAppend,
      ),
      name: 'custom-merge',
    };
    if (declaration === undefined) delete custom.parameterReferenceSources;
    else custom.parameterReferenceSources = declaration;
    const input = {
      planId: 'missing-extension-contract',
      scenario: 'Use custom merge',
      apiMaterials: f.apiMaterials,
      capabilities: [custom],
    };
    if (declaration !== undefined) {
      assert.throws(() =>
        resolveNativeInstanceSelection({
          ...input,
          proposal: {
            instances: [
              {
                capability: custom.name,
                purpose: 'join',
                parameterSource: 'literal',
              },
            ],
            gaps: [],
          },
        }),
      );
      continue;
    }
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            capability: custom.name,
            purpose: 'join',
            parameterSource: 'literal',
          },
        ],
        gaps: [],
      },
    });
    await assert.rejects(
      planNativeInstanceDependencies({ ...input, selection, model }),
      /custom-merge\.parameterReferenceSources/,
    );
  }
  assert.equal(calls, 0);
});

test('unused selected API producers still fail actual-reference equality and a lying declaration cannot bypass implementation references', async () => {
  const f = await fixture();
  const capability = f.capabilities.find(
    (entry) => entry.name === N8nNativeFeature.AssertResponses,
  );
  const input = {
    planId: 'unused-supported-source',
    scenario: 'Compare explicit literals',
    apiMaterials: f.apiMaterials,
    capabilities: [capability],
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: capability.name,
          purpose: 'literal checks',
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
    proposal: { sourcesByNodeId: { [nodeId]: { sourceNodeIds: ['left'] } } },
  });
  const configuration = { ...input, selection, dependencies, nodeId };
  assert.throws(
    () =>
      resolveNativeNodeParameters({
        ...configuration,
        fingerprint: describeNativeNodeConfiguration(configuration).fingerprint,
        proposal: {
          decision: {
            status: 'provided',
            parameters:
              nativeFeatureParameters[N8nNativeFeature.AssertResponses],
          },
        },
      }),
    /actual parameter references must exactly match/,
  );
  const referenceNode = {
    id: 'checks',
    capability: capability.name,
    parameters: {
      checks: [
        {
          left: { source: 'response', nodeId: 'left', pointer: '/id' },
          operator: 'equals',
          right: { source: 'literal', value: 'expected' },
          message: 'ID differs',
        },
      ],
    },
  };
  assert.throws(
    () =>
      createWorkflowNodeContracts({
        materials: [],
        nativeNodes: [referenceNode],
        capabilities: [{ ...capability, parameterReferenceSources: [] }],
      }),
    /parameterReferenceSources contradicts actual references/,
  );
  const valid = createWorkflowNodeContracts({
    materials: [],
    nativeNodes: [referenceNode],
    capabilities: [capability],
  });
  assert.equal(valid[0].references[0].nodeId, 'left');
});
