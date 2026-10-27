import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { compileWorkflow } from '@openapi-flow/n8n/legacy';
import {
  compileReviewableN8nWorkflow,
  createN8nNativeCapabilities,
  createItemJoinCapability,
  createJsonOutputCapability,
  createN8nNativeOutputSources,
  createResponseArrayCapability,
  N8nNativeFeature,
  resolveN8nNativeFeatures,
  resolveN8nNativePlanningFeatures,
  compileN8nWorkflowTemplate,
  createApiResponseObjectCapability,
  createApiResponseResultsCapability,
  createNativeOutputProjectionCapability,
  createNativeValueCollectionCapability,
} from '@openapi-flow/n8n';
import {
  operationsFromSpec,
  validateOpenApi,
  resolveApiSelectionAnswers,
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
  createApiArgumentsSchema,
  createReviewableWorkflowGraphPlan,
  createApiResponseSchema,
  createResponseArrayItemSchema,
  listApiResponsePointers,
  collectDeferredApiInputSlots,
  inspectDeferredApiInputs,
  materializeDeferredApiInputs,
  createWorkflowDraft,
  describeWorkflowDraftEditContext,
  validateWorkflowDraft,
  describeWorkflowDraftRequirementHistory,
  describeWorkflowDraftRequirementEdit,
  describeWorkflowDraftClarificationOwnership,
  createWorkflowDraftRequirementAnswerSchema,
  createWorkflowDraftEditCandidateContext,
  inspectDraftReadiness,
  applyDraftChangeSet,
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  createWorkflowDraftEditPlan,
  validateWorkflowDraftEditPlan,
  selectDefaultApiRequestMediaType,
  assembleWorkflowDraftEdit,
  stageWorkflowDraftEdit,
  describeWorkflowDraftNativeReferenceRepair,
  resolveWorkflowDraftNativeReferenceRepair,
  createResponseValueSchema,
  createNativeValueSchema,
  createApiResponsePointerSelectionSchema,
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
  describeWorkflowDraftApiCallPlanning,
  describeWorkflowDraftApiBindingIntent,
  resolveWorkflowDraftApiBindingIntent,
  describeWorkflowDraftApiCallBindings,
  resolveWorkflowDraftApiCallBindings,
  describeWorkflowDraftApiCallArguments,
  resolveWorkflowDraftApiCallArguments,
  prepareWorkflowDraftClarification,
  describeWorkflowDraftClarificationScopes,
  resolveWorkflowDraftClarificationScopes,
  createWorkflowReviewSuggestions,
  adoptWorkflowReviewSuggestion,
  validateWorkflowReviewSuggestions,
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
  validateWorkflowClarificationAnswerRevision,
  listApiRequestMediaTypes,
  resolveNativeMaterialSnapshot,
  createApiSelectionExplanation,
  validateApiSelectionExplanation,
  createApiRequestMediaTypeDecision,
  validateApiRequestMediaTypeDecision,
  describeApiLiteralGeneration,
  createApiLiteralGenerationRecord,
  validateApiLiteralGenerationRecord,
  describeApiBindingPlanning,
  createApiBindingPlanningRecord,
  validateApiBindingPlanningRecord,
  describeNativeNodePlanning,
  createNativeNodePlan,
  createNativeNodePlanningRecord,
  validateNativeNodePlanningRecord,
  describeWorkflowConnectionPlanning,
  createWorkflowConnectionPlan,
  createWorkflowConnectionPlanningRecord,
  validateWorkflowConnectionPlanningRecord,
  describeWorkflowGraphPlanning,
  createWorkflowGraphPlanningResult,
  createWorkflowGraphPlanningRecord,
  validateWorkflowGraphPlanningRecord,
  inspectApiArgumentRequirements,
  createApiInputAnswerExtractionRecord,
  validateApiInputAnswerExtractionRecord,
  createWorkflowDraftCapabilityGap,
  inspectWorkflowDraftCapabilityGap,
  createWorkflowDraftApiInputEditContract,
  createWorkflowDraftApiInputEditAnswersSchema,
  resolveWorkflowDraftApiInputEdits,
  applyWorkflowConnectionStep,
  describeWorkflowConnectionStep,
  finalizeWorkflowConnectionSession,
  createWorkflowPlanningCapabilities,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  analyzeApiSelection,
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
} from '@openapi-flow/langchain';
import { createRequire } from 'node:module';
import { createOperationCatalog } from '@openapi-flow/core/internal';
import { generateWorkflow } from '../examples/legacy-generation/dist/generate-workflow.js';
import { createOperationSelectionSchema } from '../packages/langchain/dist/legacy/schemas/operation-selection-schema.js';

const directory = process.env.OPENAPI_FLOW_REAL_OAS_DIR;
if (!directory) {
  throw new Error('OPENAPI_FLOW_REAL_OAS_DIR is required by test:real-oas');
}

const entries = await readdir(directory, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort();

test('original OAS candidates accept explicit three-of-four API answers without changing source contracts', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const original = JSON.stringify(sources);
  const catalog = await createApiCatalog(sources);
  const candidates = catalog.operations.slice(0, 4);
  assert.equal(
    candidates.length,
    4,
    'The real multi-OAS catalog needs four offered APIs',
  );
  const question = {
    kind: 'operation-multiple-choice',
    id: 'real-oas-subset',
    message: 'Choose three or four sources.',
    purpose: 'Verify the original API selection contract',
    candidates,
    minSelections: 3,
    maxSelections: 4,
  };
  const keys = candidates.slice(0, 3).map((candidate) => candidate.key);
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis: {
      selection: { operations: [], gaps: [] },
      questions: [question],
    },
    answers: [{ questionId: question.id, operations: keys }],
  });
  assert.deepEqual(
    result.selection.operations.map((item) => item.key),
    keys,
  );
  assert.deepEqual(result.questions, []);
  assert.equal(JSON.stringify(sources), original);
});

test('original ICL OAS accepts explicit typed edit answers without rewriting the model proposal or original draft', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const originalSpec = JSON.stringify(spec);
  const catalog = await createApiCatalog([
    { id: 'private-icl-input-reply', spec },
  ]);
  const selected = catalog.operations.find(
    (operation) =>
      operation.path === '/item/core/getItemInfo' && operation.method === 'GET',
  );
  assert.ok(selected, 'Original ICL getItemInfo operation is required');
  const [operation] = await resolveApiOperations(catalog, [selected.key]);
  const message = {
    id: 'private-typed-edit',
    text: 'Change the product number. Ask for the actual new value; do not reuse the previous number.',
  };
  const context = {
    operations: [operation],
    capabilities: [],
    messages: [message],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-typed-edit',
      apiCalls: [
        {
          id: 'source',
          operation: operation.key,
          values: { query: { gdNo: 'fixture-seed' } },
          bindings: [],
        },
      ],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const originalDraft = globalThis.structuredClone(draft);
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'source',
          instruction: message.text,
          sources,
        },
      ],
    },
  });
  const input = { ...base, plan, stepId: plan.steps[0].id };
  const contract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: { targets: [{ kind: 'set', pointer: '/query/gdNo', sources }] },
  });
  const output = {
    values: { [contract.targets[0].id]: { status: 'needs-input' } },
  };
  const pending = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract,
    output,
  });
  assert.equal(pending.status, 'needs-input');
  assert.equal(Object.hasOwn(pending, 'resolution'), false);
  const confirmedAnswers = {
    contractId: contract.id,
    answers: [{ targetId: contract.targets[0].id, value: '0007' }],
  };
  const schema = createWorkflowDraftApiInputEditAnswersSchema({
    ...input,
    contract,
    output,
  });
  assert.deepEqual(schema.parse(confirmedAnswers), confirmedAnswers);
  assert.equal(
    schema.safeParse({
      ...confirmedAnswers,
      answers: [{ ...confirmedAnswers.answers[0], value: 7 }],
    }).success,
    false,
  );
  const result = resolveWorkflowDraftApiInputEdits({
    ...input,
    contract,
    output,
    confirmedAnswers,
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.values, output);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.equal(candidate.draft.apiCalls[0].values.query.gdNo, '0007');
  assert.deepEqual(candidate.draft.apiCalls[0].operation, operation.key);
  assert.equal(
    compileN8nWorkflowTemplate({
      draft: candidate.draft,
      context,
      name: 'Private typed reply template',
    }).revision,
    candidate.draft.revision,
  );
  assert.deepEqual(draft, originalDraft);
  assert.equal(JSON.stringify(spec), originalSpec);
  const calls = [];
  const graph = createWorkflowDraftConversationGraph({
    context,
    name: 'Private typed edit conversation',
    checkpointer: new MemorySaver(),
    reviewPolicy: 'automatic',
    includeExplanations: false,
    model: {
      withStructuredOutput(_schema, options) {
        return {
          async invoke(messages) {
            const payload = JSON.parse(messages[1].content);
            const current = payload.messages.at(-1);
            const sources = [{ kind: 'message', messageId: current.id }];
            calls.push(options.name);
            if (options.name === 'analyze_workflow_draft_edit')
              return {
                decisions: [
                  {
                    kind: 'revise-api-inputs',
                    nodeId: 'source',
                    instruction: current.text,
                    sources,
                  },
                ],
              };
            if (options.name === 'select_draft_api_input_edit_targets')
              return {
                targets: [{ kind: 'set', pointer: '/query/gdNo', sources }],
              };
            if (options.name === 'generate_draft_api_input_edit_values')
              return {
                values: Object.fromEntries(
                  payload.targets.map((target) => [
                    target.id,
                    { status: 'needs-input' },
                  ]),
                ),
              };
            throw new Error(
              `Unexpected original ICL typed edit stage ${options.name}`,
            );
          },
        };
      },
    },
  });
  const config = {
    configurable: { thread_id: 'original-icl-typed-edit' },
    recursionLimit: 100,
  };
  const waiting = await graph.invoke(
    {
      input: {
        initialDraft: draft,
        request: {
          id: 'private-graph-typed-edit',
          text: message.text,
          expectedRevision: draft.revision,
        },
      },
    },
    config,
  );
  assert.ok(waiting.__interrupt__?.length);
  const boundary = waiting.__interrupt__[0].value;
  const [question] = boundary.questions;
  assert.equal(question.kind, 'api-input-edit');
  assert.equal(question.apiInputEditTarget.pointer, '/query/gdNo');
  const finished = await graph.invoke(
    new Command({
      resume: {
        action: 'answer-api-input-edits',
        token: boundary.token,
        messageId: 'private-graph-typed-answer',
        stepId: question.stepId,
        confirmedAnswers: {
          contractId: question.apiInputEditContractId,
          answers: [
            { targetId: question.apiInputEditTarget.id, value: '0007' },
          ],
        },
      },
    }),
    config,
  );
  assert.equal(finished.phase, 'complete');
  assert.equal(finished.draft.apiCalls[0].values.query.gdNo, '0007');
  assert.equal(finished.artifact.revision, finished.draft.revision);
  assert.deepEqual(finished.messages, waiting.messages);
  assert.equal(finished.apiInputEditAnswerHistory.length, 1);
  assert.deepEqual(calls, [
    'analyze_workflow_draft_edit',
    'select_draft_api_input_edit_targets',
    'generate_draft_api_input_edit_values',
  ]);
  assert.deepEqual(draft, originalDraft);
  assert.equal(JSON.stringify(spec), originalSpec);
});

test('explicit native removal derives incident edges and planning contracts while preserving each original service OAS', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const original = JSON.stringify(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((candidate) => candidate.key),
    );
    // This checks structural editing, not an HTTP execution or method choice.
    const [operation] = operations;
    assert.ok(
      operation,
      'This structural fixture requires an actual declared REST operation',
    );
    const [requestMediaType] = listApiRequestMediaTypes(operation);
    const context = {
      operations,
      capabilities: resolveN8nNativeFeatures({
        features: [N8nNativeFeature.PassThrough],
      }).capabilities,
      messages: [
        {
          id: 'remove',
          text: '명시적으로 추가한 전달 단계만 제거하고 원본 API는 유지해줘.',
        },
      ],
    };
    const incident = {
      from: 'original-api',
      output: 'main',
      to: 'temporary-forward',
      input: 'main',
    };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'original-removal',
        requirements: [],
        apiCalls: [
          {
            id: 'original-api',
            operation: operation.key,
            values: {},
            bindings: [],
            ...(requestMediaType === undefined ? {} : { requestMediaType }),
          },
        ],
        nativeNodes: [
          {
            id: 'temporary-forward',
            capability: 'pass-through',
            parameters: {},
          },
        ],
        edges: [incident],
      },
    });
    const input = { draft, context, requestMessageIds: ['remove'] };
    const description = describeWorkflowDraftEditContext(input);
    assert.deepEqual(
      description.nodeContracts.find((node) => node.id === 'temporary-forward')
        .inputs,
      ['main'],
    );
    const plan = createWorkflowDraftEditPlan({
      ...input,
      options: { includeExplanations: false },
      proposal: {
        decisions: [
          {
            kind: 'remove-node',
            nodeId: 'temporary-forward',
            instruction: context.messages[0].text,
            sources: [
              {
                kind: 'message',
                messageId: 'remove',
                quote: context.messages[0].text,
              },
            ],
          },
        ],
      },
    });
    const edit = { ...input, plan, resolutions: [] };
    const stage = stageWorkflowDraftEdit(edit);
    assert.deepEqual(
      stage.nodeRemovalConnections.map((change) => change.edge),
      [incident],
    );
    assert.deepEqual(stage.content.edges, []);
    const result = assembleWorkflowDraftEdit(edit);
    assert.deepEqual(result.draft.apiCalls, draft.apiCalls);
    assert.deepEqual(result.draft.nativeNodes, []);
    assert.equal(JSON.stringify(spec), original);
  }
});

test('capability-gap findings retain actual complete original-OAS inventory without making up request or response contracts', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((candidate) => candidate.key),
    );
    const context = {
      operations,
      capabilities: [],
      messages: [
        {
          id: 'gap-scope',
          text: '입출력 계약의 보강이 필요한 기능은 미해결 단계로 명시해줘.',
        },
      ],
    };
    const gap = createWorkflowDraftCapabilityGap({
      id: 'original-contract-gap',
      context,
      sourceMessageIds: ['gap-scope'],
      requestedBehavior: '원본 계약의 보강 검토',
      finding: {
        kind: 'api-contract-gap',
        operation: operations[0].key,
        reason:
          '이 합성 판단은 실제 원본 작업 식별자와 검토 범위의 보존만 확인합니다.',
      },
    });
    assert.equal(gap.inventory.operations.length, operations.length);
    assert.deepEqual(gap.finding.operation, operations[0].key);
    assert.equal(
      inspectWorkflowDraftCapabilityGap({ gap, context }).inventoryCurrent,
      true,
    );
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'original-gap-only',
        apiCalls: [],
        nativeNodes: [],
        requirements: [],
        edges: [],
        gapNodes: [gap],
      },
    });
    const template = compileN8nWorkflowTemplate({
      context,
      draft,
      name: '원본 계약 범위 검토',
    });
    assert.equal(template.triggerConnected, false);
    assert.equal(template.nodeMappings[0].kind, 'capability-gap');
    assert.equal(
      template.workflow.nodes.some(
        (node) => node.type === 'n8n-nodes-base.httpRequest',
      ),
      false,
    );
    assert.equal(Object.hasOwn(gap, 'requestSchema'), false);
  }
});

test('original service OAS optional parameters become scenario input slots only when explicitly requested, without changing their contracts', async () => {
  let checked = 0;
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    for (const operation of operations) {
      const before = globalThis.structuredClone(operation);
      const optional = operation.effective.parameters.filter(
        (parameter) =>
          parameter.required !== true &&
          !['accept', 'content-type', 'authorization'].includes(
            parameter.name.toLowerCase(),
          ),
      );
      for (const parameter of optional) {
        const targetPointer =
          '/' +
          parameter.in +
          '/' +
          parameter.name.replaceAll('~', '~0').replaceAll('/', '~1');
        const material = {
          operation,
          callId: 'requested-original-input',
          values: {},
          bindings: [],
          requestMediaType: selectDefaultApiRequestMediaType(operation),
        };
        const original = inspectApiArgumentRequirements(material);
        assert.ok(
          !original.requirements.some(
            (requirement) => requirement.targetPointer === targetPointer,
          ),
        );
        const tracked = { ...material, requestedInputs: [targetPointer] };
        const requirement = inspectApiArgumentRequirements(
          tracked,
        ).requirements.find((entry) => entry.targetPointer === targetPointer);
        assert.ok(
          requirement,
          'Explicitly requested original OAS optional parameter must not disappear',
        );
        assert.equal(requirement.kind, 'requested-input');
        assert.deepEqual(requirement.operation, operation.key);
        assert.deepEqual(requirement.requestedInputs, [targetPointer]);
        assert.ok(
          collectDeferredApiInputSlots({ materials: [tracked] }).some(
            (slot) => slot.targetPointer === targetPointer,
          ),
        );
        checked++;
      }
      assert.deepEqual(operation, before);
    }
  }
  assert.ok(
    checked > 0,
    'Original service snapshots must contain actual optional inputs for this regression',
  );
});

test('answer extraction evidence retains real OAS pending schemas and computes unanswered IDs without generating values', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const { requirements } = inspectApiArgumentRequirements({
      operation,
      callId: 'pending-read',
      values: {},
      bindings: [],
      requestMediaType: selectDefaultApiRequestMediaType(operation),
    });
    const context = { reply: '입력값은 아직 모릅니다.', requirements };
    const record = createApiInputAnswerExtractionRecord({
      ...context,
      decision: {
        reason: '이 답변에는 요청한 입력값이 명시되어 있지 않습니다.',
        answers: [],
      },
    });
    validateApiInputAnswerExtractionRecord({
      ...context,
      record: JSON.parse(JSON.stringify(record)),
    });
    assert.deepEqual(record.evidence.requirements, requirements);
    assert.deepEqual(record.verification.answers, []);
    assert.deepEqual(
      record.verification.unansweredRequirementIds,
      requirements.map((item) => item.id),
    );
  }
});

test('semantic requirement restoration retains every original OAS call and never supplies missing API inputs', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const context = {
      operations: [operation],
      capabilities: [],
      messages: [
        {
          id: 'initial-purpose',
          text: 'Review the original API without inventing its inputs.',
        },
        {
          id: 'withdraw-purpose',
          text: 'Withdraw only that purpose requirement.',
        },
        {
          id: 'restore-purpose',
          text: 'Restore only that purpose with explicit replacement fields.',
        },
      ],
    };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: `real-restore-${file}`,
        nativeNodes: [],
        edges: [],
        apiCalls: [
          {
            id: 'original-call',
            operation: operation.key,
            values: {},
            bindings: [],
            requestMediaType: selectDefaultApiRequestMediaType(operation),
          },
        ],
        requirements: [
          {
            id: 'purpose',
            text: 'Original purpose.',
            state: 'confirmed',
            scope: { kind: 'nodes', nodeIds: ['original-call'] },
            sourceMessageIds: ['initial-purpose'],
          },
        ],
      },
    });
    const removed = applyDraftChangeSet({
      draft,
      context,
      changeSet: {
        baseRevision: draft.revision,
        changes: [
          {
            kind: 'remove-requirement',
            requirementId: 'purpose',
            sourceMessageIds: ['withdraw-purpose'],
          },
        ],
      },
    }).draft;
    const input = {
      draft: removed,
      context,
      requestMessageIds: ['restore-purpose'],
    };
    const plan = createWorkflowDraftEditPlan({
      ...input,
      options: { includeExplanations: false },
      proposal: {
        decisions: [
          {
            kind: 'restore-requirement',
            requirementId: 'purpose',
            instruction: 'Restore only the explicitly selected purpose.',
            sources: [
              {
                kind: 'message',
                messageId: 'restore-purpose',
                quote: context.messages[2].text,
              },
            ],
          },
        ],
      },
    });
    const edit = {
      ...input,
      plan,
      resolutions: [
        {
          kind: 'requirement',
          stepId: plan.steps[0].id,
          answerMessageId: 'explicit-restoration-answer',
          text: 'Newly confirmed purpose.',
          state: 'confirmed',
          scope: { kind: 'nodes', nodeIds: ['original-call'] },
        },
      ],
    };
    const result = assembleWorkflowDraftEdit(edit);
    const candidateContext = createWorkflowDraftEditCandidateContext(edit);
    validateWorkflowDraft({ draft: result.draft, context: candidateContext });
    assert.deepEqual(
      result.draft.requirementHistory.map((entry) => entry.kind),
      ['created', 'removed', 'restored'],
    );
    assert.deepEqual(result.draft.apiCalls, draft.apiCalls);
    assert.deepEqual(result.draft.apiCalls[0].values, {});
    assert.deepEqual(spec, original);
  }
});
const requireN8n = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = requireN8n('ajv/dist/2020.js');
const addFormats = requireN8n('ajv-formats');
const { z } = requireN8n('zod');
if (files.length === 0) {
  throw new Error(`OPENAPI_FLOW_REAL_OAS_DIR has no JSON files: ${directory}`);
}

test('combined reviewable graph receipts retain all original OAS snapshots without inventing request values', async () => {
  const materials = [],
    gaps = [];
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8')),
      original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const callId = `graph-original-${materials.length + 1}`,
      gapId = `graph-input-${materials.length + 1}`;
    materials.push({
      status: 'blocked',
      operation,
      callId,
      purpose: '원본 계약과 실제 입력 확정 대기 상태 보존',
      bindings: [],
      gapIds: [gapId],
    });
    gaps.push({
      id: gapId,
      stage: 'workflow-graph',
      description: '실제 요청값이 제공되지 않은 원본 API입니다.',
    });
    assert.deepEqual(spec, original);
  }
  const input = {
    mode: 'reviewable',
    scenario: '원본 OAS 계약과 명시된 입력 대기를 보존합니다.',
    materials,
    capabilities: [],
    gaps,
  };
  const proposal = {
    mode: 'reviewable',
    additionalNativeNodes: [],
    edges: [],
    additionalGaps: [],
    blockedCalls: [],
  };
  const plan = createWorkflowGraphPlanningResult({ ...input, proposal });
  const record = createWorkflowGraphPlanningRecord({
    ...input,
    proposal,
    plan,
    assessment: {
      reason: '명시된 원래 계약과 입력 확정 대기를 그대로 유지합니다.',
      nodes: [],
      edges: [],
      blockedCalls: [],
    },
  });
  validateWorkflowGraphPlanningRecord({
    ...input,
    plan,
    record: JSON.parse(JSON.stringify(record)),
  });
  assert.deepEqual(
    record.evidence.context,
    describeWorkflowGraphPlanning(input).context,
  );
  assert.deepEqual(record.evidence.sources.materials, materials);
  assert.equal(plan.blockedCalls.length, files.length);
});

test('connection source receipts preserve original multi-document OAS and blocked requirements without inventing request inputs', async () => {
  const materials = [],
    gaps = [];
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const callId = `original-connection-${materials.length + 1}`,
      gapId = `missing-input-${materials.length + 1}`;
    materials.push({
      status: 'blocked',
      callId,
      operation,
      purpose: '원본 계약의 입력 확정 대기',
      bindings: [],
      gapIds: [gapId],
    });
    gaps.push({
      id: gapId,
      stage: 'workflow-graph',
      description:
        '실제 입력값이 제공되지 않았으므로 이 검사는 실행하지 않습니다.',
    });
  }
  const input = {
    scenario:
      '제공된 각 서비스의 원본 계약과 입력 확정 대기 상태를 보존합니다.',
    materials,
    gaps,
  };
  const proposal = { edges: [], additionalGaps: [], blockedCalls: [] };
  const plan = createWorkflowConnectionPlan({ ...input, proposal });
  const record = createWorkflowConnectionPlanningRecord({
    ...input,
    plan,
    decision: {
      ...proposal,
      reason: '제공된 입력 확정 대기와 독립 노드를 그대로 유지합니다.',
    },
  });
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan,
    record: JSON.parse(JSON.stringify(record)),
  });
  assert.deepEqual(
    record.evidence.context,
    describeWorkflowConnectionPlanning(input).context,
  );
  assert.deepEqual(record.evidence.sources.materials, materials);
  assert.equal(record.plan.blockedCalls.length, files.length);
});

test('explicit OAS input deferral reaches connection planning without reclassifying APIs as capability gaps', async () => {
  let totalSlots = 0;
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.slice(0, 3).map((entry) => entry.key),
    );
    assert.ok(operations.length, `operation cohort required for ${file}`);
    const materials = operations.map((operation, index) => ({
      status: 'ready',
      operation,
      arguments: {
        callId: `deferred-${index}`,
        values: {},
        bindings: [],
        requestMediaType: selectDefaultApiRequestMediaType(operation),
        unresolvedInputs: inspectApiArgumentRequirements({
          operation,
          callId: `deferred-${index}`,
          values: {},
          bindings: [],
          requestMediaType: selectDefaultApiRequestMediaType(operation),
        }).requirements.map((requirement) => requirement.targetPointer),
      },
    }));
    const slots = collectDeferredApiInputSlots({
      materials: materials.map((material) => ({
        operation: material.operation,
        ...material.arguments,
      })),
    });
    totalSlots += slots.length;
    const before = globalThis.structuredClone(materials);
    const input = {
      scenario:
        '알 수 없는 입력은 명시적으로 보류하고 원본 OAS의 독립 조회를 설계합니다.',
      materials,
      deferredApiInputIds: slots.map((slot) => slot.id),
    };
    const description = describeWorkflowConnectionPlanning(input);
    assert.deepEqual(description.context.deferredApiInputs ?? [], slots);
    const plan = createWorkflowConnectionPlan({
      ...input,
      proposal: { edges: [], additionalGaps: [], blockedCalls: [] },
    });
    assert.deepEqual(
      plan.starts,
      materials.map((item) => item.arguments.callId),
    );
    assert.deepEqual(plan.gaps, []);
    assert.deepEqual(plan.blockedCalls, []);
    assert.deepEqual(materials, before);
    assert.deepEqual(spec, original);
    if (slots.length)
      assert.throws(
        () =>
          createWorkflowConnectionPlan({
            ...input,
            deferredApiInputIds: [],
            proposal: { edges: [], additionalGaps: [], blockedCalls: [] },
          }),
        /unresolved OAS request inputs/,
      );
  }
  assert.ok(
    totalSlots > 0,
    'real OAS cohort must exercise actual missing inputs',
  );
});

test('incremental model contracts preserve each original OAS and explicit input slots through independent roots and an all-input join', async (t) => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const original = globalThis.structuredClone(sources);
  const catalog = await createApiCatalog(sources);
  const operations = await resolveApiOperations(
    catalog,
    sources.flatMap((source) =>
      catalog.operations
        .filter((entry) => entry.key.documentId === source.id)
        .slice(0, 3)
        .map((entry) => entry.key),
    ),
  );
  assert.ok(
    operations.length >= 5,
    'The multi-OAS cohort must contain at least five distinct operations',
  );
  assert.deepEqual(
    new Set(operations.map((operation) => operation.key.documentId)),
    new Set(sources.map((source) => source.id)),
  );
  const materials = operations.map((operation, index) => {
    const callId = `real-incremental-${index}`;
    const requestMediaType = selectDefaultApiRequestMediaType(operation);
    return {
      status: 'ready',
      operation,
      purpose: '원본 OAS의 독립 호출 계약을 유지합니다.',
      arguments: {
        callId,
        values: {},
        bindings: [],
        requestMediaType,
        unresolvedInputs: inspectApiArgumentRequirements({
          operation,
          callId,
          values: {},
          bindings: [],
          requestMediaType,
        }).requirements.map((requirement) => requirement.targetPointer),
      },
    };
  });
  const before = globalThis.structuredClone(materials);
  const slots = collectDeferredApiInputSlots({
    materials: materials.map((material) => ({
      operation: material.operation,
      ...material.arguments,
    })),
  });
  const scenario =
    '각 원본 API를 독립적으로 호출하고 모두 완료한 뒤 결과를 모읍니다. 누락 입력은 원래 OAS 타입의 명시적 입력 슬롯으로 유지합니다.';
  const input = {
    scenario,
    materials,
    capabilities: createN8nNativeCapabilities(),
    nativeNodes: [
      {
        id: 'merge',
        capability: 'merge-append',
        parameters: { numberInputs: materials.length },
      },
    ],
    deferredApiInputIds: slots.map((slot) => slot.id),
    requirements: [
      {
        id: 'scenario',
        text: scenario,
        sources: [
          { kind: 'message', messageId: 'scenario-source', quote: scenario },
        ],
      },
    ],
  };
  const ids = materials.map((material) => material.arguments.callId);
  const basis = {
    factIds: ['scenario'],
    reason: '원본 계약과 확정한 독립 호출·합류 의도를 유지합니다.',
  };
  const outputs = [
    {
      goals: [
        { kind: 'independent', nodeIds: ids, ...basis },
        { kind: 'join', nodeId: 'merge', producerIds: ids, ...basis },
      ],
    },
  ];
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          return outputs[calls++];
        },
      };
    },
  };
  let session = await planWorkflowConnectionGoals({ ...input, model });
  const ports = describeWorkflowConnectionStep({
    ...input,
    session,
  }).context.nodes.find((node) => node.id === 'merge').inputs;
  const patch = {
    kind: 'patch',
    addEdges: [],
    removeEdgeIds: [],
    addRootNodeIds: ids,
    removeRootNodeIds: [],
    addTerminals: [],
    removeTerminals: [],
    ...basis,
  };
  outputs.push(
    { decision: patch },
    {
      decision: {
        ...patch,
        addRootNodeIds: [],
        addTerminals: [{ nodeId: 'merge' }],
        addEdges: ids.map((id, index) => ({
          source: { nodeId: id },
          target: { nodeId: 'merge', port: ports[index] },
        })),
      },
    },
  );
  for (let index = 0; index < 2; index++) {
    const proposal = await planWorkflowConnectionStep({
      ...input,
      session,
      model,
    });
    const applied = applyWorkflowConnectionStep({
      ...input,
      session,
      expected: proposal.expected,
      proposal: proposal.decision,
    });
    assert.equal(applied.status, 'accepted', JSON.stringify(applied));
    assert.equal(applied.inspection.ready, index === 1);
    session = applied.session;
  }
  const plan = finalizeWorkflowConnectionSession({ ...input, session });
  assert.deepEqual(plan.starts, ids);
  assert.equal(plan.edges.length, materials.length);
  assert.equal(plan.gaps.length, 0);
  assert.equal(plan.blockedCalls.length, 0);
  assert.deepEqual(materials, before);
  assert.deepEqual(sources, original);
  assert.equal(calls, 3);
  assert.deepEqual(
    describeWorkflowConnectionStep({ ...input, session }).context
      .deferredApiInputs ?? [],
    slots,
  );
  t.diagnostic(
    `Original multi-OAS incremental cohort: ${sources.length} documents; ${materials.length} distinct operations; ${slots.length} explicit input slots; ${calls} model-fixture invocations; external calls 0`,
  );
});

test('native planning evidence preserves selected original OAS roles and implementation contracts without fabricating API values', async () => {
  const apiMaterials = [];
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8')),
      original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    apiMaterials.push({
      callId: `native-original-${apiMaterials.length + 1}`,
      operation,
      purpose: '원래 제공된 API 역할',
    });
    assert.deepEqual(spec, original);
  }
  const capabilities = [
    createJsonOutputCapability({
      name: 'original-independent-native',
      description: 'Declared original independent JSON item',
      parametersSchema: z.strictObject({ flag: z.boolean() }),
    }),
  ];
  const input = {
    planId: 'original-native-audit',
    scenario: '선택된 원본 API 계약은 유지하고 추가 native는 만들지 않습니다.',
    apiMaterials,
    capabilities,
  };
  const description = describeNativeNodePlanning(input),
    plan = createNativeNodePlan({
      ...input,
      proposal: { nativeNodes: [], gaps: [] },
    });
  const record = createNativeNodePlanningRecord({
    ...input,
    plan,
    assessment: {
      kind: 'no-additions',
      reason: '추가 native 동작이 요청되지 않았습니다.',
    },
  });
  validateNativeNodePlanningRecord({ ...input, plan, record });
  assert.deepEqual(record.evidence.context, description.context);
  assert.equal(record.evidence.context.apiMaterials.length, files.length);
  assert.deepEqual(
    record.evidence.context.apiMaterials.map((x) => x.key),
    apiMaterials.map((x) => x.operation.key),
  );
});

test('binding provenance retains original multi-document contracts and no-dependency decisions without inventing sources', async () => {
  const materials = [];
  const originals = [];
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    originals.push({ spec, copy: globalThis.structuredClone(spec) });
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const requestMediaType = selectDefaultApiRequestMediaType(operation);
    materials.push({
      callId: `original-${materials.length + 1}`,
      operation,
      purpose: '제공된 원본 입력의 독립 호출',
      ...(requestMediaType === undefined ? {} : { requestMediaType }),
    });
  }
  const input = {
    scenario:
      '독립 호출의 원래 입력·응답 계약을 확인하며 실제 의존성을 만들지 않습니다.',
    materials,
  };
  const description = describeApiBindingPlanning(input);
  const plan = {
    calls: materials.map(({ callId }) => ({ callId, bindings: [] })),
    gaps: [],
  };
  const record = createApiBindingPlanningRecord({
    ...input,
    plan,
    reasons: materials.map(({ callId }) => ({
      callId,
      reason: '요청된 선행 데이터 의존성이 없습니다.',
    })),
  });
  validateApiBindingPlanningRecord({ ...input, plan, record });
  assert.deepEqual(record.evidence.context, description.context);
  assert.deepEqual(
    record.evidence.context.materials.map((x) => x.operation.key),
    materials.map((x) => x.operation.key),
  );
  for (const { spec, copy } of originals) assert.deepEqual(spec, copy);
});

test('literal generation provenance uses original contracts and projected ownership without inventing values', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    assert.ok(
      catalog.operations.length,
      'Each selected original snapshot needs an actual operation',
    );
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const requestMediaType = selectDefaultApiRequestMediaType(operation);
    const input = {
      callId: 'original-literal-audit',
      operation,
      bindings: [],
      scenario: '원본의 실제 입력 계약을 확인하되 없는 값은 생성하지 않습니다.',
      purpose: '원본 operation 입력 검사',
      ...(requestMediaType === undefined ? {} : { requestMediaType }),
    };
    const description = describeApiLiteralGeneration(input);
    const record = createApiLiteralGenerationRecord({
      ...input,
      ...(description.contract.hasLiteralInputs
        ? {
            proposal: { values: {} },
            reason: '요청에 실제 값이 없어 입력을 생략했습니다.',
          }
        : {}),
    });
    validateApiLiteralGenerationRecord({ ...input, record });
    assert.deepEqual(record.operation, operation.key);
    if (record.kind === 'proposed-literals') {
      assert.deepEqual(record.proposedValues, {});
      assert.deepEqual(
        record.explanation.evidence[1].schema,
        description.contract.literalInputSchema,
      );
      assert.equal(
        Object.hasOwn(record.explanation.evidence[1], 'bindings'),
        false,
      );
    }
    assert.deepEqual(spec, original);
  }
});

test('original OAS request media decisions preserve exact declarations and distinguish code-only choices from explicit-null default resolution', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const original = globalThis.structuredClone(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((item) => item.key),
    );
    for (const operation of operations) {
      const declared = listApiRequestMediaTypes(operation);
      const input = {
        operation,
        scenario: '원본에 선언된 요청 형식을 확인합니다.',
      };
      const decision = createApiRequestMediaTypeDecision({
        ...input,
        ...(declared.length > 1
          ? {
              assessment: {
                requestMediaType: null,
                explanation: { reason: '요청 형식을 지정하지 않았습니다.' },
              },
            }
          : {}),
      });
      validateApiRequestMediaTypeDecision({ ...input, decision });
      assert.deepEqual(decision.declaredMediaTypes, declared);
      assert.deepEqual(decision.operation, operation.key);
      if (declared.length === 0) assert.equal(decision.kind, 'no-request-body');
      else if (declared.length === 1)
        assert.equal(decision.kind, 'single-declared-format');
      else {
        assert.equal(decision.kind, 'documented-default');
        assert.equal(decision.assessment.requestMediaType, null);
        assert.deepEqual(
          decision.assessment.explanation.evidence[1].value,
          operation.operation.requestBody,
        );
      }
    }
    assert.deepEqual(spec, original);
  }
});

test('original private OAS discovery selections retain code-owned provenance without reading full contracts in the model call', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const originals = globalThis.structuredClone(sources);
  const catalog = await createApiCatalog(sources);
  const context = {
    scenario: '테스트 대상 API를 선택해줘.',
    operations: listApiOperations(catalog),
  };
  assert.ok(context.operations.length);
  let calls = 0;
  for (const analyze of [false, true]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke(messages) {
            calls++;
            const payload = JSON.parse(messages[1].content);
            assert.equal(payload.candidates.length, context.operations.length);
            assert.equal(
              Object.hasOwn(payload.candidates[0], 'effective'),
              false,
            );
            return {
              operations: [
                {
                  candidateId: 'candidate-1',
                  purpose: '원본 후보 테스트',
                  explanation: {
                    reason: '제공된 후보의 설명을 기준으로 선택했습니다.',
                  },
                },
              ],
              gaps: [],
              ...(analyze ? { questions: [] } : {}),
            };
          },
        };
      },
    };
    const output = await (analyze ? analyzeApiSelection : selectApiOperations)({
      ...context,
      model,
      includeExplanations: true,
    });
    const selection = analyze ? output.selection : output;
    const selected = selection.operations[0];
    const basis = { kind: 'candidates', operations: [selected.key] };
    validateApiSelectionExplanation({
      context,
      basis,
      explanation: selected.explanation,
    });
    assert.deepEqual(
      selected.explanation,
      createApiSelectionExplanation({
        context,
        basis,
        reason: selected.explanation.reason,
      }),
    );
    assert.deepEqual(selected.explanation.evidence[1].candidates, [
      context.operations[0],
    ]);
  }
  assert.equal(calls, 2);
  assert.deepEqual(sources, originals);
});

test('requirement revision and withdrawal preserve original ICL operations and retain exact prior evidence', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = globalThis.structuredClone(spec);
  const catalog = await createApiCatalog([
    { id: 'private-requirement-history-icl', spec },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const operation = operations.find(
    (entry) =>
      entry.method === 'GET' &&
      entry.effective.parameters.some(
        (parameter) => parameter.in === 'path' && parameter.required,
      ),
  );
  assert.ok(
    operation,
    'Original ICL must contain a GET with a required path input',
  );
  const context = {
    operations,
    capabilities: [],
    messages: [
      { id: 'initial', text: 'Test the declared ICL operation.' },
      { id: 'revision', text: 'Defer this purpose until user review.' },
      { id: 'withdrawal', text: 'Withdraw only the purpose requirement.' },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'icl-requirement-audit',
      apiCalls: [
        { id: 'icl-read', operation: operation.key, values: {}, bindings: [] },
      ],
      nativeNodes: [],
      edges: [],
      requirements: [
        {
          id: 'purpose',
          text: 'Test the original operation.',
          state: 'confirmed',
          scope: { kind: 'nodes', nodeIds: ['icl-read'] },
          sourceMessageIds: ['initial'],
        },
      ],
    },
  });
  const revised = applyDraftChangeSet({
    draft,
    context,
    changeSet: {
      baseRevision: 0,
      changes: [
        {
          kind: 'set-requirement',
          requirement: {
            ...draft.requirements[0],
            text: 'Review later',
            state: 'deferred',
            sourceMessageIds: ['revision'],
          },
        },
      ],
    },
  }).draft;
  const removed = applyDraftChangeSet({
    draft: revised,
    context,
    changeSet: {
      baseRevision: revised.revision,
      changes: [
        {
          kind: 'remove-requirement',
          requirementId: 'purpose',
          sourceMessageIds: ['withdrawal'],
        },
      ],
    },
  }).draft;
  validateWorkflowDraft({
    draft: JSON.parse(JSON.stringify(removed)),
    context: { ...context, planningMessageIds: ['withdrawal'] },
  });
  const history = describeWorkflowDraftRequirementHistory({
    draft: removed,
    context,
  });
  assert.deepEqual(
    history.entries.map((entry) => entry.kind),
    ['created', 'revised', 'removed'],
  );
  assert.deepEqual(
    history.entries.map((entry) => entry.evidence[0].messageId),
    ['initial', 'revision', 'withdrawal'],
  );
  assert.deepEqual(removed.apiCalls, draft.apiCalls);
  assert.deepEqual(removed.apiCalls[0].values, {});
  assert.deepEqual(
    operations.find((entry) => entry.key === operation.key),
    operation,
  );
  assert.deepEqual(spec, original);
});

test('original ICL selected identities accept explicit requirement scope before request inputs exist without weakening final assembly', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = globalThis.structuredClone(spec);
  const catalog = await createApiCatalog([
    { id: 'private-pending-requirement-scope-icl', spec },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const operation = operations.find(
    (entry) =>
      entry.method === 'GET' &&
      entry.effective.parameters.some(
        (parameter) => parameter.in === 'path' && parameter.required,
      ),
  );
  assert.ok(operation);
  const context = {
    operations,
    capabilities: [],
    messages: [
      { id: 'initial', text: 'Initial confirmed test purpose.' },
      {
        id: 'edit',
        text: 'Add an original ICL read and explicitly revise purpose for that selected role.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'original-icl-pending-scope',
      apiCalls: [],
      nativeNodes: [],
      edges: [],
      requirements: [
        {
          id: 'purpose',
          text: 'Initial test purpose',
          state: 'confirmed',
          scope: { kind: 'workflow' },
          sourceMessageIds: ['initial'],
        },
      ],
    },
  });
  const base = { draft, context, requestMessageIds: ['edit'] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        { kind: 'add-api-call', operation: operation.key },
        { kind: 'revise-requirement', requirementId: 'purpose' },
        {
          kind: 'needs-clarification',
          owner: {
            kind: 'planning-step',
            decisionIndex: 0,
            stage: 'api-arguments',
          },
        },
        {
          kind: 'needs-clarification',
          owner: {
            kind: 'planning-step',
            decisionIndex: 1,
            stage: 'requirements',
          },
        },
      ].map((decision) => ({
        ...decision,
        instruction: context.messages[1].text,
        sources: [
          {
            kind: 'message',
            messageId: 'edit',
            quote: context.messages[1].text,
          },
        ],
      })),
    },
  });
  const input = { ...base, plan, resolutions: [] };
  const description = describeWorkflowDraftRequirementEdit({
    ...input,
    stepId: plan.steps[1].id,
  });
  assert.deepEqual(description.nodes[0].operation, operation);
  const answer = createWorkflowDraftRequirementAnswerSchema(description).parse({
    answerMessageId: 'typed-scope',
    text: 'Confirmed purpose for the actual selected ICL role',
    state: 'confirmed',
    scope: { kind: 'nodes', nodeIds: [plan.steps[0].newNodeId] },
  });
  const resolutions = [
    { kind: 'requirement', stepId: plan.steps[1].id, ...answer },
  ];
  const stage = stageWorkflowDraftEdit({ ...input, resolutions });
  assert.deepEqual(stage.content.apiCalls, []);
  assert.deepEqual(stage.pendingResolutionStepIds, [plan.steps[0].id]);
  assert.deepEqual(stage.deferredRequirementIds, []);
  assert.equal(stage.clarificationOwnership.length, 2);
  assert.deepEqual(
    describeWorkflowDraftClarificationOwnership(input).map(
      (entry) => entry.owner.stepId,
    ),
    plan.steps.slice(0, 2).map((step) => step.id),
  );
  assert.deepEqual(stage.content.requirements[0].scope, answer.scope);
  assert.ok(
    createWorkflowDraftEditCandidateContext({
      ...input,
      resolutions,
    }).messages.some((message) => message.id === 'typed-scope'),
  );
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, resolutions }),
    /Missing draft edit resolution/,
  );
  assert.deepEqual(spec, original);
  assert.deepEqual(draft.apiCalls, []);
});

test('late registered collection definitions bind original ICL response contracts and reject bodyless sources', async (t) => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = globalThis.structuredClone(spec);
  const catalog = await createApiCatalog([
    { id: 'private-late-native-icl', spec },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((entry) => entry.key),
  );
  const registry = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.CollectApiResponses],
  });
  assert.equal(registry.capabilities.length, 0);
  let bound = 0,
    bodyless = 0;
  for (const [index, operation] of operations.entries()) {
    const callId = `icl-contract-${index}`;
    const resolveSnapshot = () =>
      resolveNativeMaterialSnapshot({
        apiMaterials: [{ callId, operation }],
        nativeOutputs: [],
        nativeNodes: [
          {
            id: 'collect',
            capability: N8nNativeFeature.CollectApiResponses,
            parameters: { sourceNodeId: callId, pointer: '' },
          },
        ],
        capabilities: registry.planningCapabilities,
        deferredNodeIds: [],
      });
    const hasBody = Object.values(operation.operation.responses).some(
      (response) =>
        response &&
        typeof response === 'object' &&
        response.content &&
        Object.values(response.content).some(
          (media) =>
            media && typeof media === 'object' && media.schema !== false,
        ),
    );
    if (!hasBody) {
      assert.throws(resolveSnapshot, /has no declared response value/);
      assert.throws(
        () => createResponseValueSchema(operation, ''),
        /has no declared response value/,
      );
      bodyless++;
      continue;
    }
    const snapshot = resolveSnapshot();
    assert.equal(snapshot.status, 'ready');
    bound++;
    assert.deepEqual(
      snapshot.outputs[0].schema.properties.items.items,
      createResponseValueSchema(operation, ''),
    );
    assert.equal(
      Object.hasOwn(registry.planningCapabilities[0], 'materialSources'),
      false,
    );
  }
  assert.equal(operations.length > 0, true);
  assert.equal(bound + bodyless, operations.length);
  assert.ok(
    bound > 0 && bodyless > 0,
    'Original ICL must exercise both response-body and bodyless contracts',
  );
  t.diagnostic(
    `Original ICL response contracts: ${bound} bound; ${bodyless} bodyless collection requests rejected; no source calls`,
  );
  assert.deepEqual(spec, original);
});

test('typed binding questions and explicit answers preserve every original ICL request root and declared media contract', async (t) => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = JSON.stringify(spec);
  const catalog = await createApiCatalog([
    { id: 'private-scoped-binding-icl', spec },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((operation) => operation.key),
  );
  let checked = 0;
  for (const operation of operations) {
    const context = {
      operations: [operation],
      capabilities: [],
      messages: [
        {
          id: 'original-binding-review',
          text: 'Review the supplied original operation inputs; explicit no-binding decisions do not invent values or execute the API.',
        },
      ],
    };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'private-binding-questions',
        requirements: [],
        apiCalls: [],
        nativeNodes: [],
        edges: [],
      },
    });
    const plan = createWorkflowDraftEditPlan({
      draft,
      context,
      requestMessageIds: ['original-binding-review'],
      options: { includeExplanations: false },
      proposal: {
        decisions: [
          {
            kind: 'add-api-call',
            operation: operation.key,
            instruction: context.messages[0].text,
            sources: [
              {
                kind: 'message',
                messageId: context.messages[0].id,
                quote: context.messages[0].text,
              },
            ],
          },
        ],
      },
    });
    const mediaTypes = listApiRequestMediaTypes(operation);
    for (const requestMediaType of mediaTypes.length
      ? mediaTypes
      : [undefined]) {
      const input = {
        draft,
        context,
        plan,
        requestMessageIds: ['original-binding-review'],
        stepId: plan.steps[0].id,
        resolutions: [],
        ...(requestMediaType === undefined ? {} : { requestMediaType }),
      };
      const description = describeWorkflowDraftApiCallPlanning(input);
      for (const targetPointer of description.requestInputRoots) {
        const inputIntent = resolveWorkflowDraftApiBindingIntent({
          ...input,
          fingerprint: describeWorkflowDraftApiBindingIntent(input).fingerprint,
          proposal: {
            targets: [targetPointer],
            sourceMessageIds: input.requestMessageIds,
          },
        });
        const scopedInput = { ...input, inputIntent };
        const scoped = resolveWorkflowDraftApiCallBindings({
          ...scopedInput,
          fingerprint:
            describeWorkflowDraftApiCallBindings(scopedInput).fingerprint,
          proposal: {
            decision: {
              status: 'needs-clarification',
              questions: [{ kind: 'binding-intent', targetPointer }],
              sourceMessageIds: input.requestMessageIds,
            },
          },
        });
        assert.equal(scoped.status, 'needs-clarification');
        assert.deepEqual(scoped.inputIntent, inputIntent);
        assert.deepEqual(scoped.questions[0].operation, operation.key);
        const scopedAnswer = resolveWorkflowDraftApiCallBindings({
          ...scopedInput,
          fingerprint: scoped.fingerprint,
          proposal: scoped.proposal,
          answers: [{ kind: 'no-binding', questionId: scoped.questions[0].id }],
        });
        assert.equal(scopedAnswer.status, 'ready');
        assert.deepEqual(scopedAnswer.bindings, []);
        const pending = resolveWorkflowDraftApiCallBindings({
          ...input,
          fingerprint: description.fingerprint,
          proposal: {
            decision: {
              status: 'needs-clarification',
              questions: [{ kind: 'binding-intent', targetPointer }],
              sourceMessageIds: input.requestMessageIds,
            },
          },
        });
        assert.equal(pending.status, 'needs-clarification');
        assert.deepEqual(pending.questions[0].operation, operation.key);
        assert.equal(pending.questions[0].targetPointer, targetPointer);
        const ready = resolveWorkflowDraftApiCallBindings({
          ...input,
          fingerprint: pending.fingerprint,
          proposal: pending.proposal,
          answers: [
            { kind: 'no-binding', questionId: pending.questions[0].id },
          ],
        });
        assert.equal(ready.status, 'ready');
        assert.deepEqual(ready.bindings, []);
        assert(!Object.hasOwn(ready, 'values'));
        assert(!Object.hasOwn(ready, 'workflow'));
        checked++;
      }
    }
  }
  assert(checked > 0);
  assert.equal(JSON.stringify(spec), original);
  t.diagnostic(
    `Original ICL request roots checked: ${checked}; model and business API calls: 0`,
  );
});

test('explicit answer reopening preserves original ICL OAS and retires the confirmed fact without inventing a replacement', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = JSON.stringify(spec);
  const catalog = await createApiCatalog([
    { id: 'private-answer-revision-icl', spec },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const operationBefore = globalThis.structuredClone(operation);
  const context = {
    messages: [
      {
        id: 'private-answer-intent',
        text: 'Review the supplied original ICL operation before using it.',
      },
    ],
    operations: [operation],
    capabilities: [],
  };
  const round = createWorkflowClarificationRound({
    context,
    limits: {
      maxCategories: 1,
      maxQuestionsPerCategory: 1,
      maxChoicesPerQuestion: 2,
      maxQuestionsPerRound: 1,
    },
    options: { includeExplanations: false, includeSuggestions: false },
    proposal: {
      statements: [],
      categories: [
        {
          title: '검토',
          questions: [
            { message: '검토를 완료했나요?', answer: { kind: 'text' } },
          ],
        },
      ],
    },
  });
  const question = round.categories[0].questions[0];
  const clarification = prepareWorkflowDraftClarification({
    context,
    round,
    resolution: resolveWorkflowClarificationReplies({
      context,
      round,
      replies: [{ kind: 'text', questionId: question.id, text: '검토 완료' }],
    }),
  });
  const before = {
    ...context,
    clarification,
    messages: [...context.messages, ...clarification.answerMessages],
  };
  const result = reviseWorkflowClarificationAnswers({
    context: before,
    fingerprint:
      describeWorkflowClarificationAnswerRevision(before).fingerprint,
    messageId: 'private-reopen',
    changes: [{ kind: 'reopen-question', questionId: question.id }],
  });
  validateWorkflowClarificationAnswerRevision({
    context: before,
    revision: result.revision,
  });
  assert.deepEqual(result.revision.after.resolution.pendingQuestionIds, [
    question.id,
  ]);
  assert.deepEqual(result.revision.after.resolution.facts, []);
  assert.deepEqual(result.revision.after.confirmedAnswerMessageIds, []);
  assert.equal(result.revision.after.resolution.readyForPlanning, false);
  assert.deepEqual(operation, operationBefore);
  assert.equal(JSON.stringify(spec), original);
  assert(!Object.hasOwn(result, 'workflow'));
});

test('review suggestion adoption preserves the original ICL snapshot and never manufactures an executable workflow', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = JSON.stringify(spec);
  const catalog = await createApiCatalog([
    { id: 'private-reviewed-icl', spec },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const input = {
    context: {
      operations: [operation],
      capabilities: [],
      messages: [
        {
          id: 'original-private-review',
          text: '검토한 원본 API를 유지하고 실제 입력은 사용자가 제공한다.',
        },
      ],
    },
    boundary: {
      key: 'private-current-review',
      kind: 'selection-review',
      revision: 0,
      questions: [],
      data: { originalOperation: operation.key },
    },
    limits: { maxSuggestions: 2 },
  };
  const review = createWorkflowReviewSuggestions({
    ...input,
    proposal: {
      suggestions: [
        {
          kind: 'change-request',
          text: '원본 API를 유지하고 필수 입력을 확인해줘.',
          reason: '원본 OAS 계약과 실제 값을 구분해서 검토합니다.',
          sources: [{ kind: 'oas', operation: operation.key, pointer: '' }],
        },
      ],
    },
  });
  const adoption = adoptWorkflowReviewSuggestion({
    ...input,
    review,
    suggestionId: review.suggestions[0].id,
    messageId: 'private-human-adoption',
  });
  assert.deepEqual(adoption.suggestion.sources[0].operation, operation.key);
  assert.equal(Object.hasOwn(adoption, 'workflow'), false);
  assert.equal(JSON.stringify(spec), original);
  assert.throws(
    () =>
      validateWorkflowReviewSuggestions({
        ...input,
        boundary: { ...input.boundary, revision: 1 },
        review,
      }),
    /stale|modified/,
  );
});

test('clarified requirements retain their original ICL contract and exact fact lineage without inferring absent request values', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const original = JSON.stringify(spec);
  const catalog = await createApiCatalog([
    { id: 'private-clarified-icl', spec },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const message = {
    id: 'private-clarified-intent',
    text: 'Prepare the supplied original ICL operation as a workflow. Preserve the original OAS contract and defer missing values to typed runtime inputs.',
  };
  const originalContext = {
    operations: [operation],
    capabilities: [],
    messages: [message],
  };
  const round = createWorkflowClarificationRound({
    context: originalContext,
    limits: {
      maxCategories: 2,
      maxQuestionsPerCategory: 2,
      maxChoicesPerQuestion: 3,
      maxQuestionsPerRound: 3,
    },
    options: { includeExplanations: false, includeSuggestions: false },
    proposal: {
      statements: [
        {
          text: message.text,
          sources: [
            { kind: 'message', messageId: message.id, quote: message.text },
          ],
        },
      ],
      categories: [],
    },
  });
  const resolution = resolveWorkflowClarificationReplies({
    context: originalContext,
    round,
    replies: [],
  });
  const clarification = prepareWorkflowDraftClarification({
    context: originalContext,
    round,
    resolution,
  });
  const context = { ...originalContext, clarification };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-clarified-icl',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: operation.key,
          instruction: message.text,
          sources: [
            { kind: 'message', messageId: message.id, quote: message.text },
          ],
        },
      ],
    },
  });
  const scopeInput = { ...base, plan };
  const description = describeWorkflowDraftClarificationScopes(scopeInput);
  const clarificationScopes = resolveWorkflowDraftClarificationScopes({
    ...scopeInput,
    fingerprint: description.fingerprint,
    proposal: {
      scopes: {
        [description.requirements[0].id]: {
          scope: { kind: 'nodes', nodeIds: [plan.steps[0].newNodeId] },
        },
      },
    },
  });
  const input = {
    ...scopeInput,
    clarificationScopes,
    resolutions: [],
    stepId: plan.steps[0].id,
    requestMediaType: selectDefaultApiRequestMediaType(operation),
  };
  const bindingPlan = resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: describeWorkflowDraftApiCallPlanning(input).fingerprint,
    proposal: {
      decision: { status: 'provided', sourceMessageIds: [message.id] },
    },
  });
  const args = { ...input, bindingPlan, allowRuntimeInputs: true };
  const result = resolveWorkflowDraftApiCallArguments({
    ...args,
    fingerprint: describeWorkflowDraftApiCallArguments(args).fingerprint,
    proposal: { values: {}, sourceMessageIds: [message.id] },
  });
  assert.equal(result.status, 'ready');
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  assert.deepEqual(candidate.draft.apiCalls[0].operation, operation.key);
  assert.deepEqual(candidate.draft.apiCalls[0].values, {});
  assert.equal(candidate.draft.requirements[0].origin.roundId, round.id);
  assert.deepEqual(candidate.draft.requirements[0].sourceMessageIds, [
    message.id,
  ]);
  assert.equal(
    compileN8nWorkflowTemplate({
      draft: candidate.draft,
      context,
      name: 'Private clarified ICL',
    }).revision,
    candidate.draft.revision,
  );
  assert.equal(JSON.stringify(spec), original);
  assert.deepEqual(draft.requirements, []);
});

test('original ICL response contracts are available for every selected instance before request values exist', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const catalog = await createApiCatalog([
    { id: 'private-selected-responses', spec },
  ]);
  assert.ok(catalog.operations.length >= 2);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.slice(0, 2).map((item) => item.key),
  );
  const message = {
    id: 'private-response-contracts',
    text: 'Select these two original ICL operations. Keep missing request values unresolved, and do not execute the APIs.',
  };
  const context = { operations, capabilities: [], messages: [message] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-selected-responses',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const input = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: operations.map((operation, index) => ({
        kind: 'add-api-call',
        operation: operation.key,
        instruction: `Select original ICL role ${index + 1}; request values remain unresolved.`,
        sources: [
          { kind: 'message', messageId: message.id, quote: message.text },
        ],
      })),
    },
  });
  const stage = stageWorkflowDraftEdit({ ...input, plan, resolutions: [] });
  assert.equal(stage.apiResponseSources.length, 2);
  assert.deepEqual(stage.content.apiCalls, []);
  for (const [index, source] of stage.apiResponseSources.entries()) {
    assert.deepEqual(source.operation, operations[index]);
    assert.equal(source.nodeId, plan.steps[index].newNodeId);
    assert.equal(source.preparation.status, 'request-pending');
    assert.equal(Object.hasOwn(source.preparation, 'request'), false);
    assert.ok(stage.blockedSourceNodeIds.includes(source.nodeId));
  }
  assert.deepEqual(draft.apiCalls, []);
});

test('canonical conversation host consumes original ICL OAS and preserves unknown values as real typed runtime slots', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const catalog = await createApiCatalog([
    { id: 'private-host-conversation', spec },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const context = { operations: [operation], capabilities: [], messages: [] };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-host-conversation',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          if (options.name === 'select_api_request_media_type')
            return {
              requestMediaType: selectDefaultApiRequestMediaType(operation),
            };
          const message = payload.messages.at(-1);
          const sources = [{ kind: 'message', messageId: message.id }];
          if (options.name === 'analyze_workflow_draft_edit')
            return {
              decisions: [
                {
                  kind: 'add-api-call',
                  operation: payload.candidates[0].candidateId,
                  instruction: message.text,
                  sources,
                },
              ],
            };
          if (options.name === 'plan_draft_api_call_bindings')
            return {
              decision: { status: 'provided', sourceMessageIds: [message.id] },
            };
          if (options.name === 'generate_draft_api_call_arguments')
            return { values: {}, sourceMessageIds: [message.id] };
          if (options.name === 'plan_draft_connection_edit')
            return { decisions: [{ kind: 'keep-connections', sources }] };
          throw new Error(`Unexpected private OAS host stage ${options.name}`);
        },
      };
    },
  };
  const graph = createWorkflowDraftConversationGraph({
    context,
    model,
    checkpointer: new MemorySaver(),
    name: 'Private ICL canonical host',
    reviewPolicy: 'automatic',
    includeExplanations: false,
    allowRuntimeInputs: true,
  });
  const result = await graph.invoke(
    {
      input: {
        initialDraft: draft,
        request: {
          id: 'private-request',
          text: 'Create one independent workflow using the supplied original OAS operation. Do not infer values; retain required missing values as runtime slots.',
          expectedRevision: 0,
        },
      },
    },
    {
      configurable: { thread_id: 'private-host-conversation' },
      recursionLimit: 100,
    },
  );
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.draft.apiCalls[0].operation, operation.key);
  assert.deepEqual(result.draft.apiCalls[0].values, {});
  assert.equal(result.artifact.revision, result.draft.revision);
  assert.deepEqual(
    result.artifact.nodeMappings.find((mapping) => mapping.kind === 'api')
      .operation.key,
    operation.key,
  );
  assert.deepEqual(draft.apiCalls, []);
});

test('private ICL API additions keep selected OAS metadata and defer absent values without copying an existing call', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const catalog = await createApiCatalog([
    { id: 'private-api-addition', spec },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const message = {
    id: 'api-addition',
    text: 'Add another independent call using this operation. Do not infer request values; defer required values to explicit runtime inputs.',
  };
  const context = {
    operations: [operation],
    capabilities: [],
    messages: [message],
  };
  const requestMediaType = selectDefaultApiRequestMediaType(operation);
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-api-addition',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'add-api-call',
          operation: operation.key,
          instruction: message.text,
          sources: [
            { kind: 'message', messageId: message.id, quote: message.text },
          ],
        },
      ],
    },
  });
  const input = {
    ...base,
    plan,
    stepId: plan.steps[0].id,
    resolutions: [],
    requestMediaType,
  };
  const described = describeWorkflowDraftApiCallPlanning(input);
  assert.deepEqual(described.operation.key, operation.key);
  const bindingPlan = resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: described.fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        sourceMessageIds: [message.id],
      },
    },
  });
  assert.equal(bindingPlan.status, 'ready');
  const args = { ...input, bindingPlan, allowRuntimeInputs: true };
  const result = resolveWorkflowDraftApiCallArguments({
    ...args,
    fingerprint: describeWorkflowDraftApiCallArguments(args).fingerprint,
    proposal: { values: {}, sourceMessageIds: [message.id] },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resolution.values, {});
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    resolutions: [result.resolution],
  });
  const artifact = compileN8nWorkflowTemplate({
    draft: candidate.draft,
    context,
    name: 'Private ICL selected API addition',
  });
  assert.deepEqual(
    artifact.nodeMappings.find((mapping) => mapping.kind === 'api').operation
      .key,
    operation.key,
  );
  assert.deepEqual(draft.apiCalls, []);
  assert.ok(
    artifact.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
  );
});

test('private ICL native additions retain the actual OAS and require an explicit new connection', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const catalog = await createApiCatalog([{ id: 'private-addition', spec }]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  createResponseValueSchema(operation, '');
  const message = {
    id: 'private-addition-request',
    text: 'Add an IF after the API. Continue only if its unchanged full JSON response body is not null.',
  };
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  const context = {
    operations: [operation],
    capabilities: resolveN8nNativeFeatures({ features: [N8nNativeFeature.If] })
      .capabilities,
    messages: [message],
  };
  const mediaType = selectDefaultApiRequestMediaType(operation);
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-addition',
      requirements: [],
      apiCalls: [
        {
          id: 'source',
          operation: operation.key,
          values: {},
          bindings: [],
          ...(mediaType === undefined ? {} : { requestMediaType: mediaType }),
        },
      ],
      nativeNodes: [],
      edges: [],
    },
  });
  const original = globalThis.structuredClone(draft);
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'add-native-node',
          capability: N8nNativeFeature.If,
          instruction: message.text,
          sources,
        },
      ],
    },
  });
  const input = { ...base, plan, stepId: plan.steps[0].id, resolutions: [] };
  const addition = resolveWorkflowDraftNativeNodeAddition({
    ...input,
    fingerprint: describeWorkflowDraftNativeNodeAddition(input).fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'response', nodeId: 'source', pointer: '' },
              operator: 'notEquals',
              right: { source: 'literal', value: null },
            },
          ],
        },
        sourceMessageIds: [message.id],
      },
    },
  });
  assert.equal(addition.status, 'ready');
  const staged = { ...input, resolutions: [addition.resolution] };
  const description = describeWorkflowDraftConnectionEdit(staged);
  assert.equal(description.status, 'ready');
  const connection = resolveWorkflowDraftConnectionEdit({
    ...staged,
    fingerprint: description.fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'add',
          source: { nodeId: 'source', port: 'main' },
          target: { nodeId: plan.steps[0].newNodeId, port: 'main' },
          sources,
        },
      ],
    },
  });
  assert.equal(connection.status, 'ready');
  assert.deepEqual(connection.candidate.draft.apiCalls, original.apiCalls);
  assert.deepEqual(draft, original);
  const artifact = compileN8nWorkflowTemplate({
    draft: connection.candidate.draft,
    context,
    name: 'Actual private OAS native addition',
  });
  assert.ok(
    artifact.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.if'),
  );
  assert.ok(
    artifact.nodeMappings.some(
      (mapping) =>
        mapping.kind === 'api' &&
        mapping.operation.key.snapshotId === operation.key.snapshotId,
    ),
  );
});

test('private ICL OAS native repairs acknowledge actual replacement response contracts without rewriting settings', async () => {
  const spec = JSON.parse(
    await readFile(join(directory, 'icl.openapi.json'), 'utf8'),
  );
  const catalog = await createApiCatalog([{ id: 'private-repair', spec }]);
  assert.ok(catalog.operations.length >= 2);
  const [original, replacement] = await resolveApiOperations(
    catalog,
    catalog.operations.slice(0, 2).map((entry) => entry.key),
  );
  createResponseValueSchema(original, '');
  createResponseValueSchema(replacement, '');
  const message = {
    id: 'private-repair-message',
    text: 'Replace source and keep the full response comparison, literal and routes unchanged.',
  };
  const context = {
    operations: [original, replacement],
    capabilities: resolveN8nNativeFeatures({ features: [N8nNativeFeature.If] })
      .capabilities,
    messages: [message],
  };
  const originalMedia = selectDefaultApiRequestMediaType(original);
  const newMedia = selectDefaultApiRequestMediaType(replacement);
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'private-reference',
      requirements: [],
      apiCalls: [
        {
          id: 'source',
          operation: original.key,
          values: {},
          bindings: [],
          ...(originalMedia === undefined
            ? {}
            : { requestMediaType: originalMedia }),
        },
      ],
      nativeNodes: [
        {
          id: 'gate',
          capability: N8nNativeFeature.If,
          parameters: {
            combinator: 'and',
            conditions: [
              {
                left: { source: 'response', nodeId: 'source', pointer: '' },
                operator: 'notEquals',
                right: { source: 'literal', value: null },
              },
            ],
          },
        },
      ],
      edges: [{ from: 'source', output: 'main', to: 'gate', input: 'main' }],
    },
  });
  const sources = [
    { kind: 'message', messageId: message.id, quote: message.text },
  ];
  const base = { draft, context, requestMessageIds: [message.id] };
  const plan = createWorkflowDraftEditPlan({
    ...base,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'source',
          operation: replacement.key,
          instruction: message.text,
          sources,
        },
      ],
    },
  });
  const input = {
    ...base,
    plan,
    resolutions: [
      {
        stepId: plan.steps[0].id,
        kind: 'api-call',
        values: {},
        bindings: [],
        ...(newMedia === undefined ? {} : { requestMediaType: newMedia }),
      },
    ],
  };
  const task = stageWorkflowDraftEdit(input).pendingRepairs.find(
    (task) => task.nodeId === 'gate',
  );
  assert.ok(task);
  const bounded = { ...input, taskId: task.id };
  const description = describeWorkflowDraftNativeReferenceRepair(bounded);
  const result = resolveWorkflowDraftNativeReferenceRepair({
    ...bounded,
    fingerprint: description.fingerprint,
    proposal: {
      decisions: Object.fromEntries(
        description.bindings.map((binding) => [
          binding.id,
          { kind: 'keep', sourceMessageIds: [message.id] },
        ]),
      ),
    },
  });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.repair.edits, []);
  const candidate = assembleWorkflowDraftEdit({
    ...input,
    repairs: [result.repair],
  });
  assert.deepEqual(candidate.draft.nativeNodes, draft.nativeNodes);
  assert.deepEqual(candidate.draft.edges, draft.edges);
  assert.deepEqual(candidate.draft.apiCalls[0].operation, replacement.key);
});

test('private OAS edit plans preserve original operation identities and distinct repeated-call roles through atomic application', async () => {
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const requestMediaType = selectDefaultApiRequestMediaType(operation);
    const mediaSelection =
      requestMediaType === undefined ? {} : { requestMediaType };
    const context = {
      operations: [operation],
      capabilities: [],
      messages: [
        {
          id: 'edit-actual',
          text: 'Add another independent instance of the selected API. Keep the existing instance unchanged.',
        },
      ],
    };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'private-edit',
        requirements: [],
        nativeNodes: [],
        edges: [],
        apiCalls: [
          {
            id: 'existing-instance',
            operation: operation.key,
            values: {},
            bindings: [],
            ...mediaSelection,
          },
        ],
      },
    });
    const before = globalThis.structuredClone(draft);
    const plan = createWorkflowDraftEditPlan({
      draft,
      context,
      requestMessageIds: ['edit-actual'],
      options: { includeExplanations: false },
      proposal: {
        decisions: [
          {
            kind: 'add-api-call',
            operation: operation.key,
            instruction: 'Add another independent instance',
            sources: [
              {
                kind: 'message',
                messageId: 'edit-actual',
                quote: 'Add another independent instance',
              },
            ],
          },
        ],
      },
    });
    validateWorkflowDraftEditPlan({
      draft,
      context,
      requestMessageIds: ['edit-actual'],
      plan,
    });
    const result = assembleWorkflowDraftEdit({
      draft,
      context,
      plan,
      requestMessageIds: ['edit-actual'],
      resolutions: [
        {
          stepId: plan.steps[0].id,
          kind: 'api-call',
          values: {},
          bindings: [],
          ...mediaSelection,
        },
      ],
    });
    assert.equal(result.status, 'changed');
    assert.deepEqual(draft, before);
    assert.deepEqual(result.draft.apiCalls[0], before.apiCalls[0]);
    assert.notEqual(result.draft.apiCalls[0].id, result.draft.apiCalls[1].id);
    assert.deepEqual(result.draft.apiCalls[1].operation, operation.key);
    assert.deepEqual(result.impact.preservedNodeIds, ['existing-instance']);
    assert.throws(
      () =>
        validateWorkflowDraftEditPlan({
          draft: result.draft,
          context,
          requestMessageIds: ['edit-actual'],
          plan,
        }),
      /stale|modified/,
    );
  }
});

test('private OAS native feature registry preserves resolved operations and restricts response sources', async () => {
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const before = globalThis.structuredClone(operation);
    const registry = resolveN8nNativeFeatures({
      features: [
        N8nNativeFeature.CollectApiResponses,
        N8nNativeFeature.SplitApiResponseArray,
      ],
      apiMaterials: [{ callId: 'actual-call', operation }],
    });
    assert.equal(registry.capabilities.length, 2);
    assert.ok(
      registry.registrations.every((entry) => entry.status === 'ready'),
    );
    for (const capability of registry.capabilities) {
      // Producer identity and pointer admissibility are separate contracts. A body
      // that is not an array must not become splittable just because its ID exists.
      const acceptsRoot =
        capability.name === N8nNativeFeature.SplitApiResponseArray
          ? createApiResponsePointerSelectionSchema({
              operation,
              valueKind: 'array',
            }).safeParse('').success
          : true;
      assert.equal(
        capability.parametersSchema.safeParse({
          sourceNodeId: 'actual-call',
          pointer: '',
        }).success,
        acceptsRoot,
      );
      assert.equal(
        capability.parametersSchema.safeParse({
          sourceNodeId: 'invented-call',
          pointer: '',
        }).success,
        false,
      );
    }
    assert.deepEqual(operation, before);
  }
});

test('private OAS clarification evidence preserves actual operation snapshots without expanding short requests', async () => {
  let checked = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const [operation] = await resolveApiOperations(catalog, [
      catalog.operations[0].key,
    ]);
    const text = '제공한 API로 조회 작업 흐름을 만들어줘.';
    const context = {
      messages: [{ id: 'request-1', text }],
      operations: [operation],
    };
    const source = { kind: 'message', messageId: 'request-1', quote: text };
    const round = createWorkflowClarificationRound({
      context,
      limits: {
        maxCategories: 4,
        maxQuestionsPerCategory: 3,
        maxChoicesPerQuestion: 5,
        maxQuestionsPerRound: 6,
      },
      proposal: {
        statements: [
          {
            text,
            sources: [source],
            explanation: {
              reason: '사용자가 제공한 API를 사용하도록 요청했습니다.',
              evidence: [
                { kind: 'oas', operation: operation.key, pointer: '' },
              ],
            },
          },
        ],
        categories: [],
        suggestions: [],
      },
    });
    const resolution = resolveWorkflowClarificationReplies({
      round,
      context,
      replies: [],
    });
    assert.equal(resolution.readyForPlanning, true);
    assert.equal(resolution.facts.length, 1);
    assert.deepEqual(
      round.statements[0].explanation.evidence[0].operation,
      operation.key,
    );
    assert.equal(Object.hasOwn(resolution, 'values'), false);
    checked++;
  }
  assert.equal(checked, files.length);
});

test('private OAS runtime slots preserve original contracts and independent draft identities', async () => {
  let inputCount = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((item) => item.key),
    );
    // This regression cohort exercises outgoing GET parameter inputs; it does
    // not narrow the library's document intake or production operation set.
    const selected = operations
      .filter(
        (operation) =>
          operation.method === 'GET' &&
          operation.operation.requestBody === undefined,
      )
      .slice(0, 3);
    const materials = selected.map((operation, index) => ({
      callId: `call-${index}`,
      operation,
      values: {},
      bindings: [],
    }));
    const before = globalThis.structuredClone(materials);
    const slots = collectDeferredApiInputSlots({ materials });
    inputCount += slots.length;
    assert.ok(slots.every((slot) => !Object.hasOwn(slot, 'value')));
    assert.deepEqual(materials, before);
    const context = { operations, capabilities: [], messages: [] };
    const draft = createWorkflowDraft({
      context,
      content: {
        id: 'private-input-draft',
        requirements: [],
        nativeNodes: [],
        edges: [],
        apiCalls: materials.map((material) => ({
          id: material.callId,
          operation: material.operation.key,
          values: {},
          bindings: [],
        })),
      },
    });
    const inspection = inspectDraftReadiness({ draft, context });
    assert.deepEqual(inspection.slots, slots);
    assert.ok(
      inspection.nodes.every((node) => node.planningStatus === 'ready'),
    );
    assert.equal(
      inspectDeferredApiInputs({ materials, inputValues: {} }).status,
      slots.length ? 'needs-input' : 'ready',
    );
    const icl = operations.find(
      (operation) =>
        operation.path === '/item/core/getItemInfo' &&
        operation.method === 'GET',
    );
    if (icl) {
      const material = {
        operation: icl,
        callId: 'icl-read',
        values: {},
        bindings: [],
      };
      const iclSlots = collectDeferredApiInputSlots({ materials: [material] });
      assert.equal(iclSlots.length, 1);
      inputCount += iclSlots.length;
      const [slot] = iclSlots;
      assert.equal(slot.targetPointer, '/query/gdNo');
      const [args] = materializeDeferredApiInputs({
        materials: [material],
        inputValues: { [slot.id]: 'fixture-seed' },
      });
      assert.equal(args.values.query.gdNo, 'fixture-seed');
      const changed = applyDraftChangeSet({
        draft,
        context,
        changeSet: {
          baseRevision: 0,
          changes: [
            {
              kind: 'add-api-call',
              call: {
                id: 'icl-read',
                operation: icl.key,
                values: args.values,
                bindings: [],
              },
            },
          ],
        },
      });
      assert.deepEqual(
        changed.impact.preservedNodeIds,
        draft.apiCalls.map((call) => call.id),
      );
      assert.deepEqual(
        changed.draft.apiCalls.slice(0, draft.apiCalls.length),
        draft.apiCalls,
      );
    }
  }
  assert.ok(
    inputCount > 0,
    'Private OAS cohort must exercise actual required inputs',
  );
});

test('private real OAS pointer catalogs preserve declared response locations without guessed envelope segments', async () => {
  let variants = 0;
  let iclChecked = false;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const contracts = await resolveApiOperations(
      catalog,
      catalog.operations.map((x) => x.key),
    );
    for (const operation of contracts) {
      const before = globalThis.structuredClone(operation);
      for (const entry of listApiResponsePointers(operation)) {
        variants++;
        const schema =
          operation.operation.responses[entry.responseKey].content[
            entry.mediaType
          ].schema;
        for (const field of [
          ...entry.declaredPointers,
          ...entry.dynamicLocations,
        ]) {
          const location =
            field.schemaLocation === ''
              ? []
              : field.schemaLocation
                  .slice(1)
                  .split('/')
                  .map((token) =>
                    token.replaceAll('~1', '/').replaceAll('~0', '~'),
                  );
          const declaration = location.reduce(
            (value, token) => value[token],
            schema,
          );
          assert.notEqual(
            declaration,
            undefined,
            'Catalog location must identify an original schema declaration',
          );
        }
        if (
          operation.path === '/item/core/getItemInfo' &&
          operation.method === 'GET'
        ) {
          const paths = entry.declaredPointers.map((x) => x.pointer);
          assert.ok(paths.includes('/result/gdNo'));
          assert.ok(paths.includes('/result/cached'));
          assert.ok(!paths.includes('/result/result/gdNo'));
          assert.ok(!paths.includes('/result/result/cached'));
          iclChecked = true;
        }
      }
      assert.deepEqual(operation, before);
    }
  }
  assert.ok(variants > 0);
  if (files.some((file) => file === 'icl.openapi.json'))
    assert.equal(iclChecked, true);
});

test('private real OAS contracts compile full-response guards for native IF and assertions', async () => {
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const operation = operations.find((entry) =>
      Object.values(entry.operation.responses ?? {}).some(
        (response) => Object.keys(response.content ?? {}).length,
      ),
    );
    assert.ok(operation, 'each private OAS must have a response contract');
    const check = {
      left: { source: 'response', nodeId: 'source', pointer: '' },
      operator: 'notEquals',
      right: { source: 'literal', value: null },
    };
    for (const options of [{}, { itemMode: 'linked' }])
      for (const capability of createN8nNativeCapabilities(options).filter(
        (entry) => ['if', 'assert-responses'].includes(entry.name),
      )) {
        const fragment = capability.compile({
          planned: {
            id: 'check',
            capability: capability.name,
            parameters:
              capability.name === 'if'
                ? { combinator: 'and', conditions: [check] }
                : { checks: [{ ...check, message: 'Body must not be null' }] },
          },
          position: [0, 0],
          apiNodeNames: { source: 'Request source' },
          apiResponseContracts: { source: operation },
        });
        assert.equal(fragment.bindingSources[0].operation, operation);
        assert.equal(fragment.entry.type, 'n8n-nodes-base.code');
        assert.ok(
          fragment.entry.config.parameters.jsCode.includes(
            'OpenApiFlowResponseValidator0',
          ),
        );
      }
  }
});

test('original OAS bodies remain native JSON contracts when supplied to IF and assertion planning', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const before = JSON.stringify(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const operation = operations.find(
      (entry) => listApiResponsePointers(entry).length > 0,
    );
    assert.ok(operation, 'each original OAS must supply a body contract');
    const producer = createApiResponseObjectCapability({
      materials: [{ callId: 'api-source', operation }],
    });
    const output = {
      nodeId: 'original-body',
      schema: producer.outputSchema({
        fields: [{ name: 'original', sourceNodeId: 'api-source', pointer: '' }],
      }),
    };
    assert.deepEqual(
      output.schema.properties.original,
      createResponseValueSchema(operation, ''),
    );
    const check = {
      left: {
        source: 'node-output',
        nodeId: output.nodeId,
        pointer: '/original',
      },
      operator: 'notEquals',
      right: { source: 'literal', value: null },
    };
    for (const options of [{}, { itemMode: 'linked' }]) {
      const implementations = createN8nNativeCapabilities(options).filter(
        (entry) => ['if', 'assert-responses'].includes(entry.name),
      );
      const planning = createWorkflowPlanningCapabilities({
        capabilities: implementations,
        apiCallIds: [],
        nativeOutputs: [output],
      });
      for (const capability of implementations) {
        const parameters =
          capability.name === 'if'
            ? { combinator: 'and', conditions: [check] }
            : {
                checks: [
                  { ...check, message: 'Original body must not be null' },
                ],
              };
        const modelSchema = planning.find(
          (entry) => entry.name === capability.name,
        );
        assert.equal(
          modelSchema.parametersSchema.safeParse(parameters).success,
          true,
        );
        const fragment = capability.compile({
          planned: {
            id: 'check-original',
            capability: capability.name,
            parameters,
          },
          position: [0, 0],
          apiNodeNames: {},
          nativeOutputSources: [{ ...output, nodeName: 'Original body item' }],
        });
        assert.equal(fragment.entry.type, 'n8n-nodes-base.code');
        assert.equal(fragment.bindingSources.length, 1);
        assert.equal(fragment.bindingSources[0].kind, 'native-json');
        assert.deepEqual(fragment.bindingSources[0].schema, output.schema);
        assert.equal(
          Object.hasOwn(fragment.bindingSources[0], 'operation'),
          false,
        );
      }
    }
    assert.equal(JSON.stringify(spec), before);
  }
});

test('original OAS response contracts remain unchanged when native values are collected by official Aggregate', async () => {
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const before = JSON.stringify(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const operation = operations.find(
      (entry) => listApiResponsePointers(entry).length > 0,
    );
    assert.ok(operation, `${file} needs an actual response contract`);
    const response = createApiResponseObjectCapability({
      materials: [{ callId: 'actual-api', operation }],
    });
    const output = {
      nodeId: 'actual-native-body',
      nodeName: 'Actual native body',
      schema: response.outputSchema({
        fields: [{ name: 'body', sourceNodeId: 'actual-api', pointer: '' }],
      }),
    };
    const capability = createNativeValueCollectionCapability({
      sources: [output],
    });
    const parameters = { sourceNodeId: output.nodeId, pointer: '/body' };
    assert.equal(
      capability.parametersSchema.safeParse(parameters).success,
      true,
    );
    assert.deepEqual(capability.nodeOutputReferences(parameters), [
      { source: 'node-output', nodeId: output.nodeId, pointer: '/body' },
    ]);
    const schema = capability.outputSchema(parameters);
    assert.equal(schema.properties.items.type, 'array');
    assert.deepEqual(
      schema.properties.items.items,
      createNativeValueSchema(output, '/body'),
    );
    const fragment = capability.compile({
      planned: { id: 'collect', capability: capability.name, parameters },
      position: [0, 0],
      apiNodeNames: {},
      nativeOutputSources: [output],
    });
    assert.equal(fragment.exit.type, 'n8n-nodes-base.aggregate');
    assert.deepEqual(fragment.bindingSources[0].schema, output.schema);
    assert.equal(JSON.stringify(spec), before);
  }
});

test('original OAS string and array fields support explicit derived measurements without replacing original bodies', async () => {
  let checked = 0;
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
    const before = JSON.stringify(spec);
    const catalog = await createApiCatalog([{ id: file, spec }]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const visited = new Set();
    for (const operation of operations) {
      for (const pointer of listApiResponsePointers(operation).flatMap(
        (entry) => entry.declaredPointers,
      )) {
        const declared = Array.isArray(pointer.type)
          ? pointer.type
          : [pointer.type];
        const kind = ['string', 'array'].find(
          (type) => declared.includes(type) && !visited.has(type),
        );
        if (kind === undefined) continue;
        const body = createApiResponseObjectCapability({
          materials: [{ callId: 'api', operation }],
        });
        const output = {
          nodeId: 'original-body',
          nodeName: 'Original body',
          schema: body.outputSchema({
            fields: [{ name: 'body', sourceNodeId: 'api', pointer: '' }],
          }),
        };
        const capability = createNativeOutputProjectionCapability({
          sources: [output],
        });
        const parameters = {
          sourceNodeId: output.nodeId,
          fields: [
            { name: 'original', pointer: '/body' },
            {
              name: 'count',
              pointer: '/body' + pointer.pointer,
              measurement:
                kind === 'string' ? 'utf16-code-units' : 'array-items',
            },
          ],
        };
        const schema = capability.outputSchema(parameters);
        assert.deepEqual(schema.properties.count, {
          type: 'integer',
          minimum: 0,
        });
        assert.notDeepEqual(
          schema.properties.original,
          schema.properties.count,
        );
        const fragment = capability.compile({
          planned: { id: 'measure', capability: capability.name, parameters },
          position: [0, 0],
          apiNodeNames: {},
          nativeOutputSources: [output],
        });
        assert.equal(fragment.exit.type, 'n8n-nodes-base.set');
        assert.deepEqual(fragment.bindingSources[0].schema, output.schema);
        visited.add(kind);
        checked++;
      }
      if (visited.size === 2) break;
    }
    assert.ok(
      visited.size > 0,
      `${file} must supply a declared string or array alternative`,
    );
    assert.equal(JSON.stringify(spec), before);
  }
  assert.ok(checked >= files.length);
});

test('private real OAS contracts compile two distinct call instances of the same operation into item-join readers', async () => {
  let count = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const contracts = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    const candidates = contracts.filter((entry) =>
      Object.values(entry.operation.responses ?? {}).some(
        (response) => Object.keys(response.content ?? {}).length,
      ),
    );
    assert.ok(
      candidates.length >= 1,
      'each private OAS must supply a response-bearing operation',
    );
    const operations = [candidates[0], candidates[0]];
    const materials = operations.map((operation, i) => ({
      callId: 'call-' + i,
      operation,
    }));
    const scope = createJsonOutputCapability({
      name: 'private-scope',
      description: 'Explicit singleton regression scope.',
      parametersSchema: z.strictObject({ document: z.literal(file) }),
    });
    const scopes = createN8nNativeOutputSources({
      nativeNodes: [
        { id: 'scope', capability: scope.name, parameters: { document: file } },
      ],
      capabilities: [scope],
      apiNodeNames: {},
    });
    const capability = createItemJoinCapability({ materials, scopes });
    const parameters = {
      scopeNodeId: 'scope',
      sourceCallIds: materials.map((material) => material.callId),
    };
    const schema = capability.outputSchema(parameters);
    const ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      discriminator: true,
    });
    addFormats(ajv);
    ajv.compile(schema);
    const fragment = capability.compile({
      planned: { id: 'join', capability: capability.name, parameters },
      position: [0, 0],
      apiNodeNames: Object.fromEntries(
        materials.map((material) => [material.callId, material.callId]),
      ),
    });
    assert.deepEqual(
      fragment.bindingSources
        .filter((source) => source.kind === 'api-response')
        .map((source) => source.operation),
      operations,
    );
    assert.equal(Object.keys(fragment.inputEndpoints).length, 2);
    count++;
  }
  assert.equal(count, files.length);
});

test('original multi-service OAS response types form named output fields without invented schemas or changed documents', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const original = JSON.stringify(sources);
  const catalog = await createApiCatalog(sources);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map(({ key }) => key),
  );
  const declared = operations.filter(
    (operation) => listApiResponsePointers(operation).length > 0,
  );
  const selected = sources.flatMap((source) =>
    declared
      .filter((operation) => operation.key.documentId === source.id)
      .slice(0, 1),
  );
  assert.ok(
    selected.length >= 2,
    'Original response contracts from multiple services are required',
  );
  const materials = selected.map((operation, index) => ({
    callId: `source-${index + 1}`,
    operation,
  }));
  const capability = createApiResponseObjectCapability({ materials });
  const fields = materials.map((material, index) => ({
    name: `result-${index + 1}`,
    sourceNodeId: material.callId,
    pointer: '',
  }));
  const schema = capability.outputSchema({ fields });
  for (const [index, material] of materials.entries())
    assert.deepEqual(
      schema.properties[`result-${index + 1}`],
      createResponseValueSchema(material.operation, ''),
    );
  const fragment = capability.compile({
    planned: {
      id: 'compose',
      capability: capability.name,
      parameters: { fields },
    },
    position: [0, 0],
    apiNodeNames: Object.fromEntries(
      materials.map(({ callId }) => [callId, `Actual ${callId}`]),
    ),
  });
  assert.equal(fragment.exit.type, 'n8n-nodes-base.set');
  assert.equal(fragment.bindingSources.length, materials.length);
  for (const operation of operations.filter(
    (operation) => listApiResponsePointers(operation).length === 0,
  )) {
    const bodyless = createApiResponseObjectCapability({
      materials: [{ callId: 'bodyless', operation }],
    });
    const parameters = {
      fields: [{ name: 'body', sourceNodeId: 'bodyless', pointer: '' }],
    };
    assert.equal(
      bodyless.parametersSchema.safeParse(parameters).success,
      false,
    );
    assert.throws(
      () => bodyless.outputSchema(parameters),
      (error) =>
        error instanceof z.ZodError &&
        error.issues.some((issue) => issue.path[0] === 'fields'),
    );
    assert.throws(
      () => createResponseValueSchema(operation, ''),
      /no declared response value/,
    );
  }
  assert.equal(JSON.stringify(sources), original);
});

test('original multi-service OAS full response contracts form fixed results with code-owned provenance', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const original = JSON.stringify(sources);
  const catalog = await createApiCatalog(sources);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map(({ key }) => key),
  );
  const selected = sources.flatMap((source) =>
    operations
      .filter(
        (operation) =>
          operation.key.documentId === source.id &&
          listApiResponsePointers(operation).length > 0,
      )
      .slice(0, 1),
  );
  assert.ok(
    selected.length >= 2,
    'Original response contracts from multiple services are required',
  );
  const materials = selected.map((operation, index) => ({
    callId: `source-${index + 1}`,
    operation,
  }));
  const capability = createApiResponseResultsCapability({ materials });
  const parameters = { sourceNodeIds: materials.map(({ callId }) => callId) };
  const schema = capability.outputSchema(parameters);
  for (const [index, material] of materials.entries()) {
    const properties = schema.properties.results.items.anyOf[index].properties;
    assert.deepEqual(
      properties.body,
      createResponseValueSchema(material.operation, ''),
    );
    assert.deepEqual(properties.callId, { const: material.callId });
    assert.deepEqual(properties.documentId, {
      const: material.operation.key.documentId,
    });
    assert.deepEqual(properties.method, { const: material.operation.method });
    assert.deepEqual(properties.path, { const: material.operation.path });
  }
  const fragment = capability.compile({
    planned: { id: 'results', capability: capability.name, parameters },
    position: [0, 0],
    apiNodeNames: Object.fromEntries(
      materials.map(({ callId }) => [callId, `Actual ${callId}`]),
    ),
  });
  assert.equal(fragment.exit.type, 'n8n-nodes-base.aggregate');
  assert.deepEqual(
    fragment.bindingSources.map((source) => source.operation),
    selected,
  );
  for (const operation of operations.filter(
    (entry) => !listApiResponsePointers(entry).length,
  )) {
    const bodyless = createApiResponseResultsCapability({
      materials: [{ callId: 'bodyless', operation }],
    });
    assert.throws(
      () => bodyless.outputSchema({ sourceNodeIds: ['bodyless'] }),
      /no declared response value/,
    );
  }
  assert.equal(JSON.stringify(sources), original);
});

test('all private real OAS response contracts compile with the runtime validator without rewritten data', async () => {
  let count = 0;
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    const operations = await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    );
    for (const operation of operations) {
      const ajv = new Ajv2020({
        strict: false,
        allErrors: true,
        discriminator: true,
      });
      addFormats(ajv);
      ajv.compile(createApiResponseSchema({ operation }));
      count++;
    }
  }
  assert.ok(count > 0);
});

test('private real OAS arrays derive item contracts and compile singleton and linked readers from original schemas', async () => {
  let count = 0;
  function pointers(schema, pointer = '') {
    if (!schema || typeof schema !== 'object') return [];
    return [
      ...(schema.type === 'array' ? [pointer] : []),
      ...Object.entries(schema.properties ?? {}).flatMap(([key, child]) =>
        pointers(
          child,
          pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
        ),
      ),
    ];
  }
  for (const file of files) {
    const catalog = await createApiCatalog([
      {
        id: file,
        spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      },
    ]);
    for (const operation of await resolveApiOperations(
      catalog,
      catalog.operations.map((entry) => entry.key),
    ))
      for (const response of Object.values(operation.operation.responses ?? {}))
        for (const media of Object.values(response.content ?? {}))
          for (const pointer of pointers(media.schema)) {
            assert.ok(createResponseArrayItemSchema(operation, pointer));
            for (const options of [{}, { itemMode: 'linked' }]) {
              const capability = createResponseArrayCapability({
                materials: [{ callId: 'source', operation }],
                ...options,
              });
              const fragment = capability.compile({
                planned: {
                  id: 'split',
                  capability: capability.name,
                  parameters: { sourceNodeId: 'source', pointer },
                },
                position: [0, 0],
                apiNodeNames: { source: 'Request source' },
              });
              assert.equal(fragment.exit.type, 'n8n-nodes-base.splitOut');
              assert.deepEqual(fragment.bindingSources[0].operation, operation);
              assert.notEqual(fragment.bindingSources[0].operation, operation);
              assert.equal(
                fragment.entry.config.parameters.jsCode.includes(
                  'itemMatching(inputIndex)',
                ),
                options.itemMode === 'linked',
              );
            }
            count++;
          }
  }
  assert.ok(count > 0);
});

test('real OAS files form a multi-document operation catalog', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
      baseUrl: 'https://example.test',
      effectPolicy: {},
      credentialBindings: {},
    })),
  );
  const catalog = await createOperationCatalog(sources);
  assert.equal(catalog.sources.size, files.length);
  assert.equal(
    catalog.entries.length,
    (
      await Promise.all(
        sources.map((source) => operationsFromSpec(source.spec)),
      )
    ).reduce((count, operations) => count + operations.length, 0),
  );
  assert.ok(catalog.entries.every((entry) => files.includes(entry.id)));
});

const operationMethods = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
]);

test('real OAS contracts preserve blocked API identities without fabricating request values', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const catalog = await createApiCatalog(sources);
  const selection = {
    operations: sources.map((source) => {
      const candidate = catalog.operations.find(
        (item) => item.key.documentId === source.id,
      );
      assert.ok(candidate);
      return {
        key: candidate.key,
        purpose: 'Review the confirmed service contract',
      };
    }),
    gaps: [
      {
        kind: 'missing_operation',
        description: 'Host-reported requirement needs API review',
      },
    ],
  };
  const contracts = await resolveApiOperations(
    catalog,
    selection.operations.map((item) => item.key),
  );
  const gaps = [
    {
      id: 'reported-review',
      stage: 'api-selection',
      description: selection.gaps[0].description,
    },
  ];
  const materials = contracts.map((operation, index) => ({
    status: 'blocked',
    callId: 'review-call-' + index,
    operation,
    bindings: [],
    gapIds: ['reported-review'],
  }));
  const capabilities = createN8nNativeCapabilities();
  const plan = createReviewableWorkflowGraphPlan({
    materials,
    capabilities,
    gaps,
    proposal: {
      nativeNodes: [],
      edges: [],
      blockedCalls: [],
      additionalGaps: [],
    },
  });
  const result = compileReviewableN8nWorkflow({
    id: 'private-oas-review',
    name: 'Private OAS review',
    materials,
    capabilities,
    plan,
    apiNodes: [],
  });
  assert.equal(result.status, 'needs-review');
  assert.equal(result.workflow.active, false);
  assert.equal(result.workflow.nodes.length, (files.length + 1) * 2 + 1);
  assert.deepEqual(result.workflow.connections, {});
  assert.ok(
    result.workflow.nodes.every((item) =>
      [
        'n8n-nodes-base.stickyNote',
        'n8n-nodes-base.code',
        'n8n-nodes-base.manualTrigger',
      ].includes(item.type),
    ),
  );
  assert.ok(
    result.workflow.nodes.every((item) => item.credentials === undefined),
  );
});

test('real OAS files use independent catalog and full contract lookup without runtime policy', async () => {
  const sources = await Promise.all(
    files.map(async (file) => ({
      id: file,
      spec: JSON.parse(await readFile(join(directory, file), 'utf8')),
    })),
  );
  const catalog = await createApiCatalog(sources);
  const operations = listApiOperations(catalog);
  const contracts = await resolveApiOperations(
    catalog,
    operations.map((operation) => operation.key),
  );
  assert.equal(contracts.length, operations.length);
  for (const contract of contracts) {
    assert.ok(contract.operation.responses);
    assert.ok(files.includes(contract.key.documentId));
    const requestMediaTypes =
      contract.operation.requestBody === undefined
        ? [undefined]
        : Object.keys(contract.operation.requestBody.content);
    for (const requestMediaType of requestMediaTypes) {
      const schema = createApiArgumentsSchema({
        operation: contract,
        bindings: [],
        requestMediaType,
      });
      assert.equal(schema.safeParse({ values: {} }).success, true);
    }
  }
});

function pointerSegment(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

for (const [index, file] of files.entries()) {
  const spec = JSON.parse(await readFile(join(directory, file), 'utf8'));
  test(`real OAS ${index + 1} validates`, () => {
    const validated = validateOpenApi(spec);
    assert.ok(Object.keys(validated.paths).length > 0);
  });
  test(`real OAS ${index + 1} exposes operations`, async () => {
    const operations = await operationsFromSpec(spec);
    const expected = Object.entries(spec.paths).flatMap(([path, pathItem]) => [
      ...Object.entries(pathItem)
        .filter(([key]) => operationMethods.has(key))
        .map(([key, operation]) => ({
          operationRef: `#/paths/${pointerSegment(path)}/${key}`,
          source: 'paths',
          operationId: operation.operationId,
          method: key.toUpperCase(),
          path,
          summary: operation.summary ?? '',
          description: operation.description ?? '',
          tags: operation.tags ?? [],
        })),
      ...Object.entries(pathItem.additionalOperations ?? {}).map(
        ([method, operation]) => ({
          operationRef: `#/paths/${pointerSegment(path)}/additionalOperations/${pointerSegment(method)}`,
          source: 'paths',
          operationId: operation.operationId,
          method,
          path,
          summary: operation.summary ?? '',
          description: operation.description ?? '',
          tags: operation.tags ?? [],
        }),
      ),
    ]);
    assert.ok(expected.length > 0);
    assert.deepEqual(
      operations.toSorted((left, right) =>
        left.operationRef.localeCompare(right.operationRef),
      ),
      expected.toSorted((left, right) =>
        left.operationRef.localeCompare(right.operationRef),
      ),
    );
  });
  test(`real OAS ${index + 1} builds a Zod selection schema from its operations`, async () => {
    const operations = await operationsFromSpec(spec);
    const refs = operations.map((operation) => operation.operationRef);
    const schema = createOperationSelectionSchema(refs);
    const wireSchema = toJsonSchema(schema);
    assert.deepEqual(wireSchema.properties.operationRef.enum, refs);
    assert.deepEqual(schema.parse({ operationRef: refs[0] }), {
      operationRef: refs[0],
    });
  });
  if (file === 'honeypot-service.openapi.json') {
    test('Honeypot OAS generates a workflow from structured model selection and input', async () => {
      const operationRef = '#/paths/~1smoke~1changed/get';
      const model = {
        withStructuredOutput(schema, options) {
          assert.equal(
            options.method,
            options.name === 'select_operation'
              ? 'jsonSchema'
              : 'functionCalling',
          );
          assert.equal(
            options.strict,
            options.name === 'select_operation' ? true : undefined,
          );
          if (options.name === 'select_operation') {
            assert.ok(
              toJsonSchema(schema).properties.operationRef.enum.includes(
                operationRef,
              ),
            );
            return {
              async invoke(messages) {
                assert.ok(messages[0] instanceof SystemMessage);
                assert.ok(messages[1] instanceof HumanMessage);
                const request = JSON.parse(messages[1].content);
                assert.equal(request.scenario, 'Read changed items with max 5');
                return { operationRef };
              },
            };
          }
          assert.equal(options.name, 'plan_operation');
          assert.ok(
            toJsonSchema(schema).properties.inputs.properties.query.properties
              .max,
          );
          return {
            async invoke(messages) {
              assert.ok(messages[0] instanceof SystemMessage);
              assert.ok(messages[1] instanceof HumanMessage);
              const request = JSON.parse(messages[1].content);
              assert.equal(request.operation.operationRef, operationRef);
              return { inputs: { query: { max: 5 } } };
            },
          };
        },
      };
      const result = await generateWorkflow({
        spec,
        scenario: 'Read changed items with max 5',
        model,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        effectPolicy: { [operationRef]: 'read' },
        credentialBindings: {},
      });
      assert.equal(result.status, 'complete');
      assert.equal(result.plan.operationRef, operationRef);
      assert.deepEqual(result.plan.inputs, { 'query.max': 5 });
      assert.deepEqual(
        result.workflow.nodes.map((node) => node.type),
        ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.httpRequest'],
      );
      assert.equal(
        result.workflow.nodes[1].parameters.url,
        'https://example.test/smoke/changed?max=5',
      );
    });
    test('Honeypot multi-response operation compiles without a planned status', async () => {
      const operationRef = '#/paths/~1smoke~1changed/get';
      const result = await compileWorkflow({
        spec,
        baseUrl: 'https://example.test',
        profile: 'read-only',
        effectPolicy: { [operationRef]: 'read' },
        credentialBindings: {},
        plan: {
          version: '1',
          goal: 'Read changed items',
          operationRef,
        },
      });
      assert.equal(result.status, 'complete');
      assert.equal(Object.hasOwn(result.evidence, 'status'), false);
      assert.deepEqual(
        result.workflow.nodes.map((node) => node.type),
        ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.httpRequest'],
      );
    });
  }
}
