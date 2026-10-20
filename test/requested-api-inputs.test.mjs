import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  inspectApiArgumentRequirements,
  validateApiArguments,
  validateApiInputAnswers,
  collectDeferredApiInputSlots,
  inspectDeferredApiInputs,
  listMissingRequestedApiInputs,
  describeWorkflowDraftApiCallArguments,
  createWorkflowDraftApiCallArgumentsSchema,
  resolveWorkflowDraftApiCallArguments,
  assembleWorkflowDraftEdit,
  inspectDraftReadiness,
  createWorkflowDraft,
  createWorkflowDraftEditPlan,
  createWorkflowDraftApiInputEditContract,
  resolveWorkflowDraftApiInputEdits,
  createDeferredApiInputsSchema,
  createWorkflowRuntimeInputsSchema,
  describeWorkflowGraphPlanning,
  describeWorkflowConnectionPlanning,
  validateReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import { generateWorkflowDraftApiCallArguments } from '@openapi-flow/langchain';
import { requestedApiInputFixture } from './fixtures/requested-api-inputs-fixture.mjs';

test('scenario presence does not redefine the OAS or turn unrequested optional fields into missing inputs', async () => {
  const { material, operation } = await requestedApiInputFixture();
  const before = globalThis.structuredClone(operation);
  assert.equal(validateApiArguments(material).valid, true);
  assert.deepEqual(inspectApiArgumentRequirements(material).requirements, []);
  const input = { ...material, requestedInputs: ['/query/filter'] };
  assert.equal(validateApiArguments(input).valid, true);
  const inspected = inspectApiArgumentRequirements(input);
  assert.equal(inspected.status, 'needs-input');
  assert.deepEqual(
    inspected.requirements.map((question) => [
      question.kind,
      question.targetPointer,
    ]),
    [['requested-input', '/query/filter']],
  );
  assert.deepEqual(inspected.requirements[0].schema, { type: 'string' });
  assert.deepEqual(inspected.requirements[0].requestedInputs, [
    '/query/filter',
  ]);
  assert.deepEqual(operation, before);
});

test('standalone orchestration preserves requested input metadata and rejects a falsely ready request before any model', async () => {
  const { material } = await requestedApiInputFixture();
  const ready = {
    status: 'ready',
    operation: material.operation,
    arguments: {
      callId: material.callId,
      values: { query: { filter: '' } },
      bindings: [],
      unresolvedInputs: [],
      requestedInputs: ['/query/filter'],
    },
  };
  const input = {
    mode: 'executable',
    scenario: 'Search with the explicit filter',
    materials: [ready],
    capabilities: [],
    gaps: [],
  };
  const graph = describeWorkflowGraphPlanning(input);
  assert.deepEqual(graph.sources.materials[0].arguments.requestedInputs, [
    '/query/filter',
  ]);
  const connections = describeWorkflowConnectionPlanning(input);
  assert.deepEqual(connections.sources.materials[0].arguments.requestedInputs, [
    '/query/filter',
  ]);
  const missing = { ...ready, arguments: { ...ready.arguments, values: {} } };
  assert.throws(
    () => describeWorkflowGraphPlanning({ ...input, materials: [missing] }),
    /unresolved/,
  );
  assert.throws(
    () =>
      describeWorkflowConnectionPlanning({ ...input, materials: [missing] }),
    /unresolved/,
  );
  assert.throws(
    () =>
      validateReviewableWorkflowGraphPlan({
        capabilities: [],
        materials: [missing],
        plan: {
          nativeNodes: [],
          edges: [],
          starts: [material.callId],
          gaps: [],
          blockedCalls: [],
        },
      }),
    /unresolved request inputs/,
  );
});

test('an explicit removal withdraws an unresolved optional intent without a fake value or silent removal of other intents', async () => {
  const fixture = await requestedApiInputFixture();
  const context = {
    ...fixture.input.context,
    messages: [
      {
        id: 'remove-1',
        text: '검색 필터는 적용하지 마. enabled 설정은 유지해.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'remove-unresolved-intent',
      requirements: [],
      nativeNodes: [],
      edges: [],
      apiCalls: [
        {
          id: 'search',
          operation: fixture.operation.key,
          values: {},
          bindings: [],
          requestedInputs: ['/query/filter', '/body/config/enabled'],
        },
      ],
    },
  });
  const sources = [
    { kind: 'message', messageId: 'remove-1', quote: context.messages[0].text },
  ];
  const plan = createWorkflowDraftEditPlan({
    draft,
    context,
    requestMessageIds: ['remove-1'],
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'search',
          instruction: context.messages[0].text,
          sources,
        },
      ],
    },
  });
  const input = {
    draft,
    context,
    plan,
    requestMessageIds: ['remove-1'],
    stepId: plan.steps[0].id,
    resolutions: [],
  };
  const contract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: [{ kind: 'remove', pointer: '/query/filter', sources }],
    },
  });
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract,
    output: { values: {} },
  });
  assert.equal(result.status, 'ready');
  const edited = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(edited.draft.apiCalls[0].requestedInputs, [
    '/body/config/enabled',
  ]);
  assert.deepEqual(edited.draft.apiCalls[0].values, {});
  assert.deepEqual(
    inspectDraftReadiness({ context, draft: edited.draft }).slots.map(
      (slot) => slot.targetPointer,
    ),
    ['/body'],
  );
  assert.throws(
    () =>
      createWorkflowDraftApiInputEditContract({
        ...input,
        proposal: {
          targets: [{ kind: 'remove', pointer: '/body/config/label', sources }],
        },
      }),
    /absent value/,
  );
});

test('replacing the API never copies scenario input intents from the old operation', async () => {
  const fixture = await requestedApiInputFixture();
  const context = {
    ...fixture.input.context,
    messages: [{ id: 'replace-1', text: '검색 대신 seed 조회만 사용해.' }],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'replace-presence',
      requirements: [],
      nativeNodes: [],
      edges: [],
      apiCalls: [
        {
          id: 'search',
          operation: fixture.operation.key,
          values: {},
          bindings: [],
          requestedInputs: ['/query/filter'],
        },
      ],
    },
  });
  const plan = createWorkflowDraftEditPlan({
    draft,
    context,
    requestMessageIds: ['replace-1'],
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'search',
          operation: fixture.seed.key,
          instruction: context.messages[0].text,
          sources: [
            {
              kind: 'message',
              messageId: 'replace-1',
              quote: context.messages[0].text,
            },
          ],
        },
      ],
    },
  });
  const edited = assembleWorkflowDraftEdit({
    draft,
    context,
    plan,
    requestMessageIds: ['replace-1'],
    resolutions: [
      { kind: 'api-call', stepId: plan.steps[0].id, values: {}, bindings: [] },
    ],
  });
  assert.equal(
    Object.hasOwn(edited.draft.apiCalls[0], 'requestedInputs'),
    false,
  );
  assert.deepEqual(
    inspectDraftReadiness({ context, draft: edited.draft }).slots,
    [],
  );
});

test('known false, zero, null and empty text satisfy presence without coercion or prototype lookup', async () => {
  const { material } = await requestedApiInputFixture();
  const values = {
    body: { config: { enabled: false, count: 0, nullable: null, label: '' } },
  };
  const requestedInputs = Object.keys(values.body.config).map(
    (key) => '/body/config/' + key,
  );
  assert.equal(
    inspectApiArgumentRequirements({ ...material, values, requestedInputs })
      .status,
    'ready',
  );
  assert.deepEqual(
    listMissingRequestedApiInputs({
      source: 'test',
      rootPointer: '/body',
      value: values.body,
      requestedInputs,
    }),
    [],
  );
  assert.deepEqual(
    listMissingRequestedApiInputs({
      source: 'test',
      rootPointer: '',
      value: Object.create({ body: values.body }),
      requestedInputs,
    }),
    requestedInputs,
  );
  assert.throws(
    () =>
      listMissingRequestedApiInputs({
        source: 'test',
        rootPointer: '/body',
        value: {},
        requestedInputs: ['/query/filter'],
      }),
    /outside/,
  );
});

test('metadata requires distinct real OAS pointers and never invents values for invalid or undeclared inputs', async () => {
  const { material } = await requestedApiInputFixture();
  for (const requestedInputs of [
    [''],
    ['/query/filter', '/query/filter'],
    ['/body/config/~x'],
    ['/query/absent'],
  ])
    assert.throws(() =>
      inspectApiArgumentRequirements({ ...material, requestedInputs }),
    );
  assert.throws(
    () =>
      inspectApiArgumentRequirements({
        ...material,
        requestedInputs: 'filter',
      }),
    /must be an array/,
  );
});

test('one original parent question requires requested optional descendants in both typed answers and execution slots', async () => {
  const { material, schema, operation } = await requestedApiInputFixture();
  const input = {
    ...material,
    requestedInputs: ['/body/config/enabled', '/body/config/count'],
  };
  const requirements = inspectApiArgumentRequirements(input).requirements;
  assert.equal(requirements.length, 1);
  assert.equal(requirements[0].targetPointer, '/body');
  assert.deepEqual(requirements[0].schema, schema);
  const answer = (value) =>
    validateApiInputAnswers({
      requirements,
      operations: [operation.key],
      answers: [{ requirementId: requirements[0].id, value }],
    });
  assert.equal(answer({ config: {} }).status, 'invalid-answer');
  assert.equal(
    answer({ config: { enabled: false, count: 0 } }).status,
    'accepted',
  );
  const slots = collectDeferredApiInputSlots({ materials: [input] });
  assert.deepEqual(slots[0].requestedInputs, input.requestedInputs);
  for (const schema of [
    createDeferredApiInputsSchema(slots),
    createWorkflowRuntimeInputsSchema(slots),
  ]) {
    assert.equal(
      schema.safeParse({ [slots[0].id]: { config: {} } }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        [slots[0].id]: { config: { enabled: false, count: 0 } },
      }).success,
      true,
    );
    const wire = z.toJSONSchema(schema);
    assert.equal(
      Object.hasOwn(wire.properties[slots[0].id].properties.config, 'required'),
      false,
    );
  }
  assert.equal(
    inspectDeferredApiInputs({
      materials: [input],
      inputValues: { [slots[0].id]: { config: {} } },
    }).status,
    'invalid-input',
  );
  const complete = inspectDeferredApiInputs({
    materials: [input],
    inputValues: { [slots[0].id]: { config: { enabled: false, count: 0 } } },
  });
  assert.equal(complete.status, 'ready');
  assert.deepEqual(
    complete.arguments[0].requestedInputs,
    input.requestedInputs,
  );
  assert.deepEqual(complete.arguments[0].values, {
    body: { config: { enabled: false, count: 0 } },
  });
});

test('nested requests use the first missing container and never synthesize sparse arrays or overwrite existing values', async () => {
  const { material } = await requestedApiInputFixture();
  const nested = {
    ...material,
    values: { body: {} },
    requestedInputs: ['/body/config/enabled'],
  };
  assert.deepEqual(
    inspectApiArgumentRequirements(nested).requirements.map(
      (question) => question.targetPointer,
    ),
    ['/body/config'],
  );
  const array = {
    ...material,
    values: { body: {} },
    requestedInputs: ['/body/rows/2/name'],
  };
  const [slot] = collectDeferredApiInputSlots({ materials: [array] });
  assert.equal(slot.targetPointer, '/body/rows');
  assert.equal(
    inspectDeferredApiInputs({
      materials: [array],
      inputValues: { [slot.id]: [{ name: 'a' }] },
    }).status,
    'invalid-input',
  );
  const full = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  assert.equal(
    inspectDeferredApiInputs({
      materials: [array],
      inputValues: { [slot.id]: full },
    }).status,
    'ready',
  );
  assert.deepEqual(array.values, { body: {} });
});

test('explicit parent/child bindings own presence until the final runtime request, not duplicate literal slots', async () => {
  const { material } = await requestedApiInputFixture();
  for (const targetPointer of [
    '/body',
    '/body/config',
    '/body/config/enabled',
  ]) {
    const input = {
      ...material,
      requestedInputs: ['/body/config/enabled'],
      bindings: [
        {
          kind: 'node-output',
          targetPointer,
          sourceNodeId: 'seed',
          sourcePointer: '',
        },
      ],
    };
    assert.equal(inspectApiArgumentRequirements(input).status, 'ready');
    assert.deepEqual(collectDeferredApiInputSlots({ materials: [input] }), []);
  }
});

test('a missing optional sibling never becomes a parent question overlapping an existing binding', async () => {
  const { material } = await requestedApiInputFixture();
  const input = {
    ...material,
    requestedInputs: ['/body/config/enabled'],
    bindings: [
      {
        kind: 'node-output',
        targetPointer: '/body/config/count',
        sourceNodeId: 'seed',
        sourcePointer: '/config/count',
      },
    ],
  };
  const [slot] = collectDeferredApiInputSlots({ materials: [input] });
  assert.equal(slot.targetPointer, '/body/config/enabled');
  const resolved = inspectDeferredApiInputs({
    materials: [input],
    inputValues: { [slot.id]: false },
  });
  assert.equal(resolved.status, 'ready');
  assert.deepEqual(resolved.arguments[0].values, {
    body: { config: { enabled: false } },
  });
  assert.deepEqual(resolved.arguments[0].bindings, input.bindings);
});

test('the opt-in output adds only requested paths to the existing value call and retains OAS-typed literal output', async () => {
  const { input } = await requestedApiInputFixture();
  const tracked = { ...input, trackRequestedInputs: true };
  const proposal = {
    values: {},
    requestedInputs: ['/query/filter'],
    sourceMessageIds: input.requestMessageIds,
  };
  const schema = createWorkflowDraftApiCallArgumentsSchema(tracked);
  assert.ok(z.toJSONSchema(schema).required.includes('requestedInputs'));
  assert.equal(
    schema.safeParse({ ...proposal, requestedInputs: ['/query/not-declared'] })
      .success,
    false,
  );
  assert.equal(
    createWorkflowDraftApiCallArgumentsSchema(input).safeParse(proposal)
      .success,
    false,
  );
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push({
            schema,
            options,
            payload: JSON.parse(messages[1].content),
          });
          return proposal;
        },
      };
    },
  };
  const result = await generateWorkflowDraftApiCallArguments({
    ...tracked,
    model,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.name, 'generate_draft_api_call_arguments');
  assert.equal(calls[0].payload.trackRequestedInputs, true);
  assert.equal(result.status, 'needs-input');
  assert.deepEqual(result.arguments.values, {});
  assert.deepEqual(result.arguments.requestedInputs, ['/query/filter']);
  assert.throws(
    () =>
      describeWorkflowDraftApiCallArguments({
        ...input,
        trackRequestedInputs: 'true',
      }),
    /boolean/,
  );
  assert.notEqual(
    describeWorkflowDraftApiCallArguments(input).fingerprint,
    describeWorkflowDraftApiCallArguments(tracked).fingerprint,
  );
});

test('answers reuse the original proposal without a model replay and canonical drafts retain scenario-required slots', async () => {
  const { input } = await requestedApiInputFixture();
  const args = { ...input, trackRequestedInputs: true };
  const proposal = {
    values: {},
    requestedInputs: ['/query/filter'],
    sourceMessageIds: input.requestMessageIds,
  };
  const resolve = (context) =>
    resolveWorkflowDraftApiCallArguments({
      ...context,
      fingerprint: describeWorkflowDraftApiCallArguments(context).fingerprint,
      proposal,
    });
  const pending = resolve(args);
  const accepted = validateApiInputAnswers({
    requirements: pending.requirements,
    operations: input.context.operations.map((operation) => operation.key),
    answers: [{ requirementId: pending.requirements[0].id, value: '' }],
  });
  assert.equal(accepted.status, 'accepted');
  const complete = resolve({
    ...args,
    confirmedInputs: accepted.confirmedInputs,
  });
  assert.equal(complete.status, 'ready');
  assert.deepEqual(complete.arguments.values, { query: { filter: '' } });
  const deferred = resolve({ ...args, allowRuntimeInputs: true });
  assert.equal(deferred.status, 'ready');
  assert.equal(deferred.inputMode, 'runtime-inputs');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [deferred.resolution],
  });
  assert.deepEqual(candidate.draft.apiCalls[0].requestedInputs, [
    '/query/filter',
  ]);
  const readiness = inspectDraftReadiness({
    draft: candidate.draft,
    context: input.context,
  });
  assert.equal(readiness.requestInputsReady, false);
  assert.equal(readiness.slots.length, 1);
});
