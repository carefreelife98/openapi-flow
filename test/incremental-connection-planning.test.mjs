import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  finalizeWorkflowConnectionSession,
  describeWorkflowConnectionStep,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
  WorkflowConnectionPlanningError,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture as fixture,
  incrementalConnectionPatch as patch,
  incrementalConnectionModelPatch as modelPatch,
} from './fixtures/incremental-connection-fixture.mjs';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');

function inspectWire(schema, output) {
  const ajv = new Ajv2020({ strict: false });
  assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
  const validate = ajv.compile(schema);
  assert.equal(validate(output), true, JSON.stringify(validate.errors));
  return validate;
}

function modelFor(output, inspect = () => {}) {
  return connectionPlanningModel(
    output,
    ({ schema, options, messages, context }) => {
      inspectWire(schema, output);
      assert.equal(options.method, 'functionCalling');
      assert.equal(options.strict, true);
      assert.ok(messages[0] instanceof SystemMessage);
      assert.ok(messages[1] instanceof HumanMessage);
      return inspect({ schema, options, context });
    },
  );
}

test('goal interpretation uses real contracts and returns a code-created session without model IDs/revisions', async () => {
  const { source, goals } = fixture();
  const output = { goals };
  const model = modelFor(output, ({ schema, context }) => {
    assert.deepEqual(Object.keys(schema.properties), ['goals']);
    assert.equal(context.context.nodes.length, 6);
    assert.deepEqual(context.requirements, source.requirements);
    assert.equal(context.apiOperations.length, source.materials.length);
    assert.deepEqual(
      context.apiOperations[0].key,
      source.materials[0].operation.key,
    );
    assert.equal(
      context.apiOperations[0].method,
      source.materials[0].operation.method,
    );
    assert.equal(
      context.apiOperations[0].path,
      source.materials[0].operation.path,
    );
    assert.equal(Object.hasOwn(context.apiOperations[0], 'effective'), false);
    assert.equal(Object.hasOwn(context, 'sources'), false);
    assert.equal(Object.hasOwn(context, 'materials'), false);
  });
  const session = await planWorkflowConnectionGoals({ ...source, model });
  assert.equal(model.calls, 1);
  assert.equal(session.revision, 0);
  assert.deepEqual(session.edges, []);
  assert.deepEqual(session.rootNodeIds, []);
  assert.deepEqual(
    session.goals.map((goal) => goal.decision),
    goals,
  );
  assert.ok(session.goals.every((goal) => /^goal-[a-f0-9]{64}$/.test(goal.id)));
});

test('model steps select endpoints; code fills unique ports, validates atomic bundles and retains the same final DAG', async () => {
  const { source, goals, plan } = fixture();
  let session = createWorkflowConnectionSession({ ...source, goals });
  const first = patch({
    addRootNodeIds: ['source'],
    addEdges: plan.edges.filter((edge) => edge.from === 'source'),
    addTerminals: ['detail', 'price', 'stock'].map((nodeId) => ({
      nodeId,
      output: 'main',
    })),
  });
  const second = patch({
    addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
    addTerminals: [{ nodeId: 'summary', output: 'main' }],
    removeTerminals: first.addTerminals,
  });
  for (const proposal of [first, second]) {
    const before = globalThis.structuredClone(session);
    const model = modelFor(
      { decision: modelPatch(source, proposal) },
      ({ schema }) => {
        assert.deepEqual(Object.keys(schema.properties), ['decision']);
      },
    );
    const result = await planWorkflowConnectionStep({
      ...source,
      session,
      model,
    });
    assert.equal(model.calls, 1);
    assert.equal(result.expected.revision, before.revision);
    assert.equal(result.expected.sourceFingerprint, session.sourceFingerprint);
    assert.equal(result.expected.sessionId, session.id);
    assert.deepEqual(result.decision, proposal);
    assert.deepEqual(session, before);
    const applied = applyWorkflowConnectionStep({
      ...source,
      session,
      expected: result.expected,
      proposal: result.decision,
    });
    assert.equal(applied.status, 'accepted', JSON.stringify(applied));
    session = applied.session;
  }
  assert.deepEqual(
    finalizeWorkflowConnectionSession({ ...source, session }).edges,
    plan.edges,
  );
});

test('a single-output route goal omits its fixed output from model generation', async () => {
  const { source } = fixture();
  const raw = {
    kind: 'route',
    source: { nodeId: 'source' },
    to: 'detail',
    factIds: ['intent'],
    reason: 'Use the supplied source output.',
  };
  const model = modelFor({ goals: [raw] });
  const session = await planWorkflowConnectionGoals({ ...source, model });
  const { source: selection, ...rest } = raw;
  assert.deepEqual(session.goals[0].decision, {
    ...rest,
    from: selection.nodeId,
    output: 'main',
  });
});

test('unknown endpoint IDs and redundant fixed ports fail without output repair or another invocation', async () => {
  const { source, goals, plan } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  for (const change of [
    (value) => {
      value.decision.addEdges[0].source.nodeId = 'unknown';
    },
    (value) => {
      value.decision.addEdges[0].source.port = 'main';
    },
    (value) => {
      value.expectedRevision = 0;
    },
  ]) {
    const output = {
      decision: modelPatch(source, patch({ addEdges: [plan.edges[0]] })),
    };
    change(output);
    const model = connectionPlanningModel(output);
    await assert.rejects(
      planWorkflowConnectionStep({ ...source, session, model }),
      (error) => {
        assert.ok(error instanceof WorkflowConnectionPlanningError);
        assert.equal(error.diagnostic.code, 'MODEL_OUTPUT_INVALID');
        assert.deepEqual(error.output, output);
        assert.ok(error.cause instanceof Error);
        assert.equal(JSON.stringify(error).includes('addEdges'), false);
        return true;
      },
    );
    assert.equal(model.calls, 1);
    assert.equal(session.revision, 0);
  }
});

test('an all-input join requires an actual chosen port and rejects an absent choice', async () => {
  const { source, goals, plan } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const edge = plan.edges.find((edge) => edge.to === 'join');
  const output = { decision: modelPatch(source, patch({ addEdges: [edge] })) };
  assert.equal(output.decision.addEdges[0].target.port, 'input1');
  const accepted = await planWorkflowConnectionStep({
    ...source,
    session,
    model: modelFor(output),
  });
  assert.deepEqual(accepted.decision.addEdges, [edge]);
  delete output.decision.addEdges[0].target.port;
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel(output),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
});

test('goal coverage validation preserves the proposed output and original cause', async () => {
  const { source, goals } = fixture();
  source.requirements.push({
    id: 'second-fact',
    text: 'Keep a second confirmed requirement.',
    sources: [
      {
        kind: 'message',
        messageId: 'second',
        quote: 'Keep a second confirmed requirement.',
      },
    ],
  });
  const output = { goals };
  const model = modelFor(output);
  await assert.rejects(
    planWorkflowConnectionGoals({ ...source, model }),
    (error) => {
      assert.ok(error instanceof WorkflowConnectionPlanningError);
      assert.equal(error.diagnostic.stage, 'contract-validation');
      assert.match(error.cause.message, /omit a confirmed requirement/);
      assert.deepEqual(error.output, output);
      return true;
    },
  );
  assert.equal(model.calls, 1);
});

test('goal rejection feedback preserves exact model and contract failures without exposing them in the public diagnostic', async () => {
  for (const output of [
    { goals: [] },
    {
      goals: [
        {
          kind: 'precedence',
          before: 'source',
          after: 'source',
          factIds: ['intent'],
          reason: 'An invalid self dependency.',
        },
      ],
    },
  ]) {
    const { source, goals } = fixture();
    let failure;
    await assert.rejects(
      planWorkflowConnectionGoals({
        ...source,
        model: connectionPlanningModel(output),
      }),
      (error) => {
        failure = error;
        return true;
      },
    );
    const rejection = createWorkflowConnectionGoalRejection({
      ...source,
      error: failure,
    });
    assert.ok(rejection);
    assert.deepEqual(rejection.output, output);
    assert.equal(rejection.sourceFingerprint, failure.sourceFingerprint);
    assert.equal(rejection.reason, failure.message);
    assert.equal(Object.hasOwn(failure.toJSON(), 'output'), false);
    assert.equal(Object.hasOwn(failure.toJSON(), 'sourceFingerprint'), false);
    const model = modelFor({ goals }, ({ context }) => {
      assert.deepEqual(context.rejectedProposals, [rejection]);
    });
    const result = await planWorkflowConnectionGoals({
      ...source,
      model,
      rejectedProposals: [rejection],
    });
    assert.equal(result.revision, 0);
    assert.equal(model.calls, 1);
    rejection.output = null;
    assert.deepEqual(failure.output, output);
  }
});

test('goal feedback cannot be reused after the original source or requirements change', async () => {
  const { source, goals } = fixture();
  let failure;
  await assert.rejects(
    planWorkflowConnectionGoals({
      ...source,
      model: connectionPlanningModel({ goals: [] }),
    }),
    (error) => {
      failure = error;
      return true;
    },
  );
  const rejection = createWorkflowConnectionGoalRejection({
    ...source,
    error: failure,
  });
  assert.ok(rejection);
  source.requirements[0].text += ' Changed confirmed requirement.';
  assert.equal(
    createWorkflowConnectionGoalRejection({ ...source, error: failure }),
    undefined,
  );
  const model = modelFor({ goals });
  await assert.rejects(
    planWorkflowConnectionGoals({
      ...source,
      model,
      rejectedProposals: [rejection],
    }),
    /unchanged source and requirements/,
  );
  assert.equal(model.calls, 0);
});

test('transport, cancellation, unrelated stages and non-JSON output are not classified as goal feedback', async () => {
  const { source } = fixture();
  const failures = [
    new Error('Network error'),
    new globalThis.DOMException('Cancelled', 'AbortError'),
    new WorkflowConnectionPlanningError(
      {
        operation: 'planWorkflowConnectionStep',
        stage: 'model-output',
        code: 'MODEL_OUTPUT_INVALID',
        output: {},
      },
      new Error('Wrong stage'),
    ),
    new WorkflowConnectionPlanningError(
      {
        operation: 'planWorkflowConnectionGoals',
        stage: 'model-output',
        code: 'MODEL_OUTPUT_INVALID',
        output: {},
      },
      new Error('No original fingerprint'),
    ),
  ];
  for (const error of failures)
    assert.equal(
      createWorkflowConnectionGoalRejection({ ...source, error }),
      undefined,
    );
  let failure;
  await assert.rejects(
    planWorkflowConnectionGoals({
      ...source,
      model: connectionPlanningModel({ goals: [] }),
    }),
    (error) => {
      failure = error;
      return true;
    },
  );
  const nonJson = new WorkflowConnectionPlanningError(
    {
      operation: 'planWorkflowConnectionGoals',
      stage: 'model-output',
      code: 'MODEL_OUTPUT_INVALID',
      output: { invalid: undefined },
      sourceFingerprint: failure.sourceFingerprint,
    },
    new Error('Not a lossless JSON output'),
  );
  assert.equal(
    createWorkflowConnectionGoalRejection({ ...source, error: nonJson }),
    undefined,
  );
});

test('changed requirements/source during an invocation is an input failure, never a replannable old decision', async () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const output = { decision: modelPatch(source, patch({})) };
  const model = connectionPlanningModel(output, () => {
    source.requirements[0].text += ' changed';
  });
  await assert.rejects(
    planWorkflowConnectionStep({ ...source, session, model }),
    (error) => {
      assert.ok(error instanceof WorkflowConnectionPlanningError);
      assert.equal(error.diagnostic.stage, 'input-validation');
      assert.equal(error.diagnostic.code, 'PLANNING_INPUT_INVALID');
      assert.deepEqual(error.output, output);
      return true;
    },
  );
  assert.equal(model.calls, 1);
});

test('native augmentation requests use the supplied registry only; business questions remain a separate decision', async () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  for (const decision of [
    {
      kind: 'request-native-material',
      capability: 'merge-append',
      purpose: 'Wait for the independent results.',
      factIds: ['intent'],
      reason: 'The agreed scenario requires an all-input join.',
    },
    {
      kind: 'require-user-decision',
      question:
        'Which business outcome should take priority if the confirmed requirements conflict?',
      factIds: ['intent'],
      reason: 'This is a business decision, not a port choice.',
    },
  ]) {
    const model = modelFor({ decision });
    const result = await planWorkflowConnectionStep({
      ...source,
      session,
      model,
    });
    assert.deepEqual(result.decision, decision);
    assert.equal(model.calls, 1);
    assert.equal(session.revision, 0);
  }
  const decision = {
    kind: 'request-native-material',
    capability: 'unregistered-code',
    purpose: 'Missing feature.',
    factIds: ['intent'],
    reason: 'Not in the supplied registry.',
  };
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel({ decision }),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
});

test('an omitted optional registry produces no native augmentation branch and never infers an engine registry', async () => {
  const { source } = fixture();
  source.materials = [source.materials[0]];
  source.nativeNodes = [];
  delete source.capabilities;
  const goals = [
    {
      kind: 'semantic',
      factIds: ['intent'],
      reason: 'Keep the supplied intent.',
    },
  ];
  const session = createWorkflowConnectionSession({ ...source, goals });
  const decision = {
    kind: 'request-completion',
    assessments: [],
    reason: 'Code must still inspect the open graph.',
  };
  const model = modelFor({ decision }, ({ schema, context }) => {
    assert.equal(
      JSON.stringify(schema).includes('request-native-material'),
      false,
    );
    assert.deepEqual(context.availableNativeCapabilities, []);
  });
  const result = await planWorkflowConnectionStep({
    ...source,
    session,
    model,
  });
  assert.equal(result.decision.kind, 'request-completion');
  const applied = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: result.expected,
    proposal: result.decision,
  });
  assert.equal(applied.status, 'rejected');
  assert.equal(applied.violations[0].code, 'NO_PROGRESS');
});

test('prior rejections are explicit validated input and are supplied without an internal retry loop', async () => {
  const { source, goals } = fixture();
  const session = createWorkflowConnectionSession({ ...source, goals });
  const rejectedProposals = [
    {
      expected: describeWorkflowConnectionStep({ ...source, session }).expected,
      proposal: patch({}),
      violations: [
        {
          code: 'NO_PROGRESS',
          message: 'An unchanged plan does not progress.',
        },
      ],
    },
  ];
  const decision = modelPatch(source, patch({}));
  const model = modelFor({ decision }, ({ context }) =>
    assert.deepEqual(context.rejectedProposals, rejectedProposals),
  );
  await planWorkflowConnectionStep({
    ...source,
    session,
    rejectedProposals,
    model,
  });
  assert.equal(model.calls, 1);
  rejectedProposals[0].expected.revision = 1;
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      rejectedProposals,
      model,
    }),
    (error) => error.diagnostic.code === 'PLANNING_INPUT_INVALID',
  );
  assert.equal(model.calls, 1);
});

test('multiple actual output ports require a model choice; unique outputs remain code-owned', async () => {
  const { source, goals } = fixture();
  source.capabilities.push({
    name: 'test-switch',
    description: 'A declared two-way test capability.',
    parametersSchema: z.strictObject({}),
    inputPorts: () => ['main'],
    outputPorts: () => ['yes', 'no'],
    responseReferences: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: true,
  });
  source.nativeNodes.push({
    id: 'switch',
    capability: 'test-switch',
    parameters: {},
  });
  const session = createWorkflowConnectionSession({ ...source, goals });
  const decision = modelPatch(source, patch({}));
  decision.addEdges = [
    { source: { nodeId: 'switch', port: 'yes' }, target: { nodeId: 'source' } },
  ];
  const result = await planWorkflowConnectionStep({
    ...source,
    session,
    model: modelFor({ decision }),
  });
  assert.deepEqual(result.decision.addEdges, [
    { from: 'switch', output: 'yes', to: 'source', input: 'main' },
  ]);
  delete decision.addEdges[0].source.port;
  await assert.rejects(
    planWorkflowConnectionStep({
      ...source,
      session,
      model: connectionPlanningModel({ decision }),
    }),
    (error) => error.diagnostic.code === 'MODEL_OUTPUT_INVALID',
  );
  const description = describeWorkflowConnectionStep({ ...source, session });
  assert.deepEqual(
    description.context.nodes.find((node) => node.id === 'switch').outputs,
    ['yes', 'no'],
  );
});

test('170 supplied instances remain visible and schema growth is linear rather than all node-pair combinations', async () => {
  const sizes = [];
  for (const count of [20, 170]) {
    const { source } = fixture();
    const template = source.materials[0];
    source.materials = Array.from({ length: count }, (_, index) => ({
      ...globalThis.structuredClone(template),
      arguments: {
        ...globalThis.structuredClone(template.arguments),
        callId: `call-${String(index).padStart(3, '0')}`,
      },
      purpose: `Independent supplied call ${index}.`,
    }));
    source.nativeNodes = [];
    const ids = source.materials.map((material) => material.arguments.callId);
    const goals = [
      {
        kind: 'independent',
        nodeIds: ids,
        factIds: ['intent'],
        reason: 'All supplied instances remain available.',
      },
    ];
    let goalSize;
    const session = await planWorkflowConnectionGoals({
      ...source,
      model: modelFor({ goals }, ({ schema, context }) => {
        goalSize = JSON.stringify(schema).length;
        assert.deepEqual(
          context.context.nodes.map((node) => node.id),
          ids,
        );
      }),
    });
    let stepSize;
    await planWorkflowConnectionStep({
      ...source,
      session,
      model: modelFor(
        { decision: modelPatch(source, patch({})) },
        ({ schema, context }) => {
          stepSize = JSON.stringify(schema).length;
          assert.deepEqual(
            context.context.nodes.map((node) => node.id),
            ids,
          );
        },
      ),
    });
    sizes.push({ goalSize, stepSize });
  }
  // Fixed schema overhead plus O(N) identity/port entries. This guards accidental N×N expansion.
  assert.ok(sizes[1].goalSize < sizes[0].goalSize * 10, JSON.stringify(sizes));
  assert.ok(sizes[1].stepSize < sizes[0].stepSize * 10, JSON.stringify(sizes));
});
