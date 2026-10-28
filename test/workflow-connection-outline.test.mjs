import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { MemorySaver } from '@langchain/langgraph';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  createWorkflowConnectionOutline,
  describeWorkflowConnectionOutline,
  describeWorkflowConnectionOutlineBundle,
  applyWorkflowConnectionOutlineStep,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionOutline,
  planWorkflowConnectionStep,
  WorkflowConnectionPlanningError,
} from '@openapi-flow/langchain';
import {
  createIncrementalWorkflowConnectionGraph,
  IncrementalConnectionLimitError,
} from '@openapi-flow/example-langgraph-workflow';
import { recoveryQueueModel } from './fixtures/initial-connection-recovery-fixture.mjs';
import {
  connectionOutlineFixture,
  connectionOutlineProposal,
} from './fixtures/connection-outline-fixture.mjs';
import {
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from './fixtures/incremental-connection-fixture.mjs';

const { Ajv2020 } = createRequire(import.meta.resolve('@openapi-flow/core'))(
  'ajv/dist/2020.js',
);
const policy = {
  maxModelInvocations: 8,
  maxRejectedProposals: 2,
  deadlineMs: 30000,
};
function prepared() {
  const fixture = connectionOutlineFixture();
  const session = createWorkflowConnectionSession({
    ...fixture.source,
    goals: fixture.goals,
  });
  const input = { ...fixture.source, session };
  const proposal = connectionOutlineProposal(
    describeWorkflowConnectionStep(input),
  );
  return {
    ...fixture,
    input,
    proposal,
    outline: createWorkflowConnectionOutline({ ...input, proposal }),
  };
}

test('global outline retains every actual node and session goal with code-owned stable IDs and no generated execution edges', () => {
  const { input, outline, proposal } = prepared();
  const before = globalThis.structuredClone(input.session);
  const description = describeWorkflowConnectionOutline({ ...input, outline });
  assert.equal(description.outline.bundles.length, 4);
  assert.ok(description.bundles.every((bundle) => bundle.pending));
  assert.equal(Object.hasOwn(outline, 'edges'), false);
  const reordered = {
    ...proposal,
    bundles: proposal.bundles
      .map((bundle) => ({
        ...bundle,
        nodeIds: [...bundle.nodeIds].reverse(),
        purpose: 'A different explanation of the same structural task.',
      }))
      .reverse(),
  };
  const sameIdentity = createWorkflowConnectionOutline({
    ...input,
    proposal: reordered,
  });
  assert.equal(sameIdentity.id, outline.id);
  assert.deepEqual(
    sameIdentity.bundles.map((bundle) => bundle.id).sort(),
    outline.bundles.map((bundle) => bundle.id).sort(),
  );
  const local = describeWorkflowConnectionOutlineBundle({
    ...input,
    outline,
    bundleId: outline.bundles[1].id,
  });
  assert.ok(local.requiredProducerIds.includes('source'));
  assert.equal(
    local.step.context.nodes.length,
    description.step.context.nodes.length,
    'No arbitrary top-K or focus-only global context',
  );
  assert.deepEqual(input.session, before);
});

test('missing identities, duplicate tasks, stale goals/source and forged IDs cannot become an accepted outline', () => {
  const { input, outline, proposal } = prepared();
  for (const change of [
    (value) => {
      value.bundles[0].nodeIds = ['foreign'];
    },
    (value) => {
      value.bundles[2].nodeIds = ['join'];
    },
    (value) => {
      value.bundles[0].goalIds = ['foreign'];
    },
    (value) => {
      value.bundles[0].factIds = ['foreign'];
    },
    (value) => {
      value.bundles.push(globalThis.structuredClone(value.bundles[0]));
    },
    (value) => {
      value.edges = [];
    },
  ]) {
    const copy = globalThis.structuredClone(proposal);
    change(copy);
    assert.throws(() =>
      createWorkflowConnectionOutline({ ...input, proposal: copy }),
    );
  }
  const changed = globalThis.structuredClone(outline);
  changed.bundles[0].id = 'a'.repeat(64);
  assert.throws(
    () => describeWorkflowConnectionOutline({ ...input, outline: changed }),
    /differs/,
  );
  assert.throws(
    () =>
      describeWorkflowConnectionOutline({
        ...input,
        scenario: 'Changed original request',
        outline,
      }),
    /different source snapshot/,
  );
  assert.throws(
    () =>
      describeWorkflowConnectionOutlineBundle({
        ...input,
        outline,
        bundleId: 'unknown',
      }),
    /actual supplied work bundle/,
  );
});

test('three atomic outlined steps retain global context and real branch/join semantics until complete validation', () => {
  const { input, outline, patches, plan } = prepared();
  let session = input.session;
  for (let index = 0; index < patches.length; index++) {
    const current = {
      ...input,
      session,
      outline,
      bundleId: outline.bundles[index].id,
    };
    const result = applyWorkflowConnectionOutlineStep({
      ...current,
      expected: describeWorkflowConnectionStep(current).expected,
      proposal: patches[index],
    });
    assert.equal(result.status, 'accepted', JSON.stringify(result));
    session = result.session;
    assert.equal(result.inspection.ready, index === 2);
    assert.doesNotThrow(
      () => describeWorkflowConnectionOutline({ ...input, session, outline }),
      'Edge revisions alone do not invalidate global grouping',
    );
  }
  const final = finalizeWorkflowConnectionSession({ ...input, session });
  assert.deepEqual(final.edges, plan.edges);
  assert.equal(session.revision, 3);
});

test('a bundle cannot edit an unrelated region or bypass stale-revision checks; failures leave the source intact', () => {
  const { input, outline, patches } = prepared();
  const before = globalThis.structuredClone(input.session);
  const result = applyWorkflowConnectionOutlineStep({
    ...input,
    outline,
    bundleId: outline.bundles[0].id,
    expected: describeWorkflowConnectionStep(input).expected,
    proposal: patches[2],
  });
  assert.equal(result.status, 'rejected');
  assert.match(result.violations[0].message, /unrelated region/);
  assert.throws(
    () =>
      applyWorkflowConnectionOutlineStep({
        ...input,
        outline,
        bundleId: outline.bundles[0].id,
        expected: {
          ...describeWorkflowConnectionStep(input).expected,
          revision: 99,
        },
        proposal: patches[0],
      }),
    /Stale connection step/,
  );
  assert.deepEqual(input.session, before);
});

test('one outline call returns only grouping choices, and scoped step schemas retain the complete global role/graph context', async () => {
  const { input, proposal, modelPatches } = prepared();
  const model = recoveryQueueModel([proposal], ({ schema }) => {
    const validate = new Ajv2020({ strict: false }).compile(schema);
    assert.equal(validate(proposal), true);
    assert.deepEqual(
      Object.keys(schema.properties.bundles.items.properties).sort(),
      ['nodeIds', 'purpose'],
    );
    const annotated = globalThis.structuredClone(proposal);
    annotated.bundles[0].goalIds = [];
    assert.equal(
      validate(annotated),
      false,
      'The model does not repeat goal IDs',
    );
    const unknown = globalThis.structuredClone(proposal);
    unknown.bundles[0].nodeIds = ['unknown'];
    assert.equal(validate(unknown), false);
    assert.equal(validate({ ...proposal, id: 'invented' }), false);
  });
  const outline = await planWorkflowConnectionOutline({ ...input, model });
  const stepModel = recoveryQueueModel(
    [modelPatches[0]],
    ({ payload, schema }) => {
      assert.equal(
        payload.context.nodes.length,
        describeWorkflowConnectionStep(input).context.nodes.length,
      );
      assert.deepEqual(
        payload.planningOutline.selectedBundle,
        outline.bundles[0],
      );
      const validate = new Ajv2020({ strict: false }).compile(schema);
      assert.equal(validate(modelPatches[0]), true);
      assert.equal(
        validate(modelPatches[2]),
        false,
        'An unrelated join/summary edge is outside the selected source task',
      );
    },
  );
  await planWorkflowConnectionStep({
    ...input,
    model: stepModel,
    outline,
    bundleId: outline.bundles[0].id,
  });
  assert.equal(model.requests.length, 1);
  assert.equal(stepModel.requests.length, 1);
});

test('changed outline inputs, malformed scoped outputs and transport failures are never adopted or turned into user questions', async () => {
  const { input, outline, proposal } = prepared();
  const missing = recoveryQueueModel([]);
  await assert.rejects(
    planWorkflowConnectionStep({ ...input, outline, model: missing }),
    /supplied together/,
  );
  assert.equal(missing.requests.length, 0);
  const mutable = globalThis.structuredClone(outline);
  const badModel = recoveryQueueModel([{}], () => {
    mutable.purpose = 'Changed while waiting';
  });
  await assert.rejects(
    planWorkflowConnectionStep({
      ...input,
      outline: mutable,
      bundleId: mutable.bundles[0].id,
      model: badModel,
    }),
    (error) =>
      error instanceof WorkflowConnectionPlanningError &&
      error.diagnostic.stage === 'input-validation',
  );
  const transport = new Error('Outline transport failed');
  await assert.rejects(
    planWorkflowConnectionOutline({
      ...input,
      model: recoveryQueueModel([transport]),
    }),
    (error) => error.cause === transport,
  );
  const changed = { ...input, previousOutline: outline };
  const model = recoveryQueueModel([proposal], () => {
    changed.previousOutline.purpose = 'Different hypothesis';
  });
  await assert.rejects(
    planWorkflowConnectionOutline({ ...changed, model }),
    /changed/,
  );
});

test('host-owned outline and bundle scheduling complete without human interrupts and preserve saved outline work after observer failure', async () => {
  const fixture = connectionOutlineFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    ({ payload }) => connectionOutlineProposal(payload),
    ...fixture.modelPatches,
  ]);
  let selected = 0;
  let observed = false;
  const failure = new Error('Outline observer failed after storage');
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    checkpointer: new MemorySaver(),
    outlinePlanning: {
      model,
      selectBundle: ({ outline }) => outline.bundles[selected++].id,
      observe: () => {
        if (!observed) {
          observed = true;
          throw failure;
        }
      },
    },
  });
  const config = { configurable: { thread_id: 'outline-observer-recovery' } };
  await assert.rejects(graph.invoke({}, config), (error) => error === failure);
  const saved = await graph.getState(config);
  assert.deepEqual(saved.next, ['publishOutline']);
  assert.ok(saved.values.outline);
  assert.equal(saved.values.outlineHistory.length, 1);
  assert.equal(model.requests.length, 2);
  const state = await graph.invoke(null, config);
  assert.equal(state.status, 'complete');
  assert.equal(state.modelInvocations, 5);
  assert.equal(model.requests.length, 5);
  assert.equal(state.session.revision, 3);
  assert.deepEqual(state.plan.edges, fixture.plan.edges);
  assert.equal(Object.hasOwn(state, '__interrupt__'), false);
});

test('outline model work shares the explicit global call budget; invalid scheduling fails before another model call', async () => {
  const fixture = connectionOutlineFixture();
  const model = recoveryQueueModel([
    { goals: fixture.goals },
    ({ payload }) => connectionOutlineProposal(payload),
  ]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy: { ...policy, maxModelInvocations: 1 },
    outlinePlanning: { model, selectBundle: () => 'unknown' },
  });
  await assert.rejects(
    graph.invoke({}),
    (error) => error instanceof IncrementalConnectionLimitError,
  );
  assert.equal(model.requests.length, 1);
  const invalidModel = recoveryQueueModel([
    { goals: fixture.goals },
    ({ payload }) => connectionOutlineProposal(payload),
  ]);
  const invalid = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model: invalidModel,
    policy,
    outlinePlanning: { model: invalidModel, selectBundle: () => 'unknown' },
  });
  await assert.rejects(invalid.invoke({}), /actual bundle ID/);
  assert.equal(model.requests.length, 1);
  assert.equal(invalidModel.requests.length, 2);
});

test('an outline can be regrouped at the current edge revision without resetting accepted goals or graph history', async () => {
  const { input, outline, patches, plan } = prepared();
  const first = applyWorkflowConnectionOutlineStep({
    ...input,
    outline,
    bundleId: outline.bundles[0].id,
    expected: describeWorkflowConnectionStep(input).expected,
    proposal: patches[0],
  });
  assert.equal(first.status, 'accepted');
  const current = { ...input, session: first.session };
  const description = describeWorkflowConnectionStep(current);
  const proposal = {
    purpose:
      'Regroup the remaining graph while retaining the accepted source branch.',
    bundles: [
      {
        purpose: 'All remaining boundaries',
        nodeIds: description.context.nodes.map((node) => node.id),
      },
    ],
  };
  const next = await planWorkflowConnectionOutline({
    ...current,
    previousOutline: outline,
    model: recoveryQueueModel([proposal]),
  });
  assert.notEqual(next.id, outline.id);
  assert.deepEqual(current.session, first.session);
  const finished = applyWorkflowConnectionOutlineStep({
    ...current,
    outline: next,
    bundleId: next.bundles[0].id,
    expected: description.expected,
    proposal: incrementalConnectionPatch({
      addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  });
  assert.equal(finished.status, 'accepted');
  assert.equal(finished.inspection.ready, true);
  assert.deepEqual(finished.session.history[0], first.session.history[0]);
});

test('adding actual native material invalidates the old outline and schedules a fresh grouping without changing accepted edges', async () => {
  const fixture = connectionOutlineFixture();
  fixture.source.nativeNodes = [];
  const goals = fixture.goals.filter((goal) => goal.kind !== 'join');
  const allNodes = ({ payload }) => ({
    purpose: 'Keep every confirmed role and current boundary.',
    bundles: [
      {
        purpose: 'Current supplied material',
        nodeIds: payload.context.nodes.map((node) => node.id),
      },
    ],
  });
  const request = {
    kind: 'request-native-material',
    capability: 'merge-append',
    purpose: 'Wait for the independent results before summary',
    factIds: ['intent'],
    reason: 'The actual join material is absent.',
  };
  const model = recoveryQueueModel([
    { goals },
    allNodes,
    fixture.modelPatches[0],
    { decision: request },
    { decision: { status: 'provided', parameters: { numberInputs: 3 } } },
    allNodes,
    ({ payload }) => {
      const native = payload.context.nativeNodes.find(
        (node) => node.capability === 'merge-append',
      );
      assert.ok(native);
      const source = {
        ...fixture.source,
        nativeNodes: [
          {
            id: native.id,
            capability: native.capability,
            parameters: native.parameters,
          },
        ],
      };
      const addEdges = fixture.plan.edges
        .filter((edge) => edge.from !== 'source')
        .map((edge) => ({
          ...edge,
          from: edge.from === 'join' ? native.id : edge.from,
          to: edge.to === 'join' ? native.id : edge.to,
        }));
      return {
        decision: incrementalConnectionModelPatch(
          source,
          incrementalConnectionPatch({
            addEdges,
            addTerminals: [{ nodeId: 'summary', output: 'main' }],
          }),
        ),
      };
    },
  ]);
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => fixture.source,
    model,
    policy,
    nativeAugmentation: { parameterOwnership: { parameterSource: 'literal' } },
    outlinePlanning: {
      model,
      selectBundle: ({ outline }) => outline.bundles[0].id,
    },
  });
  const state = await graph.invoke({});
  assert.equal(state.status, 'complete');
  assert.equal(state.outlineHistory.length, 2);
  assert.notEqual(
    state.outlineHistory[0].sourceFingerprint,
    state.outlineHistory[1].sourceFingerprint,
  );
  assert.equal(state.session.history.length, 2);
  assert.deepEqual(
    state.session.history[0].proposal.addEdges,
    fixture.patches[0].addEdges,
  );
  assert.equal(model.requests.length, 7);
  assert.equal(state.materialExtensions.length, 1);
  assert.equal(Object.hasOwn(state, '__interrupt__'), false);
});
