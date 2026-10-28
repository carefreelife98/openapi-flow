import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  describeWorkflowConnectionGoals,
  createWorkflowConnectionMaterialRevisionRequest,
  validateWorkflowConnectionMaterialRevisionRequest,
  validateWorkflowConnectionSourceRepairRequest,
  workflowConnectionPlanningDecisionSchema,
  applyWorkflowConnectionStep,
  applyWorkflowConnectionMaterialRepair,
  applyWorkflowConnectionRevision,
  finalizeWorkflowConnectionSession,
  selectWorkflowConnectionArgumentValues,
} from '@openapi-flow/core';
import { planWorkflowConnectionStep } from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
} from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');

function fixture({ literal = false, connected = false } = {}) {
  const { source, goals, plan } = incrementalConnectionFixture();
  if (literal) {
    const args = source.materials.find(
      (item) => item.arguments.callId === 'price',
    ).arguments;
    args.bindings = args.bindings.filter(
      (binding) => binding.targetPointer !== '/query/labels',
    );
    args.values = { query: { labels: ['original'] } };
  }
  const selectedGoals = goals.filter((goal) => goal.kind !== 'independent');
  let session = createWorkflowConnectionSession({
    ...source,
    goals: selectedGoals,
  });
  if (connected) {
    const applied = applyWorkflowConnectionStep({
      ...source,
      session,
      expected: describeWorkflowConnectionStep({ ...source, session }).expected,
      proposal: incrementalConnectionPatch({
        addEdges: plan.edges,
        addRootNodeIds: ['source'],
        addTerminals: [{ nodeId: 'summary', output: 'main' }],
      }),
    });
    assert.equal(applied.status, 'accepted');
    session = applied.session;
  }
  const expected = describeWorkflowConnectionStep({
    ...source,
    session,
  }).expected;
  const decision = {
    kind: 'replan-materials',
    targets: [{ stage: 'api-bindings', nodeId: 'price' }],
    factIds: ['intent'],
    reason: 'Use the detail result for the price lookup.',
  };
  return { source, session, expected, decision, goals: selectedGoals };
}

function snapshot(source, session) {
  return globalThis.structuredClone({
    ...source,
    capabilities: undefined,
    session,
  });
}

test('material revisions are default-off with identical omitted/false wire schemas and prompts', async () => {
  const { source, session } = fixture();
  const decision = {
    kind: 'request-completion',
    assessments: [],
    reason: 'Inspect the graph.',
  };
  const calls = [];
  for (const options of [{}, { allowMaterialRevisions: false }]) {
    const model = connectionPlanningModel(
      { decision },
      ({ schema, messages, context }) => {
        assert.equal(
          JSON.stringify(schema).includes('replan-materials'),
          false,
        );
        assert.equal(messages[0].content.includes('replan-materials'), false);
        assert.equal(Object.hasOwn(context, 'materialRepairStages'), false);
        calls.push({ schema, messages, context });
      },
    );
    const result = await planWorkflowConnectionStep({
      ...source,
      session,
      ...options,
      model,
    });
    assert.deepEqual(result.decision, decision);
    assert.equal(model.calls, 1);
  }
  assert.deepEqual(calls[0], calls[1]);
});

test('explicit opt-in exposes only actual stage/node pairs and binds source/session/revision in code', async () => {
  const { source, session, expected, decision } = fixture({
    literal: true,
    connected: true,
  });
  const original = snapshot(source, session);
  for (const target of [
    { stage: 'api-bindings', nodeId: 'price' },
    { stage: 'api-arguments', nodeId: 'price' },
    { stage: 'native-dependencies', nodeId: 'join' },
    { stage: 'native-parameters', nodeId: 'join' },
  ]) {
    const output = { decision: { ...decision, targets: [target] } };
    const model = connectionPlanningModel(
      output,
      ({ schema, messages, context }) => {
        const ajv = new Ajv2020({ strict: false });
        const validate = ajv.compile(schema);
        assert.equal(validate(output), true, JSON.stringify(validate.errors));
        assert.deepEqual(
          context.materialRepairStages,
          describeWorkflowConnectionGoals(source).materialRepairStages,
        );
        assert.match(messages[0].content, /original current source/);
        for (const invalid of [
          { ...output.decision, sourceFingerprint: expected.sourceFingerprint },
          { ...output.decision, expected },
          {
            ...output.decision,
            replacement: { apiArguments: [], nativeNodes: [] },
          },
          {
            ...output.decision,
            targets: [{ stage: 'native-parameters', nodeId: 'price' }],
          },
          {
            ...output.decision,
            targets: [{ stage: 'api-bindings', nodeId: 'join' }],
          },
          {
            ...output.decision,
            targets: [{ stage: 'api-bindings', nodeId: 'source' }],
          },
          {
            ...output.decision,
            targets: [{ stage: 'api-arguments', nodeId: 'stock' }],
          },
        ])
          assert.equal(validate({ decision: invalid }), false);
      },
    );
    const result = await planWorkflowConnectionStep({
      ...source,
      session,
      allowMaterialRevisions: true,
      model,
    });
    assert.deepEqual(result, { expected, decision: output.decision });
    assert.equal(model.calls, 1);
    const request = createWorkflowConnectionMaterialRevisionRequest({
      ...source,
      session,
      ...result,
    });
    assert.deepEqual(request, {
      kind: 'replan-materials',
      sourceFingerprint: expected.sourceFingerprint,
      request: output.decision,
    });
    validateWorkflowConnectionSourceRepairRequest({ source, request });
    validateWorkflowConnectionMaterialRevisionRequest({
      ...source,
      session,
      ...result,
      request,
    });
    assert.deepEqual(
      workflowConnectionPlanningDecisionSchema.parse(result.decision),
      result.decision,
    );
  }
  assert.deepEqual(snapshot(source, session), original);
});

test('receiver rejects disabled, unknown, duplicate and ineligible model requests with one call and no mutation', async () => {
  const { source, session, decision } = fixture();
  const original = snapshot(source, session);
  for (const [options, changed] of [
    [{}, decision],
    [{ allowMaterialRevisions: false }, decision],
    [
      { allowMaterialRevisions: true },
      { ...decision, targets: [{ stage: 'api-bindings', nodeId: 'unknown' }] },
    ],
    [
      { allowMaterialRevisions: true },
      { ...decision, targets: [{ stage: 'api-arguments', nodeId: 'price' }] },
    ],
    [
      { allowMaterialRevisions: true },
      { ...decision, targets: [...decision.targets, ...decision.targets] },
    ],
    [{ allowMaterialRevisions: true }, { ...decision, factIds: ['unknown'] }],
    [
      { allowMaterialRevisions: true },
      {
        ...decision,
        targets: [{ stage: 'native-parameters', nodeId: 'price' }],
      },
    ],
  ]) {
    const model = connectionPlanningModel({ decision: changed });
    await assert.rejects(
      planWorkflowConnectionStep({ ...source, session, ...options, model }),
    );
    assert.equal(model.calls, 1);
    assert.deepEqual(snapshot(source, session), original);
  }
});

test('invalid opt-in values fail before model invocation', async () => {
  const { source, session, decision } = fixture();
  for (const allowMaterialRevisions of ['true', 1, null, {}]) {
    const model = connectionPlanningModel({ decision });
    await assert.rejects(
      planWorkflowConnectionStep({
        ...source,
        session,
        allowMaterialRevisions,
        model,
      }),
      /allowMaterialRevisions must be a boolean/,
    );
    assert.equal(model.calls, 0);
  }
});

test('opt-in and source mutation during model invocation fail without retry or adopting a request', async () => {
  for (const change of [
    (input) => {
      input.allowMaterialRevisions = false;
    },
    (input) => {
      input.requirements[0].text += ' Changed.';
    },
    (input) => {
      input.session.revision++;
    },
  ]) {
    const { source, session, decision } = fixture();
    const input = { ...source, session, allowMaterialRevisions: true };
    const model = connectionPlanningModel({ decision }, () => change(input));
    await assert.rejects(
      planWorkflowConnectionStep(Object.assign(input, { model })),
      (error) => error.diagnostic.code === 'PLANNING_INPUT_INVALID',
    );
    assert.equal(model.calls, 1);
  }
});

test('factory rejects stale expectations, invalid original sources and unknown/wrong-owner/ineligible targets', () => {
  const { source, session, expected, decision } = fixture({ connected: true });
  const original = snapshot(source, session);
  const input = { ...source, session, expected, decision };
  for (const changed of [
    {
      expected: {
        ...expected,
        sessionId: '00000000-0000-4000-8000-000000000000',
      },
    },
    { expected: { ...expected, sourceFingerprint: 'f'.repeat(64) } },
    { expected: { ...expected, revision: expected.revision - 1 } },
    { expected: { ...expected, revision: expected.revision + 1 } },
    { scenario: 'Different original scenario.' },
    { session: { ...session, history: [] } },
    {
      materials: source.materials.filter(
        (item) => item.arguments.callId !== 'price',
      ),
    },
    {
      decision: {
        ...decision,
        targets: [{ stage: 'api-bindings', nodeId: 'unknown' }],
      },
    },
    {
      decision: {
        ...decision,
        targets: [{ stage: 'native-dependencies', nodeId: 'price' }],
      },
    },
    {
      decision: {
        ...decision,
        targets: [{ stage: 'api-bindings', nodeId: 'source' }],
      },
    },
    {
      decision: {
        ...decision,
        targets: [
          { stage: 'api-bindings', nodeId: 'price' },
          { stage: 'api-arguments', nodeId: 'price' },
        ],
      },
    },
    { decision: { ...decision, factIds: ['unknown'] } },
    { decision: { ...decision, extra: true } },
  ])
    assert.throws(() =>
      createWorkflowConnectionMaterialRevisionRequest({ ...input, ...changed }),
    );
  assert.deepEqual(snapshot(source, session), original);
});

test('validation binds the original target scope while display reasons and actual fact subsets need no text equality or coverage proof', () => {
  const { source, goals, decision } = fixture();
  source.requirements.push({
    id: 'other',
    text: 'A second confirmed obligation.',
    sources: [
      {
        kind: 'message',
        messageId: 'other-message',
        quote: 'A second confirmed obligation.',
      },
    ],
  });
  const session = createWorkflowConnectionSession({
    ...source,
    goals: [
      ...goals,
      {
        kind: 'semantic',
        factIds: ['other'],
        reason: 'Inspect the second obligation later.',
      },
    ],
  });
  const expected = describeWorkflowConnectionStep({
    ...source,
    session,
  }).expected;
  const input = { ...source, session, expected, decision };
  const request = createWorkflowConnectionMaterialRevisionRequest(input);
  assert.equal(Object.hasOwn(request, 'replacement'), false);
  const changedDisplay = {
    ...request,
    request: {
      ...request.request,
      reason: 'A paraphrased UI explanation, not a quote.',
      factIds: ['other'],
    },
  };
  validateWorkflowConnectionMaterialRevisionRequest({
    ...input,
    request: changedDisplay,
  });
  for (const changed of [
    { ...request, sourceFingerprint: 'a'.repeat(64) },
    {
      ...request,
      request: {
        ...request.request,
        targets: [
          ...request.request.targets,
          { stage: 'api-bindings', nodeId: 'detail' },
        ],
      },
    },
    {
      ...request,
      request: {
        ...request.request,
        targets: [{ stage: 'native-parameters', nodeId: 'join' }],
      },
    },
  ])
    assert.throws(() =>
      validateWorkflowConnectionMaterialRevisionRequest({
        ...input,
        request: changed,
      }),
    );
  request.request.targets[0].nodeId = 'detail';
  assert.deepEqual(decision.targets, [
    { stage: 'api-bindings', nodeId: 'price' },
  ]);
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected,
    proposal: decision,
  });
  assert.equal(applied.status, 'rejected');
  assert.equal(applied.violations[0].code, 'INVALID_PROPOSAL');
});

test('host replans on the original source and only the existing revision API adopts compatible source and graph together', async () => {
  const { source, session, decision, expected, goals } = fixture({
    connected: true,
  });
  const original = snapshot(source, session);
  const planned = await planWorkflowConnectionStep({
    ...source,
    session,
    allowMaterialRevisions: true,
    model: connectionPlanningModel({ decision }),
  });
  const request = createWorkflowConnectionMaterialRevisionRequest({
    ...source,
    session,
    ...planned,
  });
  const args = source.materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments;
  const replacement = {
    apiArguments: [
      {
        callId: args.callId,
        ...selectWorkflowConnectionArgumentValues(args),
        bindings: args.bindings.map((binding, index) =>
          index === 0 ? { ...binding, sourceNodeId: 'detail' } : binding,
        ),
      },
    ],
    nativeNodes: [],
  };
  const repaired = applyWorkflowConnectionMaterialRepair({
    source,
    request,
    replacement,
  });
  assert.deepEqual(snapshot(source, session), original);
  assert.throws(() =>
    applyWorkflowConnectionRevision({
      before: { ...source, session },
      after: repaired.source,
      expected,
      proposal: { goals, graphChange: incrementalConnectionPatch({}) },
    }),
  );
  const removed = describeWorkflowConnectionStep({
    ...source,
    session,
  }).edgeCatalog.find(
    (entry) => entry.edge.from === 'source' && entry.edge.to === 'price',
  );
  const revision = applyWorkflowConnectionRevision({
    before: { ...source, session },
    after: repaired.source,
    expected,
    proposal: {
      goals,
      graphChange: incrementalConnectionPatch({
        removeEdgeIds: [removed.id],
        addEdges: [
          { from: 'detail', output: 'main', to: 'price', input: 'main' },
        ],
      }),
    },
  });
  assert.equal(revision.inspection.ready, true);
  assert.notEqual(
    revision.session.sourceFingerprint,
    session.sourceFingerprint,
  );
  assert.notEqual(revision.session.id, session.id);
  finalizeWorkflowConnectionSession({
    ...repaired.source,
    ...revision.sourceUpdate,
    session: revision.session,
  });
  assert.deepEqual(snapshot(source, session), original);
  assert.throws(() =>
    validateWorkflowConnectionMaterialRevisionRequest({
      ...repaired.source,
      ...revision.sourceUpdate,
      session: revision.session,
      ...planned,
      request,
    }),
  );
});
