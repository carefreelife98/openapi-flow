import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createWorkflowConnectionSession,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  inspectWorkflowConnectionDelivery,
  resolveNativeInstanceSelection,
  describeNativeNodeConfiguration,
  createNativeNodeParametersSchema,
  resolveNativeNodeParameters,
  NativeParameterMaterialUnavailableError,
  assertWorkflowConnectionReviewCanContinue,
  WorkflowConnectionUnsupportedRequirementsError,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  createJsonOutputCapability,
  compileWorkflowConnectionDelivery,
  createWorkflowConnectionDeliveryApiNodes,
} from '@openapi-flow/n8n';
import * as nativeBindingFixture from './fixtures/native-output-binding-fixture.mjs';
import {
  planWorkflowConnectionGoals,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelRegion,
} from './fixtures/incremental-connection-fixture.mjs';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import { connectionPlanningModel } from './fixtures/connection-planning-record-fixture.mjs';

function apply(source, session, proposal) {
  const result = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal,
  });
  assert.equal(result.status, 'accepted', JSON.stringify(result));
  return result.session;
}

test('a closed API inventory is checked by Core and cannot be overruled by hidden implementation doubts', async () => {
  const f = incrementalConnectionFixture();
  const nodeIds = f.source.materials.map(
    (material) => material.arguments.callId,
  );
  const goal = {
    kind: 'operation-set',
    nodeIds,
    factIds: ['intent'],
    reason: 'Only the supplied call instances may run.',
  };
  const model = connectionPlanningModel({ goals: [...f.goals, goal] });
  let session = await planWorkflowConnectionGoals({ ...f.source, model });
  session = apply(
    f.source,
    session,
    incrementalConnectionPatch({
      addEdges: f.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(
    inspectWorkflowConnectionCompletion({ ...f.source, session }).ready,
    true,
  );
  const target = session.goals.find(
    (item) => item.decision.kind === 'operation-set',
  );
  const result = applyWorkflowConnectionStep({
    ...f.source,
    session,
    expected: describeWorkflowConnectionStep({ ...f.source, session }).expected,
    proposal: {
      kind: 'request-completion',
      reason: 'Try to add an external proof obligation.',
      assessments: [
        {
          goalId: target.id,
          scope: 'materials',
          status: 'insufficient-evidence',
          evidenceRefs: [],
          nodeIds: [],
          reason:
            'Cannot prove that the remote read handlers have no side effects.',
        },
      ],
    },
  });
  assert.equal(result.status, 'rejected');
  assert.match(result.violations[0].message, /known semantic goal/);
  assert.equal(
    inspectWorkflowConnectionCompletion({ ...f.source, session }).ready,
    true,
  );
});

test('an extra configured operation fails the exact inventory comparison', () => {
  const f = incrementalConnectionFixture();
  const goals = [
    ...f.goals,
    {
      kind: 'operation-set',
      nodeIds: f.source.materials
        .slice(1)
        .map((material) => material.arguments.callId),
      factIds: ['intent'],
      reason: 'Exclude the first operation.',
    },
  ];
  let session = createWorkflowConnectionSession({ ...f.source, goals });
  session = apply(
    f.source,
    session,
    incrementalConnectionPatch({
      addEdges: f.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  const check = inspectWorkflowConnectionCompletion({ ...f.source, session });
  assert.equal(check.unmetGoalIds.length, 1);
  assert.equal(check.semanticAssessmentGoalIds.length, 0);
});

test('inventory goals cannot include native nodes, duplicate IDs or fabricated APIs', () => {
  const f = incrementalConnectionFixture();
  for (const nodeIds of [['join'], ['source', 'source'], ['invented']])
    assert.throws(
      () =>
        createWorkflowConnectionSession({
          ...f.source,
          goals: [
            {
              kind: 'operation-set',
              nodeIds,
              factIds: ['intent'],
              reason: 'Invalid ownership.',
            },
          ],
        }),
      /API call IDs/,
    );
});

test('an explicit declared-contract boundary rejects a duplicate free semantic veto at admission', async () => {
  const f = incrementalConnectionFixture();
  const source = { ...f.source, reviewBoundary: 'declared-contract' };
  const semantic = {
    kind: 'semantic',
    scope: 'materials',
    factIds: ['intent'],
    reason: 'Demand extra hidden implementation proof.',
  };
  assert.throws(
    () =>
      createWorkflowConnectionSession({
        ...source,
        goals: [...f.goals, semantic],
      }),
    /free semantic verdict/,
  );
  await assert.rejects(
    planWorkflowConnectionGoals({
      ...source,
      model: connectionPlanningModel({ goals: [...f.goals, semantic] }),
    }),
    /invalid_union/,
  );
  let session = createWorkflowConnectionSession({ ...source, goals: f.goals });
  session = apply(
    source,
    session,
    incrementalConnectionPatch({
      addEdges: f.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(
    inspectWorkflowConnectionCompletion({ ...source, session }).ready,
    true,
  );
  assert.throws(
    () => inspectWorkflowConnectionCompletion({ ...f.source, session }),
    /different source snapshot/,
  );
});

test('the real incremental graph finishes declared-contract checks without an extra free semantic review', async () => {
  const f = incrementalConnectionFixture();
  const source = { ...f.source, reviewBoundary: 'declared-contract' };
  const region = incrementalConnectionModelRegion(
    source,
    incrementalConnectionPatch({
      addEdges: f.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          calls++;
          if (calls === 1) return { goals: f.goals };
          if (calls === 2) return { decision: region };
          throw new Error('Unexpected extra final semantic review');
        },
      };
    },
  };
  const result = await createIncrementalWorkflowConnectionGraph({
    source: () => source,
    model,
    policy: {
      maxModelInvocations: 2,
      maxRejectedProposals: 0,
      deadlineMs: 30_000,
    },
  }).invoke({});
  assert.equal(result.status, 'complete');
  assert.equal(calls, 2);
  assert.deepEqual(result.plan.edges, f.plan.edges);
});

function partialFixture() {
  const capability = createJsonOutputCapability({
    name: 'context',
    description: 'Emit the supplied object.',
    parametersSchema: z.strictObject({ value: z.string() }),
  });
  const source = {
    scenario:
      'Produce A independently. B requires an unavailable external guarantee.',
    materials: [],
    capabilities: [capability],
    nativeNodes: [
      { id: 'a', capability: 'context', parameters: { value: 'A' } },
      { id: 'b', capability: 'context', parameters: { value: 'B' } },
    ],
    requirements: [
      {
        id: 'intent',
        text: 'Produce A independently. B requires an unavailable external guarantee.',
        sources: [
          {
            kind: 'message',
            messageId: 'request',
            quote:
              'Produce A independently. B requires an unavailable external guarantee.',
          },
        ],
      },
    ],
  };
  const goals = [
    {
      kind: 'material-value',
      nodeId: 'a',
      materialKind: 'native-material',
      pointer: '/node/parameters/value',
      expected: 'A',
      factIds: ['intent'],
      reason: 'A must retain the requested value.',
    },
    {
      kind: 'unsupported',
      limitation: 'verification',
      nodeIds: ['b'],
      factIds: ['intent'],
      reason:
        'The supplied contract does not establish the explicitly requested external guarantee for B.',
    },
  ];
  const session = createWorkflowConnectionSession({ ...source, goals });
  return { source, session };
}

test('partial delivery preserves the independent configured graph and original unsupported requirement', () => {
  const f = partialFixture();
  const session = apply(
    f.source,
    f.session,
    incrementalConnectionPatch({
      addRootNodeIds: ['a', 'b'],
      addTerminals: [
        { nodeId: 'a', output: 'main' },
        { nodeId: 'b', output: 'main' },
      ],
    }),
  );
  const result = compileWorkflowConnectionDelivery({
    ...f.source,
    session,
    id: 'partial',
    name: 'Partial',
    apiNodes: [],
  });
  assert.equal(result.inspection.status, 'partial');
  assert.throws(
    () =>
      assertWorkflowConnectionReviewCanContinue(
        inspectWorkflowConnectionCompletion({ ...f.source, session }),
      ),
    WorkflowConnectionUnsupportedRequirementsError,
  );
  assert.deepEqual(
    result.runnable.map((part) => part.nodeIds),
    [['a']],
  );
  assert.deepEqual(result.drafts[0].nativeNodes[0].parameters, { value: 'B' });
  assert.deepEqual(
    result.inspection.unmetGoals[0].decision,
    f.session.goals[1].decision,
  );
  assert.equal(
    result.runnable[0].result.workflow.nodes.some((node) => node.name === 'a'),
    true,
  );
  assert.equal(
    result.runnable[0].result.workflow.nodes.some((node) => node.name === 'b'),
    false,
  );
  assert.ok(Object.keys(result.runnable[0].result.workflow.connections).length);
});

test('a component depending on the unsupported stage remains a draft with its actual edge intact', () => {
  const f = partialFixture();
  const edge = { from: 'b', output: 'main', to: 'a', input: 'main' };
  const session = apply(
    f.source,
    f.session,
    incrementalConnectionPatch({
      addRootNodeIds: ['b'],
      addEdges: [edge],
      addTerminals: [{ nodeId: 'a', output: 'main' }],
    }),
  );
  const result = inspectWorkflowConnectionDelivery({ ...f.source, session });
  assert.equal(result.status, 'draft');
  assert.equal(result.components[0].plan, undefined);
  assert.deepEqual(result.components[0].edges, [edge]);
});

test('an unresolved draft retains exact prepared API values and bindings without including OAS documents', () => {
  const f = incrementalConnectionFixture();
  let session = createWorkflowConnectionSession({
    ...f.source,
    goals: [
      ...f.goals,
      {
        kind: 'unsupported',
        limitation: 'verification',
        nodeIds: ['source'],
        factIds: ['intent'],
        reason: 'An explicit external guarantee remains unverified.',
      },
    ],
  });
  session = apply(
    f.source,
    session,
    incrementalConnectionPatch({
      addEdges: f.plan.edges,
      addRootNodeIds: ['source'],
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  const delivery = inspectWorkflowConnectionDelivery({ ...f.source, session });
  assert.equal(delivery.status, 'draft');
  const calls = delivery.components.flatMap((component) => component.apiCalls);
  assert.equal(calls.length, f.source.materials.length);
  for (const material of f.source.materials) {
    const call = calls.find(
      (candidate) => candidate.id === material.arguments.callId,
    );
    assert.deepEqual(call.values, material.arguments.values);
    assert.deepEqual(call.bindings, material.arguments.bindings);
    assert.deepEqual(call.operation, material.operation.key);
    assert.equal(Object.hasOwn(call.operation, 'operation'), false);
  }
});

for (const expected of ['wrong', null, false, 0]) {
  test(`a material-value mismatch (${JSON.stringify(expected)}) blocks the affected component`, () => {
    const f = partialFixture();
    const goals = f.session.goals.map((goal) => ({
      ...goal.decision,
      ...(goal.decision.kind === 'material-value' ? { expected } : {}),
    }));
    let session = createWorkflowConnectionSession({ ...f.source, goals });
    session = apply(
      f.source,
      session,
      incrementalConnectionPatch({
        addRootNodeIds: ['a', 'b'],
        addTerminals: [
          { nodeId: 'a', output: 'main' },
          { nodeId: 'b', output: 'main' },
        ],
      }),
    );
    assert.equal(
      inspectWorkflowConnectionDelivery({ ...f.source, session }).status,
      'draft',
    );
  });
}

test('a missing required material field is a mismatch, not a default or inferred value', () => {
  const f = partialFixture();
  const goals = f.session.goals.map((goal) => ({
    ...goal.decision,
    ...(goal.decision.kind === 'material-value'
      ? { pointer: '/node/parameters/missing', expected: null }
      : {}),
  }));
  assert.throws(
    () => createWorkflowConnectionSession({ ...f.source, goals }),
    /not a current declared scalar configuration field/,
  );
});

test('an unfinished terminal cannot be silently added to make a component runnable', () => {
  const f = partialFixture();
  const session = apply(
    f.source,
    f.session,
    incrementalConnectionPatch({
      addRootNodeIds: ['a', 'b'],
      addTerminals: [{ nodeId: 'b', output: 'main' }],
    }),
  );
  const check = inspectWorkflowConnectionDelivery({ ...f.source, session });
  assert.equal(check.status, 'draft');
  assert.equal(
    check.components.find((part) => part.nodeIds.includes('a')).openBoundaries
      .length,
    1,
  );
});

function configuration(capability) {
  const input = {
    planId: 'policy',
    scenario: 'Stop when required data is missing.',
    capabilities: [capability],
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: [
        {
          capability: capability.name,
          purpose: 'Required failure handling',
          parameterSource: 'literal',
        },
      ],
      gaps: [],
    },
  });
  return { ...input, selection, nodeId: selection.instances[0].id };
}

test('generated failure copy is permitted while a request for its exact wording is unrepresentable', async () => {
  const capability = createN8nNativeCapabilities().find(
    (entry) => entry.name === 'stop-and-error',
  );
  const input = configuration(capability);
  const question = {
    decision: {
      status: 'needs-clarification',
      message: 'What exact error text should I use?',
    },
  };
  assert.equal(
    createNativeNodeParametersSchema(input).safeParse(question).success,
    false,
  );
  const proposal = {
    decision: {
      status: 'provided',
      parameters: { message: 'Required data is missing.' },
    },
  };
  const result = await generateNativeNodeParameters({
    ...input,
    model: connectionPlanningModel(proposal),
  });
  assert.equal(result.status, 'ready');
  assert.equal(
    result.node.parameters.message,
    proposal.decision.parameters.message,
  );
});

test('missing system contracts are surfaced as technical limitations, never business questions', () => {
  const capability = createN8nNativeCapabilities().find(
    (entry) => entry.name === 'stop-and-error',
  );
  const input = configuration(capability);
  assert.throws(
    () =>
      resolveNativeNodeParameters({
        ...input,
        fingerprint: describeNativeNodeConfiguration(input).fingerprint,
        proposal: {
          decision: {
            status: 'needs-materials',
            message: 'Producer upstream lacks an output schema at /result.',
          },
        },
      }),
    (error) =>
      error instanceof NativeParameterMaterialUnavailableError &&
      error.message.includes('/result'),
  );
});

test('only explicitly declared business inputs may become questions; field names do not determine responsibility', () => {
  const capability = createJsonOutputCapability({
    name: 'business-message',
    description: 'A message is business data in this capability.',
    parametersSchema: z.strictObject({
      message: z.string(),
      label: z.string(),
    }),
  });
  capability.parameterValuePolicy = {
    businessInputPaths: ['/message'],
    generatedTextPaths: ['/label'],
  };
  const input = configuration(capability);
  const proposal = (fieldPointers) => ({
    decision: {
      status: 'needs-clarification',
      message: 'Supply the business message.',
      fieldPointers,
    },
  });
  const schema = createNativeNodeParametersSchema(input);
  assert.equal(schema.safeParse(proposal(['/message'])).success, true);
  assert.equal(schema.safeParse(proposal(['/label'])).success, false);
  assert.equal(schema.safeParse(proposal(['/upstream'])).success, false);
  assert.equal(
    schema.safeParse(proposal(['/message', '/message'])).success,
    false,
  );
  const question = resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: proposal(['/message']),
  });
  assert.equal(question.status, 'needs-clarification');
  const next = {
    ...input,
    replies: [{ question, text: 'The exact business message.' }],
  };
  assert.doesNotThrow(() => describeNativeNodeConfiguration(next));
});

test('missing value responsibility is not silently interpreted as a business question', () => {
  const capability = createJsonOutputCapability({
    name: 'undeclared',
    description: 'Owner has not declared value responsibility.',
    parametersSchema: z.strictObject({ value: z.string() }),
  });
  delete capability.parameterValuePolicy;
  const input = configuration(capability);
  assert.equal(
    createNativeNodeParametersSchema(input).safeParse({
      decision: {
        status: 'needs-clarification',
        fieldPointers: ['/value'],
        message: 'Supply a value.',
      },
    }).success,
    false,
  );
});

test('ambiguous value responsibility fails at capability intake before a model can author business data', () => {
  const capability = createJsonOutputCapability({
    name: 'ambiguous',
    description: 'Conflicting owner declaration.',
    parametersSchema: z.strictObject({ value: z.string() }),
    parameterValuePolicy: {
      businessInputPaths: [''],
      generatedTextPaths: ['/value'],
    },
  });
  assert.throws(() => configuration(capability), /must not overlap/);
});

test('a policy cannot authorize a question about a field absent from the actual literal schema', () => {
  const capability = createJsonOutputCapability({
    name: 'declared',
    description: 'Typed business object.',
    parametersSchema: z.strictObject({ value: z.string() }),
    parameterValuePolicy: {
      businessInputPaths: ['/missing'],
      generatedTextPaths: [],
    },
  });
  const input = configuration(capability);
  assert.equal(
    createNativeNodeParametersSchema(input).safeParse({
      decision: {
        status: 'needs-clarification',
        fieldPointers: ['/missing'],
        message: 'Supply the nonexistent field.',
      },
    }).success,
    false,
  );
});

test('delivery rejects source drift rather than reusing a prior success receipt', () => {
  const f = partialFixture();
  const source = {
    ...f.source,
    nativeNodes: f.source.nativeNodes.map((node) =>
      node.id === 'a' ? { ...node, parameters: { value: 'changed' } } : node,
    ),
  };
  assert.throws(
    () => inspectWorkflowConnectionDelivery({ ...source, session: f.session }),
    /different source snapshot/,
  );
});

for (const [container, size, unmet] of [
  ['array', 2, true],
  ['object', 3, true],
  ['array', 3, false],
]) {
  test(`a declared-contract shape checks container=${container} and size=${size} without overlooking extra values`, () => {
    const capability = createJsonOutputCapability({
      name: 'list',
      description: 'Typed business list.',
      parametersSchema: z.strictObject({ values: z.array(z.string()) }),
    });
    const source = {
      reviewBoundary: 'declared-contract',
      scenario: 'Use exactly the requested list.',
      capabilities: [capability],
      materials: [],
      nativeNodes: [
        {
          id: 'list',
          capability: capability.name,
          parameters: { values: ['one', 'two', 'extra'] },
        },
      ],
      requirements: [
        {
          id: 'intent',
          text: 'Use exactly the requested list.',
          sources: [
            {
              kind: 'message',
              messageId: 'request',
              quote: 'Use exactly the requested list.',
            },
          ],
        },
      ],
    };
    let session = createWorkflowConnectionSession({
      ...source,
      goals: [
        {
          kind: 'material-shape',
          nodeId: 'list',
          materialKind: 'native-material',
          pointer: '/node/parameters/values',
          container,
          size,
          factIds: ['intent'],
          reason:
            'Check the original list shape, not only its first two entries.',
        },
      ],
    });
    session = apply(
      source,
      session,
      incrementalConnectionPatch({
        addRootNodeIds: ['list'],
        addTerminals: [{ nodeId: 'list', output: 'main' }],
      }),
    );
    assert.equal(
      inspectWorkflowConnectionCompletion({ ...source, session }).unmetGoalIds
        .length > 0,
      unmet,
    );
    assert.equal(
      inspectWorkflowConnectionDelivery({ ...source, session }).components[0]
        .plan === undefined,
      unmet,
    );
  });
}

test('delivery request compilation uses actual native SDK output identities and original binding contracts', async () => {
  const catalog = await createApiCatalog([
    {
      id: 'delivery-api',
      spec: {
        ...globalThis.structuredClone(nativeBindingFixture.spec),
        servers: [{ url: 'https://fixture.test' }],
      },
    },
  ]);
  const candidate = catalog.operations.find(
    (operation) =>
      operation.path === nativeBindingFixture.material.operation.path &&
      operation.method === nativeBindingFixture.material.operation.method,
  );
  assert.ok(candidate);
  const [operation] = await resolveApiOperations(catalog, [candidate.key]);
  const source = {
    scenario: 'Use the supplied context identifier in the detail request.',
    capabilities: nativeBindingFixture.capabilities,
    nativeNodes: nativeBindingFixture.nativeNodes,
    materials: [
      { status: 'ready', operation, arguments: nativeBindingFixture.args },
    ],
    requirements: [
      {
        id: 'intent',
        text: 'Use the supplied context identifier in the detail request.',
        sources: [
          {
            kind: 'message',
            messageId: 'request',
            quote: 'Use the supplied context identifier in the detail request.',
          },
        ],
      },
    ],
  };
  let session = createWorkflowConnectionSession({
    ...source,
    goals: [
      {
        kind: 'precedence',
        before: 'context',
        after: 'detail',
        factIds: ['intent'],
        reason: 'Retain the required native data source.',
      },
    ],
  });
  session = apply(
    source,
    session,
    incrementalConnectionPatch({
      addRootNodeIds: ['context'],
      addEdges: nativeBindingFixture.plan.edges,
      addTerminals: [{ nodeId: 'detail', output: 'main' }],
    }),
  );
  const apiNodes = createWorkflowConnectionDeliveryApiNodes({
    ...source,
    session,
  });
  const result = compileWorkflowConnectionDelivery({
    ...source,
    session,
    apiNodes,
    id: 'binding-delivery',
    name: 'Binding delivery',
  });
  assert.equal(result.inspection.status, 'complete');
  assert.equal(result.runnable.length, 1);
  assert.deepEqual(
    source.materials[0].arguments.bindings,
    nativeBindingFixture.bindings,
  );
  assert.equal(
    result.runnable[0].result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length,
    1,
  );
});
