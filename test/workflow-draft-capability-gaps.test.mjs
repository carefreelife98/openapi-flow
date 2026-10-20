import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  createWorkflowDraft,
  createWorkflowDraftCapabilityGap,
  inspectWorkflowDraftCapabilityGap,
  inspectDraftReadiness,
  validateWorkflowDraft,
  stageWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  describeWorkflowDraftConnectionEdit,
  describeWorkflowDraftSelectedNodes,
  resolveWorkflowDraftTerminalRemoval,
  resolveWorkflowDraftConnectionEdit,
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
  describeWorkflowPlanningContext,
  createApiCatalog,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  resolveN8nNativeFeatures,
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
  describeN8nManualTrigger,
} from '@openapi-flow/n8n';
import { capabilityGapFixture } from './fixtures/workflow-draft-capability-gap-fixture.mjs';

test('gap evidence captures only actual supplied inventory and unchanged messages, not fabricated contracts', async () => {
  const f = await capabilityGapFixture();
  assert.deepEqual(f.gap.sources, [
    {
      kind: 'message',
      messageId: 'gap-request',
      quote: f.context.messages[0].text,
    },
  ]);
  assert.equal(f.gap.inventory.operations.length, 2);
  assert.deepEqual(f.gap.inventory.capabilities, []);
  assert.deepEqual(
    inspectWorkflowDraftCapabilityGap({ gap: f.gap, context: f.context }),
    { inventoryCurrent: true },
  );
  assert.equal(Object.hasOwn(f.gap, 'operation'), false);
  assert.equal(Object.hasOwn(f.gap, 'responseSchema'), false);
  assert.throws(
    () =>
      createWorkflowDraftCapabilityGap({
        id: 'x',
        requestedBehavior: 'x',
        finding: f.finding,
        sourceMessageIds: [],
        context: f.context,
      }),
    /sourceMessageIds/,
  );
  assert.throws(
    () =>
      createWorkflowDraftCapabilityGap({
        id: 'x',
        requestedBehavior: 'x',
        finding: f.finding,
        sourceMessageIds: ['unknown'],
        context: f.context,
      }),
    /unknown message/,
  );
});

test('a reported gap gets a code-owned structural identity with no value-generation or clarification stage', async () => {
  const f = await capabilityGapFixture();
  const input = f.editInput([
    { kind: 'report-capability-gap', finding: f.finding },
  ]);
  assert.equal(input.plan.status, 'ready-for-planning');
  assert.ok(input.plan.steps[0].newNodeId);
  assert.deepEqual(input.plan.steps[0].stages, ['connections']);
  const stage = stageWorkflowDraftEdit(input);
  assert.deepEqual(stage.pendingResolutionStepIds, []);
  assert.deepEqual(stage.deferredRequirementIds, []);
  assert.equal(stage.content.gapNodes.length, 1);
  assert.deepEqual(stage.content.requirements, []);
  assert.deepEqual(stage.content.apiCalls, []);
  assert.deepEqual(stage.content.nativeNodes, []);
  const selected = describeWorkflowDraftSelectedNodes(input);
  assert.equal(selected[0].kind, 'capability-gap');
  assert.equal(
    describeWorkflowDraftConnectionEdit(input).structuralProof.kind,
    'single-node-dag',
  );
  const candidate = assembleWorkflowDraftEdit(input);
  assert.equal(candidate.status, 'changed');
  assert.equal(candidate.draft.gapNodes[0].id, input.plan.steps[0].newNodeId);
  assert.equal(
    inspectDraftReadiness({ draft: candidate.draft, context: f.context })
      .designReady,
    false,
  );
  assert.deepEqual(f.draft.apiCalls, []);
  assert.equal(f.draft.gapNodes, undefined);
});

test('tampered gap reason, source, inventory and identity fail without rewriting the receipt', async () => {
  const f = await capabilityGapFixture();
  for (const change of [
    { id: 'changed' },
    { finding: { ...f.finding, reason: 'Changed' } },
    { sources: [{ ...f.gap.sources[0], quote: 'fabricated' }] },
    { inventory: { operations: [], capabilities: [] } },
  ])
    assert.throws(
      () =>
        inspectWorkflowDraftCapabilityGap({
          gap: { ...f.gap, ...change },
          context: f.context,
        }),
      /changed/,
    );
  assert.throws(
    () =>
      inspectWorkflowDraftCapabilityGap({
        gap: f.gap,
        context: { ...f.context, messages: [] },
      }),
    /context.messages requires at least one message/,
  );
  assert.throws(
    () =>
      inspectWorkflowDraftCapabilityGap({
        gap: f.gap,
        context: {
          ...f.context,
          messages: [
            { id: 'unrelated', text: 'A different original request.' },
          ],
        },
      }),
    /absent or changed/,
  );
});

test('an API contract gap cites exactly one actual operation and cannot invent another snapshot', async () => {
  const f = await capabilityGapFixture();
  const finding = {
    kind: 'api-contract-gap',
    operation: f.operation.key,
    reason: '요청한 이력 결과는 이 작업의 응답 계약에 없습니다.',
  };
  const input = f.editInput([{ kind: 'report-capability-gap', finding }]);
  assert.deepEqual(
    stageWorkflowDraftEdit(input).content.gapNodes[0].finding.operation,
    f.operation.key,
  );
  assert.throws(
    () =>
      f.editInput([
        {
          kind: 'report-capability-gap',
          finding: {
            ...finding,
            operation: { ...f.operation.key, snapshotId: '0'.repeat(64) },
          },
        },
      ]),
    /unavailable or stale/,
  );
});

test('a gap is an explicit DAG position and blocks its consumers while an independent API remains plan-ready', async () => {
  const f = await capabilityGapFixture();
  const context = f.context;
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'mixed-gap',
      requirements: [],
      nativeNodes: [],
      gapNodes: [f.gap],
      apiCalls: [
        { id: 'seed', operation: f.seed.key, values: {}, bindings: [] },
        { id: 'follow', operation: f.operation.key, values: {}, bindings: [] },
      ],
      edges: [
        { from: 'seed', output: 'main', to: 'history', input: 'main' },
        { from: 'history', output: 'main', to: 'follow', input: 'main' },
      ],
    },
  });
  const readiness = inspectDraftReadiness({ context, draft });
  assert.equal(
    readiness.nodes.find((node) => node.nodeId === 'seed').planningStatus,
    'ready',
  );
  assert.deepEqual(
    readiness.nodes.find((node) => node.nodeId === 'follow').blockingGapNodeIds,
    ['history'],
  );
  const compiled = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '결손 위치 검토',
    deployments: [
      {
        documentId: f.operation.key.documentId,
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
  });
  assert.equal(compiled.triggerConnected, false);
  assert.deepEqual(compiled.workflow.connections.Start, undefined);
  const mapping = compiled.nodeMappings.find(
    (node) => node.kind === 'capability-gap',
  );
  assert.equal(mapping.nodeId, 'history');
  assert.equal(mapping.inventoryCurrent, true);
  assert.equal(
    compiled.workflow.connections['Request seed'].main[0][0].node,
    mapping.entryNodeName,
  );
  assert.equal(
    compiled.workflow.connections[mapping.exitNodeName].main[0][0].node,
    'Materialize follow',
  );
  const note = compiled.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-gap-note-history',
  );
  assert.equal(note.parameters.color, 3);
  assert.match(note.parameters.content, /확인 필요/);
  assert.match(compiled.guide, /판단 근거/);
  const surrogate = compiled.workflow.nodes.find(
    (node) => node.id === 'history',
  );
  assert.throws(
    () => vm.runInNewContext(`(function(){${surrogate.parameters.jsCode}})()`),
    /OPENAPI_FLOW_UNRESOLVED_STEP/,
  );
  assert.throws(
    () =>
      createWorkflowDraft({
        context,
        content: {
          id: 'reject-gap-output',
          requirements: [],
          nativeNodes: [],
          edges: [],
          gapNodes: [f.gap],
          apiCalls: [
            {
              id: 'dependent',
              operation: f.operation.key,
              values: {},
              bindings: [
                {
                  kind: 'node-output',
                  sourceNodeId: 'history',
                  sourcePointer: '/id',
                  targetPointer: '/query/filter',
                },
              ],
            },
          ],
        },
      }),
    /unknown|source|undeclared/i,
  );
});

test('newly supplied inventory marks the retained finding historical instead of silently resolving it', async () => {
  const f = await capabilityGapFixture();
  const catalog = await createApiCatalog([
    {
      id: 'new-history-contract',
      spec: {
        openapi: '3.1.0',
        info: { title: 'New history', version: '1' },
        paths: {
          '/history': {
            get: { responses: { 200: { description: 'History' } } },
          },
        },
      },
    },
  ]);
  const extra = await resolveApiOperations(
    catalog,
    catalog.operations.map((candidate) => candidate.key),
  );
  const context = {
    ...f.context,
    operations: [...f.context.operations, ...extra],
  };
  assert.equal(
    inspectWorkflowDraftCapabilityGap({ gap: f.gap, context }).inventoryCurrent,
    false,
  );
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'historical-gap',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      gapNodes: [f.gap],
    },
  });
  validateWorkflowDraft({ context, draft });
  assert.equal(inspectDraftReadiness({ context, draft }).designReady, false);
  const compiled = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '검토 범위 변경',
  });
  assert.equal(compiled.triggerConnected, false);
  assert.equal(compiled.nodeMappings[0].inventoryCurrent, false);
  assert.match(compiled.guide, /계약 변경됨/);
});

test('explicit gap withdrawal removes only that role and supports deterministic terminal cleanup', async () => {
  const f = await capabilityGapFixture();
  const draft = createWorkflowDraft({
    context: f.context,
    content: {
      id: 'withdraw-gap',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      gapNodes: [f.gap],
    },
  });
  const context = {
    ...f.context,
    messages: [
      ...f.context.messages,
      { id: 'withdraw', text: '이력 조회 요구는 취소해줘.' },
    ],
  };
  const input = f.editInput(
    [{ kind: 'remove-node', nodeId: f.gap.id }],
    draft,
    context,
  );
  const removal = resolveWorkflowDraftTerminalRemoval(input);
  assert.equal(removal.status, 'ready');
  assert.deepEqual(removal.result.candidate.draft.gapNodes, []);
  assert.deepEqual(removal.result.candidate.draft.apiCalls, []);
  assert.deepEqual(draft.gapNodes, [f.gap]);
});

test('registered native work and a native capability gap share control flow without inventing a data producer', async () => {
  const f = await capabilityGapFixture();
  const context = {
    ...f.context,
    capabilities: resolveN8nNativeFeatures({
      features: [N8nNativeFeature.PassThrough],
    }).capabilities,
  };
  const gap = createWorkflowDraftCapabilityGap({
    id: 'missing-native',
    requestedBehavior: '전달된 자료에 없는 알림 기능',
    finding: {
      kind: 'unsupported-native',
      reason: '전달된 기능은 No Operation뿐이므로 알림 계약이 없습니다.',
    },
    sourceMessageIds: ['gap-request'],
    context,
  });
  const content = {
    id: 'native-with-gap',
    requirements: [],
    apiCalls: [],
    nativeNodes: [
      { id: 'native-before', capability: 'pass-through', parameters: {} },
      { id: 'native-independent', capability: 'pass-through', parameters: {} },
    ],
    gapNodes: [gap],
    edges: [
      { from: 'native-before', output: 'main', to: gap.id, input: 'main' },
    ],
  };
  const draft = createWorkflowDraft({ context, content });
  const compiled = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '독립 native와 미지원 기능',
  });
  assert.equal(compiled.triggerConnected, false);
  assert.equal(
    compiled.nodeMappings.find((node) => node.kind === 'capability-gap')
      .inventoryCurrent,
    true,
  );
  assert.equal(
    compiled.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.noOp',
    ).length,
    2,
  );
  for (const id of ['native-before', 'native-independent'])
    assert.equal(
      compiled.draftReadiness.nodes.find((node) => node.nodeId === id)
        .planningStatus,
      'ready',
    );
  assert.throws(
    () =>
      createWorkflowDraft({
        context,
        content: {
          ...content,
          nativeNodes: [
            ...content.nativeNodes,
            { id: gap.id, capability: 'pass-through', parameters: {} },
          ],
        },
      }),
    /unique across/,
  );
});

test('explicitly removing a middle gap and adding a newly supplied real API preserves neighbors and restores executable topology', async () => {
  const f = await capabilityGapFixture();
  const catalog = await createApiCatalog([
    {
      id: 'supplied-history',
      spec: {
        openapi: '3.1.0',
        info: { title: 'History contract', version: '1' },
        paths: {
          '/history': {
            get: { responses: { 200: { description: 'History' } } },
          },
        },
      },
    },
  ]);
  const [history] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const original = createWorkflowDraft({
    context: f.context,
    content: {
      id: 'middle-gap-replacement',
      requirements: [],
      nativeNodes: [],
      gapNodes: [f.gap],
      apiCalls: [
        { id: 'seed', operation: f.seed.key, values: {}, bindings: [] },
        { id: 'follow', operation: f.operation.key, values: {}, bindings: [] },
      ],
      edges: [
        { from: 'seed', output: 'main', to: f.gap.id, input: 'main' },
        { from: f.gap.id, output: 'main', to: 'follow', input: 'main' },
      ],
    },
  });
  const context = {
    ...f.context,
    operations: [...f.context.operations, history],
    messages: [
      ...f.context.messages,
      {
        id: 'explicit-replacement',
        text: '제공한 이력 API로 결손 단계를 교체하고 앞뒤 API는 유지해줘.',
      },
    ],
  };
  const input = f.editInput(
    [
      { kind: 'remove-node', nodeId: f.gap.id },
      { kind: 'add-api-call', operation: history.key },
    ],
    original,
    context,
  );
  const step = input.plan.steps.find(
    (entry) => entry.decision.kind === 'add-api-call',
  );
  input.resolutions.push({
    stepId: step.id,
    kind: 'api-call',
    values: {},
    bindings: [],
  });
  const description = describeWorkflowDraftConnectionEdit(input);
  assert.equal(description.status, 'ready');
  assert.equal(description.stage.nodeRemovalConnections.length, 2);
  assert.deepEqual(description.existingEdges, []);
  assert.equal(
    description.contracts.some((node) => node.id === f.gap.id),
    false,
  );
  const sources = [
    {
      kind: 'message',
      messageId: 'explicit-replacement',
      quote: context.messages.at(-1).text,
    },
  ];
  const result = resolveWorkflowDraftConnectionEdit({
    ...input,
    fingerprint: description.fingerprint,
    proposal: {
      decisions: [
        ...description.existingEdges.map((entry) => ({
          kind: 'remove',
          edgeId: entry.id,
          sources,
        })),
        ...[
          { from: 'seed', to: step.newNodeId },
          { from: step.newNodeId, to: 'follow' },
        ].map((edge) => ({
          kind: 'add',
          source: { nodeId: edge.from, port: 'main' },
          target: { nodeId: edge.to, port: 'main' },
          sources,
        })),
      ],
    },
  });
  assert.equal(result.status, 'ready');
  const draft = result.candidate.draft;
  assert.deepEqual(draft.gapNodes, []);
  for (const retained of original.apiCalls)
    assert.deepEqual(
      draft.apiCalls.find((call) => call.id === retained.id),
      retained,
    );
  assert.notEqual(step.newNodeId, f.gap.id);
  assert.deepEqual(original.gapNodes, [f.gap]);
  assert.equal(inspectDraftReadiness({ context, draft }).designReady, true);
  const compiled = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '명시적 실제 API 교체',
    deployments: [
      ...new Set(
        context.operations.map((operation) => operation.key.documentId),
      ),
    ].map((documentId) => ({
      documentId,
      baseUrl: 'https://fixture.example.test',
      credentialBindings: {},
    })),
  });
  assert.equal(compiled.triggerConnected, true);
  assert.equal(
    compiled.nodeMappings.some((node) => node.kind === 'capability-gap'),
    false,
  );
});

test('template compilation keeps clarification and gap receipts on original planning declarations, not runtime-bound copies', async () => {
  const f = await capabilityGapFixture();
  const base = {
    ...f.context,
    capabilities: resolveN8nNativePlanningFeatures({ itemMode: 'linked' })
      .planningCapabilities,
    entrypoint: describeN8nManualTrigger(),
  };
  const round = createWorkflowClarificationRound({
    context: base,
    limits: {
      maxCategories: 3,
      maxQuestionsPerCategory: 3,
      maxChoicesPerQuestion: 5,
      maxQuestionsPerRound: 6,
    },
    options: { includeExplanations: false, includeSuggestions: false },
    proposal: {
      statements: [
        {
          text: '존재하는 조회를 보존하고 없는 변경 이력을 대체하지 않는다.',
          sources: [
            {
              kind: 'message',
              messageId: 'gap-request',
              quote: base.messages[0].text,
            },
          ],
        },
      ],
      categories: [],
    },
  });
  const clarification = prepareWorkflowDraftClarification({
    context: base,
    round,
    resolution: resolveWorkflowClarificationReplies({
      context: base,
      round,
      replies: [],
    }),
  });
  const context = { ...base, clarification };
  const original = describeWorkflowPlanningContext(context);
  const gap = createWorkflowDraftCapabilityGap({
    id: 'clarified-gap',
    requestedBehavior: '변경 이력 조회',
    finding: f.finding,
    sourceMessageIds: ['gap-request'],
    context,
  });
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'clarified-gap-template',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
      gapNodes: [gap],
    },
  });
  const compiled = compileN8nWorkflowTemplate({
    context,
    draft,
    name: '구체화된 결손 검토',
    itemMode: 'linked',
  });
  assert.equal(compiled.triggerConnected, false);
  assert.equal(compiled.nodeMappings[0].inventoryCurrent, true);
  assert.deepEqual(describeWorkflowPlanningContext(context), original);
  assert.deepEqual(
    draft.gapNodes[0].inventory.capabilities.map((entry) => entry.name).sort(),
    base.capabilities.map((capability) => capability.name).sort(),
  );
  const changed = globalThis.structuredClone(clarification);
  changed.round.contextFingerprint = '0'.repeat(64);
  assert.throws(
    () =>
      compileN8nWorkflowTemplate({
        context: { ...base, clarification: changed },
        draft,
        name: '위조된 원본',
        itemMode: 'linked',
      }),
    /stale/,
  );
});
