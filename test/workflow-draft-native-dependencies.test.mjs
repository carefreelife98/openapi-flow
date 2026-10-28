import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { MemorySaver, Command } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftNativeDependencies,
  createWorkflowDraftNativeDependenciesSchema,
  resolveWorkflowDraftNativeDependencies,
  validateWorkflowDraftNativeDependencies,
  validateWorkflowDraftNativeDependencyResolutions,
  describeWorkflowDraftNativeNodeAdditionReadiness,
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
  createWorkflowDraftNativeNodeAdditionSchema,
  createWorkflowDraftEditPlan,
  assembleWorkflowDraftEdit,
  resolveWorkflowDraftTerminalRemoval,
  createWorkflowDraft,
} from '@openapi-flow/core';
import {
  planWorkflowDraftNativeDependencies,
  WorkflowDraftNativeNodeAdditionPlanningError,
} from '@openapi-flow/langchain';
import { createWorkflowDraftConversationGraph } from '../examples/langgraph-workflow/dist/public-api.js';
import {
  draftNativeDependencyBase,
  draftNativeDependencyFixture,
  draftNativeAddition,
  completedDraftNativeDependencies,
  draftNativeModel,
} from './fixtures/workflow-draft-native-dependencies-fixture.mjs';
import {
  nativeDependencyValues,
  nativeDependencyChoices,
} from './fixtures/native-instance-dependencies-fixture.mjs';
import {
  conversationTurn,
  conversationBoundary,
  conversationSemantic,
  conversationEvidence,
} from './fixtures/workflow-draft-conversation-fixture.mjs';
import { addConnection } from './fixtures/workflow-draft-connection-edit-fixture.mjs';
import { nativeNodeAdditionFixture } from './fixtures/workflow-draft-native-node-addition-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';

const require = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const clone = (value) => globalThis.structuredClone(value);

test('draft producer choices use code-allocated addition IDs, original source contracts and strict rows, without value/edge generation', async () => {
  const f = draftNativeDependencyFixture({ includeExplanations: true });
  const description = describeWorkflowDraftNativeDependencies(f);
  assert.deepEqual(
    description.roles.map((role) => role.nodeId),
    [f.child.newNodeId, f.parent.newNodeId, f.source.newNodeId],
  );
  assert.deepEqual(
    description.sources.values.map((source) => source.nodeId),
    ['unrelated-existing'],
  );
  assert.ok(
    description.sourceCandidatesByNodeId[f.child.newNodeId].includes(
      'unrelated-existing',
    ),
  );
  assert.ok(
    !description.sourceCandidatesByNodeId[f.child.newNodeId].includes(
      f.child.newNodeId,
    ),
  );
  for (const role of description.roles)
    assert.equal(Object.hasOwn(role, 'schema'), false);
  assert.deepEqual(
    createWorkflowDraftNativeDependenciesSchema(f).parse(f.proposal),
    f.proposal,
  );
  const calls = [];
  const result = await planWorkflowDraftNativeDependencies({
    ...f,
    model: draftNativeModel(() => f.proposal, calls),
  });
  assert.deepEqual(result, f.producerDependencies);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].messages[0] instanceof SystemMessage);
  assert.ok(calls[0].messages[1] instanceof HumanMessage);
  assert.equal(calls[0].options.strict, true);
  const ajv = new Ajv2020({ strict: false });
  assert.equal(
    ajv.validateSchema(calls[0].schema),
    true,
    JSON.stringify(ajv.errors),
  );
  assert.equal(ajv.compile(calls[0].schema)(f.proposal), true);
  for (const mutate of [
    (p) => {
      delete p.sourcesByNodeId[f.source.newNodeId];
    },
    (p) => {
      p.sourcesByNodeId.extra = { sourceNodeIds: [] };
    },
    (p) => {
      p.sourcesByNodeId[f.child.newNodeId].sourceNodeIds = [f.child.newNodeId];
    },
    (p) => {
      p.sourcesByNodeId[f.child.newNodeId].sourceNodeIds = ['unknown'];
    },
    (p) => {
      p.sourcesByNodeId[f.child.newNodeId].sourceNodeIds = [
        f.parent.newNodeId,
        f.parent.newNodeId,
      ];
    },
    (p) => {
      p.sourcesByNodeId[f.source.newNodeId].sourceNodeIds = [f.child.newNodeId];
    },
    (p) => {
      p.edges = [];
    },
  ]) {
    const proposal = clone(f.proposal);
    mutate(proposal);
    assert.throws(() =>
      resolveWorkflowDraftNativeDependencies({ ...f, proposal }),
    );
  }
});

test('draft consumers wait for the chosen producer, not an unrelated available output; value schemas expose only chosen sources', () => {
  const f = draftNativeDependencyFixture();
  const pending = describeWorkflowDraftNativeNodeAdditionReadiness({
    ...f,
    stepId: f.child.id,
  });
  assert.equal(pending.status, 'requires-context');
  assert.deepEqual(pending.pendingSourceNodeIds, [f.parent.newNodeId]);
  assert.equal(pending.missingContext[0].availableItems, 0);
  assert.throws(
    () => describeWorkflowDraftNativeNodeAddition({ ...f, stepId: f.child.id }),
    /pending selected producers/,
  );
  const independent = describeWorkflowDraftNativeNodeAddition({
    ...f,
    stepId: f.source.id,
  });
  assert.deepEqual(independent.sources.values, []);
  const complete = completedDraftNativeDependencies(f);
  const input = {
    ...f,
    stepId: f.child.id,
    resolutions: [complete.source.resolution, complete.parent.resolution],
  };
  const description = describeWorkflowDraftNativeNodeAddition(input);
  assert.deepEqual(
    description.sources.values.map((source) => source.nodeId),
    [f.parent.newNodeId],
  );
  assert.deepEqual(description.parametersSchema.properties.sourceNodeId.enum, [
    f.parent.newNodeId,
  ]);
  const invalid = {
    decision: {
      status: 'provided',
      parameters: { sourceNodeId: 'unrelated-existing', pointer: '/groups' },
      sourceMessageIds: f.requestMessageIds,
    },
  };
  assert.equal(
    createWorkflowDraftNativeNodeAdditionSchema(input).safeParse(invalid)
      .success,
    false,
  );
  assert.deepEqual(
    validateWorkflowDraftNativeDependencies({
      ...f,
      resolutions: complete.resolutions,
    }),
    f.producerDependencies,
  );
  assert.doesNotThrow(() =>
    validateWorkflowDraftNativeDependencyResolutions({
      ...f,
      resolutions: complete.resolutions,
    }),
  );
  assert.deepEqual(
    complete.source.resolution.parameters,
    nativeDependencyValues,
  );
});

test('ineligible producers and injected schema-identical substitutions fail in Core, including direct final assembly inputs', () => {
  const f = draftNativeDependencyFixture();
  const proposal = clone(f.proposal);
  proposal.sourcesByNodeId[f.source.newNodeId].sourceNodeIds = [
    'unrelated-existing',
  ];
  assert.throws(() =>
    resolveWorkflowDraftNativeDependencies({ ...f, proposal }),
  );
  const complete = completedDraftNativeDependencies(f);
  const changed = clone(complete.resolutions);
  changed.find(
    (resolution) => resolution.stepId === f.parent.id,
  ).parameters.sourceNodeId = 'unrelated-existing';
  assert.throws(
    () =>
      validateWorkflowDraftNativeDependencyResolutions({
        ...f,
        resolutions: changed,
      }),
    /sourceNodeId|actual parameter references must be a subset/,
  );
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...f, resolutions: changed }),
    /sourceNodeId|actual parameter references must be a subset/,
  );
  assert.throws(
    () => validateWorkflowDraftNativeDependencyResolutions(f),
    /no completed addition/,
  );
});

test('producer receipt and per-value original snapshots reject tampering, cross-plan reuse and stale questions', () => {
  const f = draftNativeDependencyFixture();
  for (const mutate of [
    (receipt) => {
      receipt.id = 'invented';
    },
    (receipt) => {
      receipt.context.roles.reverse();
    },
    (receipt) => {
      receipt.proposal.sourcesByNodeId[f.child.newNodeId].sourceNodeIds = [
        f.source.newNodeId,
      ];
    },
  ]) {
    const producerDependencies = clone(f.producerDependencies);
    mutate(producerDependencies);
    assert.throws(
      () =>
        validateWorkflowDraftNativeDependencies({ ...f, producerDependencies }),
      /stale/,
    );
  }
  assert.throws(
    () =>
      validateWorkflowDraftNativeDependencies({
        ...f,
        requestMessageIds: ['other'],
      }),
    /stale|request/i,
  );
  const scoped = { ...f, stepId: f.source.id };
  const fingerprint =
    describeWorkflowDraftNativeNodeAddition(scoped).fingerprint;
  const source = draftNativeAddition(f, f.source, nativeDependencyValues);
  assert.throws(
    () =>
      resolveWorkflowDraftNativeNodeAddition({
        ...scoped,
        resolutions: [source.resolution],
        fingerprint,
        proposal: {
          decision: {
            status: 'provided',
            parameters: nativeDependencyValues,
            sourceMessageIds: f.requestMessageIds,
          },
        },
      }),
    /already has an explicit result/,
  );
  const plain = { ...f, producerDependencies: undefined, stepId: f.source.id };
  assert.notEqual(
    describeWorkflowDraftNativeNodeAddition(plain).fingerprint,
    fingerprint,
  );
});

test('draft dependency model boundary has no hidden retries, preserves transport failures, and rejects concurrent source changes', async () => {
  const f = draftNativeDependencyFixture();
  const transport = new Error('original model transport failure');
  const calls = [];
  await assert.rejects(
    planWorkflowDraftNativeDependencies({
      ...f,
      model: draftNativeModel(() => {
        throw transport;
      }, calls),
    }),
    (error) => error === transport,
  );
  assert.equal(calls.length, 1);
  const output = { sourcesByNodeId: {} };
  await assert.rejects(
    planWorkflowDraftNativeDependencies({
      ...f,
      model: draftNativeModel(() => output),
    }),
    (error) =>
      error instanceof WorkflowDraftNativeNodeAdditionPlanningError &&
      error.failure.output === output &&
      error.failure.stage === 'producer-dependencies',
  );
  await assert.rejects(
    planWorkflowDraftNativeDependencies({
      ...f,
      model: draftNativeModel(() => {
        f.context.messages[0].text += ' changed';
        return f.proposal;
      }),
    }),
    /stale|changed/,
  );
});

test('no-choice plans make zero producer model calls, and pending API requests still expose original OAS response contracts', async () => {
  const f = draftNativeDependencyFixture({ withPrepared: false });
  const plan = createWorkflowDraftEditPlan({
    ...f,
    options: { includeExplanations: false },
    proposal: { decisions: [f.source.decision] },
  });
  const ready = await planWorkflowDraftNativeDependencies({ ...f, plan });
  assert.deepEqual(ready.proposal, {
    sourcesByNodeId: { [plan.steps[0].newNodeId]: { sourceNodeIds: [] } },
  });
  const base = await nativeNodeAdditionFixture('if');
  const operation = base.context.operations.find(
    (operation) => operation.path === '/replacement/{id}',
  );
  const apiPlan = connectionEditPlan(base, [
    { kind: 'add-api-call', operation: operation.key },
    { kind: 'add-native-node', capability: 'if' },
  ]);
  const [api, conditional] = apiPlan.steps;
  const input = {
    ...base,
    plan: apiPlan,
    stepId: conditional.id,
    resolutions: [],
  };
  const producerDependencies = resolveWorkflowDraftNativeDependencies({
    ...input,
    proposal: {
      sourcesByNodeId: {
        [conditional.newNodeId]: { sourceNodeIds: [api.newNodeId] },
      },
    },
  });
  const scoped = { ...input, producerDependencies };
  const description = describeWorkflowDraftNativeNodeAddition(scoped);
  assert.equal(description.sources.values.length, 1);
  assert.equal(description.sources.values[0].nodeId, api.newNodeId);
  assert.equal(
    description.sources.values[0].preparation.status,
    'request-pending',
  );
  assert.deepEqual(description.sources.values[0].operation, operation);
  assert.equal(
    describeWorkflowDraftNativeNodeAdditionReadiness(scoped).status,
    'ready',
  );
});

function hostFixture({
  reviewPolicy = 'review',
  cyclic = false,
  failValue = false,
  askValue = false,
} = {}) {
  const base = draftNativeDependencyBase();
  const calls = [];
  let choices;
  let roles;
  let mode = 'add';
  let fail = failValue;
  let cycle = cyclic;
  let ask = askValue;
  const transport = new Error('value model temporarily unavailable');
  const model = draftNativeModel((call) => {
    const p = call.payload;
    if (call.name === 'analyze_workflow_draft_edit') {
      if (mode === 'remove')
        return {
          decisions: [
            conversationSemantic(call, {
              kind: 'remove-node',
              nodeId: roles[0].nodeId,
            }),
          ],
        };
      return {
        decisions: nativeDependencyChoices().map((role) =>
          conversationSemantic(
            call,
            { kind: 'add-native-node', capability: role.capability },
            role.purpose,
          ),
        ),
      };
    }
    if (call.name === 'plan_draft_native_dependencies') {
      roles = clone(p.roles);
      const [child, parent, source] = roles;
      choices = {
        sourcesByNodeId: Object.fromEntries(
          [
            [child.nodeId, [parent.nodeId]],
            [parent.nodeId, cycle ? [child.nodeId] : [source.nodeId]],
            [source.nodeId, []],
          ].map(([id, sourceNodeIds]) => [
            id,
            {
              sourceNodeIds,
              ...(p.includeExplanations && p.sourceCandidatesByNodeId[id].length
                ? { reason: 'Use the requested preceding role only.' }
                : {}),
            },
          ]),
        ),
      };
      return choices;
    }
    if (call.name === 'generate_draft_native_node_addition') {
      if (fail) {
        fail = false;
        throw transport;
      }
      const selected = p.sourceDependencies.sourceNodeIds;
      assert.deepEqual(p.plannedNativeRoles, roles);
      assert.ok(
        p.plannedNativeRoles.some(
          (role) =>
            role.nodeId === p.nodeId &&
            role.stepId === p.stepId &&
            role.instruction === p.instruction,
        ),
      );
      assert.deepEqual(
        p.sourceCandidates.map((source) => source.nodeId),
        selected,
      );
      if (ask) {
        ask = false;
        return {
          decision: {
            status: 'needs-clarification',
            message: 'What original groups should be used?',
            sourceMessageIds: p.messages.map((message) => message.id),
            explanation: {
              reason: 'The required producer setting is not confirmed.',
              evidence: p.messages.map((message) => ({
                kind: 'message',
                messageId: message.id,
              })),
            },
          },
        };
      }
      return {
        decision: {
          status: 'provided',
          parameters:
            p.capability.name === 'original-groups'
              ? clone(nativeDependencyValues)
              : {
                  sourceNodeId: selected[0],
                  pointer:
                    p.instruction === 'parent groups'
                      ? '/groups'
                      : '/item/children',
                },
          sourceMessageIds: p.messages.map((message) => message.id),
          ...(p.includeExplanations
            ? {
                explanation: {
                  reason:
                    'Use the requested unchanged values and selected producer.',
                  evidence: p.messages.map((message) => ({
                    kind: 'message',
                    messageId: message.id,
                  })),
                },
              }
            : {}),
        },
      };
    }
    if (call.name === 'plan_draft_connection_edit')
      return {
        decisions:
          mode === 'remove'
            ? p.existingEdges
                .filter(
                  (entry) =>
                    entry.edge.from === roles[0].nodeId ||
                    entry.edge.to === roles[0].nodeId,
                )
                .map((entry) => ({
                  kind: 'remove',
                  edgeId: entry.id,
                  ...conversationEvidence(call),
                }))
            : [
                addConnection(roles[2].nodeId, roles[1].nodeId),
                addConnection(roles[1].nodeId, roles[0].nodeId),
              ].map((decision) => ({
                ...decision,
                ...conversationEvidence(call),
              })),
      };
    throw new Error(`Unexpected stage ${call.name}`);
  }, calls);
  const dependencies = {
    ...base,
    model,
    checkpointer: new MemorySaver(),
    name: 'Canonical explicit producer chain',
    reviewPolicy,
    itemMode: 'linked',
    planNativeDependencies: true,
    includeExplanations: true,
  };
  const graph = createWorkflowDraftConversationGraph(dependencies);
  const config = {
    configurable: { thread_id: randomUUID() },
    recursionLimit: 100,
  };
  return {
    ...base,
    graph,
    config,
    calls,
    transport,
    dependencies,
    roles: () => roles,
    setMode: (value) => {
      mode = value;
    },
    fixCycle: () => {
      cycle = false;
    },
  };
}

const approve = (result) =>
  new Command({
    resume: { action: 'approve', token: conversationBoundary(result).token },
  });

test('canonical review host checkpoints producer choice, configures reverse-listed roles in source order and adopts without replay', async () => {
  const f = hostFixture();
  const selection = await f.graph.invoke(
    conversationTurn(
      f.draft,
      'add-chain',
      'Add the requested nested split chain.',
      true,
    ),
    f.config,
  );
  assert.equal(conversationBoundary(selection).phase, 'selection');
  assert.equal(f.calls.length, 1);
  const reviewed = await f.graph.invoke(approve(selection), f.config);
  assert.equal(conversationBoundary(reviewed).phase, 'candidate');
  assert.deepEqual(reviewed.draft, f.draft);
  assert.deepEqual(
    f.calls
      .filter((call) => call.name === 'generate_draft_native_node_addition')
      .map((call) => call.payload.instruction),
    ['original groups', 'parent groups', 'final children'],
  );
  assert.equal(
    f.calls.filter((call) => call.name === 'plan_draft_native_dependencies')
      .length,
    1,
  );
  const receipt = clone(reviewed.nativeDependencies);
  const done = await f.graph.invoke(approve(reviewed), f.config);
  assert.equal(done.phase, 'complete');
  assert.deepEqual(done.nativeDependencies, receipt);
  assert.equal(done.draft.nativeNodes.length, 4);
  assert.equal(done.artifact.runtimeInputsReady, true);
  assert.deepEqual(
    done.draft.nativeNodes.find((node) => node.id === 'unrelated-existing'),
    f.draft.nativeNodes[0],
  );
  assert.equal(f.calls.length, 6);
  f.setMode('remove');
  const next = await f.graph.invoke(
    conversationTurn(
      done.draft,
      'remove-child',
      'Remove only the final children split.',
    ),
    f.config,
  );
  const candidate = await f.graph.invoke(approve(next), f.config);
  const removed = await f.graph.invoke(approve(candidate), f.config);
  assert.equal(removed.phase, 'complete');
  assert.deepEqual(removed.nativeDependencies.context.roles, []);
  assert.equal(
    f.calls.filter((call) => call.name === 'plan_draft_native_dependencies')
      .length,
    1,
  );
  assert.equal(removed.draft.nativeNodes.length, 3);
  assert.ok(
    !removed.draft.nativeNodes.some((node) => node.id === f.roles()[0].nodeId),
  );
  assert.equal(
    removed.structuralConnectionResult.kind,
    'terminal-node-removal',
  );
  assert.equal(removed.connectionResult, undefined);
  assert.equal(
    f.calls.filter((call) => call.name === 'plan_draft_connection_edit').length,
    1,
  );
});

test('terminal subgraph removal derives only incident edge deletions; surviving downstream consumers still require planning', () => {
  const f = draftNativeDependencyFixture();
  const complete = completedDraftNativeDependencies(f);
  const nativeNodes = f.plan.steps.map((step) => ({
    id: step.newNodeId,
    capability: step.decision.capability,
    parameters: complete.resolutions.find(
      (resolution) => resolution.stepId === step.id,
    ).parameters,
  }));
  const edges = [
    [f.source.newNodeId, f.parent.newNodeId],
    [f.parent.newNodeId, f.child.newNodeId],
  ].map(([from, to]) => ({ from, to, input: 'main', output: 'main' }));
  const context = {
    ...f.context,
    messages: [
      ...f.context.messages,
      { id: 'delete', text: 'Remove only the selected terminal nodes.' },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'terminal-removal-proof',
      nativeNodes,
      apiCalls: [],
      requirements: [],
      edges,
    },
  });
  const original = clone(draft);
  for (const ids of [
    [f.child.newNodeId],
    [f.parent.newNodeId, f.child.newNodeId],
    [f.parent.newNodeId],
  ]) {
    const input = {
      draft,
      context,
      requestMessageIds: ['delete'],
      resolutions: [],
      repairs: [],
    };
    const plan = createWorkflowDraftEditPlan({
      ...input,
      options: { includeExplanations: false },
      proposal: {
        decisions: ids.map((nodeId) => ({
          kind: 'remove-node',
          nodeId,
          instruction: 'Remove only this node.',
          sources: [
            {
              kind: 'message',
              messageId: 'delete',
              quote: context.messages.at(-1).text,
            },
          ],
        })),
      },
    });
    const result = resolveWorkflowDraftTerminalRemoval({ ...input, plan });
    if (!ids.includes(f.child.newNodeId)) {
      assert.equal(result.status, 'not-applicable');
      continue;
    }
    assert.equal(result.status, 'ready');
    assert.equal(result.result.kind, 'terminal-node-removal');
    assert.equal(Object.hasOwn(result.result, 'proposal'), false);
    assert.deepEqual(
      result.result.connections.map((change) => change.edge),
      edges.filter((edge) => ids.includes(edge.from) || ids.includes(edge.to)),
    );
    assert.ok(
      result.result.connections.every(
        (change) => change.kind === 'remove-edge',
      ),
    );
    assert.deepEqual(
      result.result.candidate.draft.nativeNodes,
      draft.nativeNodes.filter((node) => !ids.includes(node.id)),
    );
    assert.deepEqual(
      result.result.candidate.draft.edges,
      edges.filter(
        (edge) => !ids.includes(edge.from) && !ids.includes(edge.to),
      ),
    );
  }
  assert.deepEqual(draft, original);
});

test('canonical automatic host retries only the failed value checkpoint, preserving original producer choices', async () => {
  const f = hostFixture({ reviewPolicy: 'automatic', failValue: true });
  await assert.rejects(
    f.graph.invoke(
      conversationTurn(
        f.draft,
        'retry-values',
        'Add the nested split chain.',
        true,
      ),
      f.config,
    ),
    (error) => error === f.transport,
  );
  const before = await f.graph.getState(f.config);
  assert.deepEqual(before.next, ['native-addition']);
  const receipt = clone(before.values.nativeDependencies);
  const done = await f.graph.invoke(null, f.config);
  assert.equal(done.phase, 'complete');
  assert.deepEqual(done.nativeDependencies, receipt);
  assert.equal(
    f.calls.filter((call) => call.name === 'analyze_workflow_draft_edit')
      .length,
    1,
  );
  assert.equal(
    f.calls.filter((call) => call.name === 'plan_draft_native_dependencies')
      .length,
    1,
  );
  assert.equal(
    f.calls.filter(
      (call) => call.name === 'generate_draft_native_node_addition',
    ).length,
    4,
  );
});

test('changing a checkpointed producer receipt invalidates old human approval and cannot be adopted with a fresh token', async () => {
  const f = hostFixture();
  const selected = await f.graph.invoke(
    conversationTurn(
      f.draft,
      'tamper-review',
      'Add the nested split chain.',
      true,
    ),
    f.config,
  );
  const candidate = await f.graph.invoke(approve(selected), f.config);
  const count = f.calls.length;
  await f.graph.updateState(f.config, {
    nativeDependencies: {
      ...candidate.nativeDependencies,
      id: 'tampered-receipt',
    },
  });
  const rejected = await f.graph.invoke(approve(candidate), f.config);
  assert.equal(rejected.phase, 'candidate');
  assert.match(
    conversationBoundary(rejected).issues.join(' '),
    /검토 대상이 바뀌었습니다/,
  );
  assert.equal(f.calls.length, count);
  assert.deepEqual(rejected.draft, f.draft);
  await assert.rejects(
    f.graph.invoke(approve(rejected), f.config),
    /dependency choices are stale/,
  );
  assert.equal(f.calls.length, count);
});

test('canonical host stops a producer cycle before any values and explicit retry repeats only the dependency stage', async () => {
  const f = hostFixture({ reviewPolicy: 'automatic', cyclic: true });
  await assert.rejects(
    f.graph.invoke(
      conversationTurn(
        f.draft,
        'retry-cycle',
        'Add a nested split chain.',
        true,
      ),
      f.config,
    ),
    /dependency cycle/,
  );
  const checkpoint = await f.graph.getState(f.config);
  assert.deepEqual(checkpoint.next, ['native-dependencies']);
  assert.equal(
    f.calls.filter(
      (call) => call.name === 'generate_draft_native_node_addition',
    ).length,
    0,
  );
  assert.deepEqual(checkpoint.values.draft, f.draft);
  f.fixCycle();
  const done = await f.graph.invoke(null, f.config);
  assert.equal(done.phase, 'complete');
  assert.equal(
    f.calls.filter((call) => call.name === 'analyze_workflow_draft_edit')
      .length,
    1,
  );
  assert.equal(
    f.calls.filter((call) => call.name === 'plan_draft_native_dependencies')
      .length,
    2,
  );
});

test('a pending producer asks one original question; a user revision explicitly supersedes its plan instead of rebasing receipts', async () => {
  const f = hostFixture({ reviewPolicy: 'automatic', askValue: true });
  const pending = await f.graph.invoke(
    conversationTurn(
      f.draft,
      'missing-source',
      'Add a nested split chain.',
      true,
    ),
    f.config,
  );
  const boundary = conversationBoundary(pending);
  assert.equal(pending.phase, 'questions');
  assert.equal(pending.questions.length, 1);
  assert.equal(pending.questions[0].kind, 'message');
  assert.equal(pending.questions[0].stepId, pending.plan.steps[2].id);
  assert.equal(
    f.calls.filter(
      (call) => call.name === 'generate_draft_native_node_addition',
    ).length,
    1,
  );
  const original = clone(pending.nativeDependencies);
  const done = await f.graph.invoke(
    new Command({
      resume: {
        action: 'revise',
        token: boundary.token,
        message: {
          id: 'supply-source',
          text: 'Use the exact requested original groups now.',
        },
      },
    }),
    f.config,
  );
  assert.equal(done.phase, 'complete');
  assert.notEqual(done.nativeDependencies.id, original.id);
  assert.ok(
    done.events.some(
      (event) =>
        event.kind === 'superseded' && event.id === original.context.plan.id,
    ),
  );
  assert.deepEqual(pending.nativeDependencies, original);
});
