import assert from 'node:assert/strict';
import './review-feedback-consumer.js';
import { verifyConsumerApiChoices } from './api-selection-consumer.js';
import { verifyConsumerApiResponseObject } from './api-response-object-consumer.js';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  createApiCatalog,
  createApiArgumentsSchema,
  resolveApiOperations,
  selectDefaultApiRequestMediaType,
  inspectApiArgumentRequirements,
  describeApiInputSources,
  createApiInputSourceSelectionSchema,
  resolveApiInputSourceSelections,
  createApiInputAnswerExtractionRecord,
  validateApiInputAnswerExtractionRecord,
  validateOpenApi,
  createWorkflowDraft,
  describeWorkflowDraftEditContext,
  createWorkflowDraftCapabilityGap,
  inspectWorkflowDraftCapabilityGap,
  describeWorkflowDraftCapabilityGap,
  applyDraftChangeSet,
  validateWorkflowDraft,
  describeWorkflowDraftRequirementHistory,
  describeWorkflowDraftRequirementEdit,
  describeWorkflowDraftClarificationOwnership,
  createWorkflowDraftRequirementAnswerSchema,
  createWorkflowDraftEditCandidateContext,
  createWorkflowClarificationRound,
  resolveWorkflowClarificationReplies,
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
  createWorkflowDraftEditPlan,
  validateWorkflowDraftEditPlan,
  resolveWorkflowDraftNativeDependencies,
  validateWorkflowDraftNativeDependencies,
  resolveWorkflowDraftTerminalRemoval,
  assembleWorkflowDraftEdit,
  createWorkflowDraftApiInputEditContract,
  createWorkflowDraftApiInputEditAnswersSchema,
  workflowDraftApiInputEditAnswersSchema,
  resolveWorkflowDraftApiInputEdits,
  stageWorkflowDraftEdit,
  describeWorkflowDraftApiBindingEdit,
  resolveWorkflowDraftApiBindingEdit,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
  describeWorkflowDraftNativeParameterEdit,
  resolveWorkflowDraftNativeParameterEditTargets,
  resolveWorkflowDraftNativeParameterEdits,
  describeWorkflowDraftNativeReferenceRepair,
  resolveWorkflowDraftNativeReferenceRepair,
  createResponseValueSchema,
  inspectNativeReferenceStructure,
  resolveNativeMaterialSnapshot,
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeParameterOwnership,
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
  createWorkflowReviewChoiceSuggestion,
  createWorkflowReviewChoiceSuggestionSchema,
  adoptWorkflowReviewSuggestion,
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
  validateWorkflowClarificationAnswerRevision,
  createApiSelectionExplanation,
  validateApiSelectionExplanation,
  listApiRequestMediaTypes,
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
  resolveNativeInstanceSelection,
  describeNativeNodeConfiguration,
  inspectNativeNodeConfigurationReadiness,
  resolveNativeInstanceDependencies,
  validateNativeInstanceDependencies,
  resolveNativeNodeParameters,
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
  listMissingRequestedApiInputs,
  collectDeferredApiInputSlots,
} from '@openapi-flow/core';
import type {
  ApiCallArguments,
  WorkflowDraftApiBindingIntent,
  WorkflowDraftEditPlan,
  ResolveNativeMaterialSnapshotInput,
  WorkflowDraftApiResponseSource,
  WorkflowDraftClarification,
  WorkflowReviewSuggestions,
  ProposedWorkflowReviewChoiceSuggestion,
  WorkflowReviewChoiceReply,
  ReviseWorkflowClarificationAnswersInput,
  WorkflowClarificationAnswerRevisionResult,
  WorkflowDraftRequirementAnswer,
  WorkflowDraftEditResolution,
  WorkflowDraftClarificationOwnership,
  ApiSelection,
  ApiSelectionExplanation,
  ApiRequestMediaTypeDecision,
  ApiLiteralGenerationRecord,
  ApiBindingPlanningRecord,
  ApiBindingPlan,
  NativeNodePlanningRecord,
  NativeInstanceSelection,
  NativeInstanceDependencyPlan,
  WorkflowDraftNativeDependencies,
  WorkflowDraftTerminalRemovalResult,
  NativeNodeParameterResult,
  NativeNodeConfigurationReply,
  WorkflowConnectionPlanningRecord,
  WorkflowGraphPlanningRecord,
  WorkflowDraftCapabilityGap,
  WorkflowConnectionPlanningInput,
  WorkflowDraftApiInputEditAnswerSchemaInput,
  WorkflowDraftApiInputEditAnswers,
  WorkflowDraftApiInputEditResult,
} from '@openapi-flow/core';
import {
  clarifyWorkflowRequirements,
  generateApiArguments,
  analyzeWorkflowDraftEdit,
  selectWorkflowDraftApiInputEditTargets,
  generateWorkflowDraftApiInputEdits,
  planWorkflowDraftApiBindingEdit,
  planWorkflowDraftConnectionEdit,
  selectWorkflowDraftNativeParameterEditTargets,
  generateWorkflowDraftNativeParameterEdits,
  planWorkflowDraftNativeReferenceRepair,
  generateWorkflowDraftNativeNodeAddition,
  selectWorkflowDraftNativeNodeParameterOwnership,
  planWorkflowDraftApiCallBindings,
  selectWorkflowDraftApiBindingInputs,
  generateWorkflowDraftApiCallArguments,
  planWorkflowDraftClarificationScopes,
  suggestWorkflowReviewFollowUps,
  selectApiOperations,
  analyzeApiRequestMediaType,
  analyzeApiInputAnswers,
  planApiBindings,
  planNativeNodes,
  selectNativeNodeInstances,
  generateNativeNodeParameters,
  planNativeInstanceDependencies,
  planWorkflowDraftNativeDependencies,
  planWorkflowConnections,
  planWorkflowGraph,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import type {
  ClarifyWorkflowRequirementsInput,
  GenerateApiArgumentsInput,
  PlanApiBindingsInput,
  PlanNativeNodesInput,
  PlanWorkflowConnectionsInput,
  PlanWorkflowGraphInput,
  PlanReviewableWorkflowGraphInput,
  AnalyzeWorkflowDraftEditInput,
  SelectWorkflowDraftApiInputEditTargetsInput,
  GenerateWorkflowDraftApiInputEditsInput,
  PlanWorkflowDraftApiBindingEditInput,
  PlanWorkflowDraftConnectionEditInput,
  SelectWorkflowDraftNativeParameterEditTargetsInput,
  GenerateWorkflowDraftNativeParameterEditsInput,
  PlanWorkflowDraftNativeReferenceRepairInput,
  GenerateWorkflowDraftNativeNodeAdditionInput,
  SelectWorkflowDraftNativeNodeParameterOwnershipInput,
  PlanWorkflowDraftApiCallBindingsInput,
  SelectWorkflowDraftApiBindingInputsInput,
  GenerateWorkflowDraftApiCallArgumentsInput,
  PlanWorkflowDraftClarificationScopesInput,
  SuggestWorkflowReviewFollowUpsInput,
  SelectApiOperationsInput,
  AnalyzeApiRequestMediaTypeInput,
  PlanNativeInstanceDependenciesInput,
  PlanWorkflowDraftNativeDependenciesInput,
} from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  createN8nNativeCapabilities,
  compileReviewableN8nWorkflow,
  compilePlannedN8nWorkflow,
  compileN8nWorkflowTemplate,
  describeN8nManualTrigger,
  N8nNativeFeature,
  resolveN8nNativeFeatures,
  resolveN8nNativePlanningFeatures,
  createJsonOutputCapability,
  createResponseCollectionCapability,
  createN8nNativeOutputSources,
  n8nNativeInputConfigurationSchema,
  resolveN8nNativeMaterials,
} from '@openapi-flow/n8n';
import type {
  ResolveN8nNativeFeaturesInput,
  N8nNativeInputConfiguration,
  ResolveN8nNativeMaterialsInput,
  ResolvedN8nNativeMaterials,
} from '@openapi-flow/n8n';
import { packedConsumerFixtureSchema } from './packed-consumer-schema.js';

// Compile the consumer's real public adapter signature without contacting a model.
export function selectWithConsumerExplanations(
  input: SelectApiOperationsInput,
): Promise<ApiSelection> {
  return selectApiOperations({ ...input, includeExplanations: true });
}

export function assessConsumerRequestMedia(
  input: AnalyzeApiRequestMediaTypeInput,
): Promise<ApiRequestMediaTypeDecision> {
  return analyzeApiRequestMediaType({ ...input, includeExplanations: true });
}

export function reviewWithConsumerModel(
  input: SuggestWorkflowReviewFollowUpsInput,
): Promise<WorkflowReviewSuggestions> {
  return suggestWorkflowReviewFollowUps(input);
}

export function chooseConsumerNativeProducers(
  input: PlanNativeInstanceDependenciesInput,
): Promise<NativeInstanceDependencyPlan> {
  return planNativeInstanceDependencies(input);
}

export function chooseConsumerDraftNativeProducers(
  input: PlanWorkflowDraftNativeDependenciesInput,
): Promise<WorkflowDraftNativeDependencies> {
  return planWorkflowDraftNativeDependencies(input);
}

export function reviseConsumerClarificationAnswer(
  input: ReviseWorkflowClarificationAnswersInput,
): WorkflowClarificationAnswerRevisionResult {
  return reviseWorkflowClarificationAnswers(input);
}

export function planWithConsumerModel(input: GenerateApiArgumentsInput) {
  return generateApiArguments({ ...input, includeExplanations: true });
}

export function bindWithConsumerExplanations(
  input: PlanApiBindingsInput,
): Promise<ApiBindingPlan> {
  return planApiBindings({ ...input, includeExplanations: true });
}

export function selectNativeWithConsumerExplanations(
  input: PlanNativeNodesInput,
) {
  return planNativeNodes({ ...input, includeExplanations: true });
}

export function connectWithConsumerExplanations(
  input: PlanWorkflowConnectionsInput,
) {
  return planWorkflowConnections({ ...input, includeExplanations: true });
}

export function planGraphWithConsumerExplanations(
  input: PlanWorkflowGraphInput,
) {
  return planWorkflowGraph({ ...input, includeExplanations: true });
}

export function planReviewableGraphWithConsumerExplanations(
  input: PlanReviewableWorkflowGraphInput,
) {
  return planReviewableWorkflowGraph({ ...input, includeExplanations: true });
}

export function clarifyWithConsumerModel(
  input: ClarifyWorkflowRequirementsInput,
) {
  return clarifyWorkflowRequirements(input);
}

export function analyzeEditWithConsumerModel(
  input: AnalyzeWorkflowDraftEditInput,
): Promise<WorkflowDraftEditPlan> {
  return analyzeWorkflowDraftEdit(input);
}

export function selectEditInputsWithConsumerModel(
  input: SelectWorkflowDraftApiInputEditTargetsInput,
) {
  return selectWorkflowDraftApiInputEditTargets(input);
}

export function generateEditInputsWithConsumerModel(
  input: GenerateWorkflowDraftApiInputEditsInput,
) {
  return generateWorkflowDraftApiInputEdits(input);
}
export function confirmConsumerApiInputEdit(
  input: WorkflowDraftApiInputEditAnswerSchemaInput,
  confirmedAnswers: WorkflowDraftApiInputEditAnswers,
): WorkflowDraftApiInputEditResult {
  return resolveWorkflowDraftApiInputEdits({
    ...input,
    confirmedAnswers:
      createWorkflowDraftApiInputEditAnswersSchema(input).parse(
        confirmedAnswers,
      ),
  });
}
export function planBindingEditWithConsumerModel(
  input: PlanWorkflowDraftApiBindingEditInput,
) {
  return planWorkflowDraftApiBindingEdit(input);
}
export function planConnectionEditWithConsumerModel(
  input: PlanWorkflowDraftConnectionEditInput,
) {
  return planWorkflowDraftConnectionEdit(input);
}
export function selectNativeEditTargetsWithConsumerModel(
  input: SelectWorkflowDraftNativeParameterEditTargetsInput,
) {
  return selectWorkflowDraftNativeParameterEditTargets(input);
}
export function generateNativeEditWithConsumerModel(
  input: GenerateWorkflowDraftNativeParameterEditsInput,
) {
  return generateWorkflowDraftNativeParameterEdits(input);
}
export function repairNativeReferencesWithConsumerModel(
  input: PlanWorkflowDraftNativeReferenceRepairInput,
) {
  return planWorkflowDraftNativeReferenceRepair(input);
}
export function addNativeWithConsumerModel(
  input: GenerateWorkflowDraftNativeNodeAdditionInput,
) {
  return generateWorkflowDraftNativeNodeAddition(input);
}
export function selectNativeOwnershipWithConsumerModel(
  input: SelectWorkflowDraftNativeNodeParameterOwnershipInput,
) {
  return selectWorkflowDraftNativeNodeParameterOwnership(input);
}
export function planNewApiBindingsWithConsumerModel(
  input: PlanWorkflowDraftApiCallBindingsInput,
) {
  return planWorkflowDraftApiCallBindings(input);
}
export function selectBindingInputsWithConsumerModel(
  input: SelectWorkflowDraftApiBindingInputsInput,
) {
  return selectWorkflowDraftApiBindingInputs(input);
}
export function generateNewApiArgumentsWithConsumerModel(
  input: GenerateWorkflowDraftApiCallArgumentsInput,
) {
  return generateWorkflowDraftApiCallArguments({
    ...input,
    trackRequestedInputs: true,
  });
}
export function scopeClarificationWithConsumerModel(
  input: PlanWorkflowDraftClarificationScopesInput,
) {
  return planWorkflowDraftClarificationScopes(input);
}

const specPath = process.env.OPENAPI_FLOW_PACKED_CONSUMER_OAS;
const fixturePath = process.env.OPENAPI_FLOW_PACKED_CONSUMER_INPUT;
assert.ok(specPath, 'OPENAPI_FLOW_PACKED_CONSUMER_OAS is required');
assert.ok(fixturePath, 'OPENAPI_FLOW_PACKED_CONSUMER_INPUT is required');
const require = createRequire(import.meta.url);
const consumerRoot = resolve(dirname(import.meta.dirname));
const hostZodPath = await realpath(require.resolve('zod'));
for (const name of ['core', 'langchain', 'n8n']) {
  const packagePath = resolve(
    consumerRoot,
    `node_modules/@openapi-flow/${name}`,
  );
  assert.equal((await lstat(packagePath)).isSymbolicLink(), false);
  assert.ok(
    (await realpath(require.resolve(`@openapi-flow/${name}`))).startsWith(
      consumerRoot + sep,
    ),
    `${name} must resolve inside the independently installed consumer`,
  );
  const libraryRequire = createRequire(
    require.resolve(`@openapi-flow/${name}`),
  );
  assert.equal(
    await realpath(libraryRequire.resolve('zod')),
    hostZodPath,
    `${name} must share its public Zod peer with the host`,
  );
}
await import('@openapi-flow/core/runtime');
await import('@openapi-flow/core/internal');
await import('@openapi-flow/langchain/legacy');
await import('@openapi-flow/n8n/legacy');

const fixture = packedConsumerFixtureSchema.parse(
  JSON.parse(await readFile(fixturePath, 'utf8')),
);
const spec = validateOpenApi(JSON.parse(await readFile(specPath, 'utf8')));
const catalog = await createApiCatalog([{ id: 'consumer-source', spec }]);
await verifyConsumerApiChoices(catalog);
const candidate = catalog.operations.find(
  (entry) => entry.operationRef === fixture.operationRef,
);
assert.ok(candidate, 'Consumer OAS has no requested operationRef');
const selectionEvidenceContext = {
  scenario: 'Review the supplied original API discovery candidate.',
  operations: catalog.operations,
};
const selectionEvidenceBasis = {
  kind: 'candidates' as const,
  operations: [candidate.key],
};
const selectionExplanation: ApiSelectionExplanation =
  createApiSelectionExplanation({
    context: selectionEvidenceContext,
    basis: selectionEvidenceBasis,
    reason:
      'The supplied discovery candidate describes the requested API role.',
  });
validateApiSelectionExplanation({
  context: selectionEvidenceContext,
  basis: selectionEvidenceBasis,
  explanation: selectionExplanation,
});
assert.equal(selectionExplanation.evidence[0].kind, 'scenario');
const discoveryEvidence = selectionExplanation.evidence[1];
assert.equal(discoveryEvidence.kind, 'discovery');
if (discoveryEvidence.kind !== 'discovery')
  throw new Error('Expected code-owned discovery evidence');
assert.deepEqual(discoveryEvidence.candidates, [candidate]);
const [operation] = await resolveApiOperations(catalog, [candidate.key]);
const pendingAnswerRequirements = inspectApiArgumentRequirements({
  operation,
  callId: 'consumer-pending-answer',
  values: {},
  bindings: [],
  requestMediaType: selectDefaultApiRequestMediaType(operation),
}).requirements;
const answerContext = {
  reply: 'Input is not supplied yet.',
  requirements: pendingAnswerRequirements,
};
const noPendingAnswers = await analyzeApiInputAnswers({
  reply: '',
  requirements: [],
});
assert.deepEqual(noPendingAnswers.sources, []);
assert.deepEqual(noPendingAnswers.answers, []);
assert.equal(noPendingAnswers.status, 'no-pending-inputs');
const originalSourceReply = '문자열 "7"과 숫자 7';
const originalSourceCatalog = describeApiInputSources(originalSourceReply);
const originalQuotedSource = originalSourceCatalog.json.find(
  (source) => source.text === '"7"',
);
assert.ok(originalQuotedSource);
const sourceChoice = createApiInputSourceSelectionSchema(
  originalSourceCatalog,
).parse({ kind: 'json', candidateId: originalQuotedSource.id });
assert.equal(sourceChoice.kind, 'json');
assert.ok(pendingAnswerRequirements.length > 0);
const selectedOriginalSources = resolveApiInputSourceSelections({
  reply: originalSourceReply,
  requirements: pendingAnswerRequirements,
  selections: [
    { requirementId: pendingAnswerRequirements[0].id, source: sourceChoice },
  ],
});
assert.equal(selectedOriginalSources[0].sourceText, '"7"');
assert.equal(selectedOriginalSources[0].sourceFormat, 'json');
const answerRecord = createApiInputAnswerExtractionRecord({
  ...answerContext,
  decision: { reason: 'No requested input value was supplied.', answers: [] },
});
validateApiInputAnswerExtractionRecord({
  ...answerContext,
  record: answerRecord,
});
assert.deepEqual(
  answerRecord.verification.unansweredRequirementIds,
  pendingAnswerRequirements.map((item) => item.id),
);
const mediaScenario = 'Assess only the original declared request formats.';
const declaredRequestFormats = listApiRequestMediaTypes(operation);
const requestMediaDecision: ApiRequestMediaTypeDecision =
  createApiRequestMediaTypeDecision({
    operation,
    scenario: mediaScenario,
    ...(declaredRequestFormats.length > 1
      ? {
          assessment: {
            requestMediaType: null,
            explanation: { reason: 'No request format was specified.' },
          },
        }
      : {}),
  });
validateApiRequestMediaTypeDecision({
  operation,
  scenario: mediaScenario,
  decision: requestMediaDecision,
});
assert.deepEqual(
  requestMediaDecision.declaredMediaTypes,
  declaredRequestFormats,
);
const nativeFeatureInput: ResolveN8nNativeFeaturesInput = {
  features: [
    N8nNativeFeature.PassThrough,
    N8nNativeFeature.CollectApiResponses,
  ],
  apiMaterials: [{ callId: 'packed-consumer-request', operation }],
};
const registeredFeatures = resolveN8nNativeFeatures(nativeFeatureInput);
const historyContext = {
  operations: [operation],
  capabilities: registeredFeatures.capabilities,
  messages: [
    { id: 'history-initial', text: 'Initial declared purpose.' },
    { id: 'history-revised', text: 'Explicitly defer the revised purpose.' },
    { id: 'history-withdrawn', text: 'Withdraw the purpose requirement only.' },
  ],
};
const historyInitial = createWorkflowDraft({
  context: historyContext,
  content: {
    id: 'installed-requirement-history',
    apiCalls: [],
    nativeNodes: [],
    edges: [],
    requirements: [
      {
        id: 'purpose',
        text: 'Initial declared purpose',
        state: 'confirmed',
        scope: { kind: 'workflow' },
        sourceMessageIds: ['history-initial'],
      },
    ],
  },
});
const historyRevised = applyDraftChangeSet({
  draft: historyInitial,
  context: historyContext,
  changeSet: {
    baseRevision: 0,
    changes: [
      {
        kind: 'set-requirement',
        requirement: {
          ...historyInitial.requirements[0]!,
          text: 'Revised purpose',
          state: 'deferred',
          sourceMessageIds: ['history-revised'],
        },
      },
    ],
  },
}).draft;
const historyWithdrawn = applyDraftChangeSet({
  draft: historyRevised,
  context: historyContext,
  changeSet: {
    baseRevision: historyRevised.revision,
    changes: [
      {
        kind: 'remove-requirement',
        requirementId: 'purpose',
        sourceMessageIds: ['history-withdrawn'],
      },
    ],
  },
}).draft;
validateWorkflowDraft({
  draft: historyWithdrawn,
  context: { ...historyContext, planningMessageIds: ['history-withdrawn'] },
});
const historyDescription = describeWorkflowDraftRequirementHistory({
  draft: historyWithdrawn,
  context: historyContext,
});
assert.deepEqual(
  historyDescription.entries.map((entry) => entry.kind),
  ['created', 'revised', 'removed'],
);
assert.equal(historyDescription.removed[0]?.requirementId, 'purpose');
assert.deepEqual(historyWithdrawn.requirements, []);
const installedRestorationContext = {
  ...historyContext,
  messages: [
    ...historyContext.messages,
    {
      id: 'installed-restoration',
      text: 'Restore purpose only; replacement fields are provided explicitly.',
    },
  ],
};
const installedRestorationInput = {
  draft: historyWithdrawn,
  context: installedRestorationContext,
  requestMessageIds: ['installed-restoration'],
};
const installedRestorationPlan = createWorkflowDraftEditPlan({
  ...installedRestorationInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'restore-requirement',
        requirementId: 'purpose',
        instruction: 'Restore purpose only.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-restoration',
            quote: installedRestorationContext.messages.at(-1)!.text,
          },
        ],
      },
    ],
  },
});
const installedRestorationEdit = {
  ...installedRestorationInput,
  plan: installedRestorationPlan,
  resolutions: [
    {
      kind: 'requirement' as const,
      stepId: installedRestorationPlan.steps[0]!.id,
      answerMessageId: 'installed-restoration-answer',
      text: 'Explicit replacement purpose.',
      state: 'confirmed' as const,
      scope: { kind: 'workflow' as const },
    },
  ],
};
const installedRestoration = assembleWorkflowDraftEdit(
  installedRestorationEdit,
);
validateWorkflowDraft({
  draft: installedRestoration.draft,
  context: createWorkflowDraftEditCandidateContext(installedRestorationEdit),
});
assert.equal(
  installedRestoration.draft.requirementHistory.at(-1)?.kind,
  'restored',
);
assert.equal(
  installedRestoration.draft.requirements[0]?.text,
  'Explicit replacement purpose.',
);
assert.deepEqual(
  installedRestoration.draft.apiCalls,
  historyWithdrawn.apiCalls,
);
const installedScopeContext = {
  ...historyContext,
  messages: [
    ...historyContext.messages,
    {
      id: 'installed-select-scope',
      text: 'Add the original API and revise purpose to this selected role.',
    },
  ],
};
const installedRequirementSelectionInput = {
  draft: historyInitial,
  context: installedScopeContext,
  requestMessageIds: ['installed-select-scope'],
};
const installedScopePlan = createWorkflowDraftEditPlan({
  ...installedRequirementSelectionInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'add-api-call',
        operation: operation.key,
        instruction: 'Add the original selected API.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-select-scope',
            quote: installedScopeContext.messages.at(-1)!.text,
          },
        ],
      },
      {
        kind: 'revise-requirement',
        requirementId: 'purpose',
        instruction: 'Revise purpose for the selected API.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-select-scope',
            quote: installedScopeContext.messages.at(-1)!.text,
          },
        ],
      },
      {
        kind: 'needs-clarification',
        owner: {
          kind: 'planning-step',
          decisionIndex: 0,
          stage: 'api-arguments',
        },
        instruction: 'The selected original API stage owns missing values.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-select-scope',
            quote: installedScopeContext.messages.at(-1)!.text,
          },
        ],
      },
      {
        kind: 'needs-clarification',
        owner: {
          kind: 'planning-step',
          decisionIndex: 1,
          stage: 'requirements',
        },
        instruction:
          'The requirement revision owns its typed replacement answer.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-select-scope',
            quote: installedScopeContext.messages.at(-1)!.text,
          },
        ],
      },
    ],
  },
});
const installedScopeStep = installedScopePlan.steps[1];
const installedScopeNodeId = installedScopePlan.steps[0]?.newNodeId;
assert.ok(installedScopeStep);
assert.ok(installedScopeNodeId);
const installedRequirementDescription = describeWorkflowDraftRequirementEdit({
  ...installedRequirementSelectionInput,
  plan: installedScopePlan,
  stepId: installedScopeStep.id,
});
const installedRequirementAnswer: WorkflowDraftRequirementAnswer =
  createWorkflowDraftRequirementAnswerSchema(
    installedRequirementDescription,
  ).parse({
    answerMessageId: 'installed-explicit-scope',
    text: 'Purpose of the selected original API',
    state: 'confirmed',
    scope: { kind: 'nodes', nodeIds: [installedScopeNodeId] },
  });
const installedRequirementResolution: WorkflowDraftEditResolution = {
  kind: 'requirement',
  stepId: installedScopeStep.id,
  ...installedRequirementAnswer,
};
const installedPendingInput = {
  ...installedRequirementSelectionInput,
  plan: installedScopePlan,
  resolutions: [installedRequirementResolution],
};
const installedRequirementStage = stageWorkflowDraftEdit(installedPendingInput);
assert.deepEqual(installedRequirementStage.content.apiCalls, []);
assert.deepEqual(
  installedRequirementStage.content.requirements[0]?.scope,
  installedRequirementAnswer.scope,
);
assert.equal(installedRequirementStage.pendingResolutionStepIds.length, 1);
const installedOwnership: WorkflowDraftClarificationOwnership[] =
  describeWorkflowDraftClarificationOwnership(installedPendingInput);
assert.equal(installedOwnership.length, 2);
assert.deepEqual(installedRequirementStage.deferredRequirementIds, []);
assert.deepEqual(
  installedOwnership,
  installedRequirementStage.clarificationOwnership,
);
assert.ok(
  createWorkflowDraftEditCandidateContext(installedPendingInput).messages.some(
    (message) => message.id === 'installed-explicit-scope',
  ),
);
assert.throws(
  () => assembleWorkflowDraftEdit(installedPendingInput),
  /Missing draft edit resolution/,
);
const consumerPlanningFeatures = resolveN8nNativePlanningFeatures({
  features: [N8nNativeFeature.CollectApiResponses],
});
assert.equal(consumerPlanningFeatures.capabilities.length, 0);
assert.equal(
  consumerPlanningFeatures.registrations[0]?.status,
  'requires-context',
);
const consumerCollectionDefinition =
  consumerPlanningFeatures.planningCapabilities[0];
assert.ok(consumerCollectionDefinition);
assert.throws(
  () =>
    consumerCollectionDefinition.outputSchema?.({
      sourceNodeId: 'packed-consumer-request',
      pointer: '',
    }),
  /requires actual material/,
);
const consumerBoundCollection = resolveNativeMaterialSnapshot({
  apiMaterials: [{ callId: 'packed-consumer-request', operation }],
  nativeOutputs: [],
  nativeNodes: [
    {
      id: 'late-collection',
      capability: consumerCollectionDefinition.name,
      parameters: { sourceNodeId: 'packed-consumer-request', pointer: '' },
    },
  ],
  capabilities: [consumerCollectionDefinition],
  deferredNodeIds: [],
});
assert.equal(consumerBoundCollection.status, 'ready');
assert.equal(consumerBoundCollection.outputs.length, 1);
assert.deepEqual(
  registeredFeatures.capabilities.map((capability) => capability.name),
  nativeFeatureInput.features,
);
assert.ok(
  registeredFeatures.registrations.every((entry) => entry.status === 'ready'),
);
const structuralCollection = registeredFeatures.capabilities.find(
  (capability) => capability.name === N8nNativeFeature.CollectApiResponses,
);
assert.ok(structuralCollection);
const unresolvedCollection = {
  id: 'unresolved-collection',
  capability: structuralCollection.name,
  parameters: { sourceNodeId: 'removed-source', pointer: '' },
};
assert.equal(
  inspectNativeReferenceStructure({
    node: unresolvedCollection,
    capability: structuralCollection,
  })[0].reference.nodeId,
  'removed-source',
);
assert.equal(
  structuralCollection.parametersSchema.safeParse(
    unresolvedCollection.parameters,
  ).success,
  false,
);
const clarificationContext = {
  messages: [
    {
      id: 'consumer-request',
      text: '제공한 API를 사용하는 작업 흐름을 만들어줘.',
    },
  ],
  operations: [operation],
  entrypoint: describeN8nManualTrigger(),
};
const clarificationRound = createWorkflowClarificationRound({
  context: clarificationContext,
  limits: {
    maxCategories: 4,
    maxQuestionsPerCategory: 3,
    maxChoicesPerQuestion: 5,
    maxQuestionsPerRound: 6,
  },
  options: { includeExplanations: false, includeSuggestions: false },
  proposal: {
    statements: [
      {
        text: clarificationContext.messages[0].text,
        sources: [
          {
            kind: 'message',
            messageId: 'consumer-request',
            quote: clarificationContext.messages[0].text,
          },
        ],
      },
    ],
    categories: [],
  },
});
assert.equal(
  resolveWorkflowClarificationReplies({
    round: clarificationRound,
    context: clarificationContext,
    replies: [],
  }).readyForPlanning,
  true,
);
const proposal = createApiArgumentsSchema({ operation, bindings: [] }).parse(
  fixture.argumentProposal,
);
const answerRevisionRound = createWorkflowClarificationRound({
  context: clarificationContext,
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
        title: '실행 설정',
        questions: [{ message: '실행 지역은?', answer: { kind: 'text' } }],
      },
    ],
  },
});
const answerRevisionQuestion = answerRevisionRound.categories[0].questions[0];
const answerRevisionClarification = prepareWorkflowDraftClarification({
  context: clarificationContext,
  round: answerRevisionRound,
  resolution: resolveWorkflowClarificationReplies({
    context: clarificationContext,
    round: answerRevisionRound,
    replies: [
      { kind: 'text', questionId: answerRevisionQuestion.id, text: 'JP' },
    ],
  }),
});
const answerRevisionContext = {
  ...clarificationContext,
  clarification: answerRevisionClarification,
  messages: [
    ...clarificationContext.messages,
    ...answerRevisionClarification.answerMessages,
  ],
};
const consumerAnswerRevision = reviseConsumerClarificationAnswer({
  context: answerRevisionContext,
  fingerprint: describeWorkflowClarificationAnswerRevision(
    answerRevisionContext,
  ).fingerprint,
  messageId: 'consumer-answer-change',
  changes: [
    {
      kind: 'replace-answer',
      reply: {
        kind: 'text',
        questionId: answerRevisionQuestion.id,
        text: 'KR',
      },
    },
  ],
});
validateWorkflowClarificationAnswerRevision({
  context: answerRevisionContext,
  revision: consumerAnswerRevision.revision,
});
assert.equal(
  consumerAnswerRevision.revision.after.resolution.replies[0].kind,
  'text',
);
assert(
  consumerAnswerRevision.revision.after.resolution.facts[0].text.endsWith(
    '답변: KR',
  ),
);
assert(
  consumerAnswerRevision.activeMessages.every(
    (message) =>
      !consumerAnswerRevision.revision.supersededAnswerMessageIds.includes(
        message.id,
      ),
  ),
);
const args: ApiCallArguments = {
  ...proposal,
  callId: 'packed-consumer-request',
  bindings: [],
  unresolvedInputs: [],
};
const literalAuditInput = {
  callId: args.callId,
  operation,
  bindings: args.bindings,
  scenario: 'Use only the explicitly supplied original API literals.',
  purpose: 'Independent installed consumer role',
};
const literalDescription = describeApiLiteralGeneration(literalAuditInput);
const literalAudit: ApiLiteralGenerationRecord =
  createApiLiteralGenerationRecord({
    ...literalAuditInput,
    ...(literalDescription.contract.hasLiteralInputs
      ? {
          proposal,
          reason: 'The caller supplies the original typed literal proposal.',
        }
      : {}),
  });
validateApiLiteralGenerationRecord({
  ...literalAuditInput,
  record: literalAudit,
});
const auditedArgs: ApiCallArguments = {
  ...args,
  literalGeneration: literalAudit,
};
const bindingAuditInput = {
  scenario:
    'Independently inspect the original selected contract without an invented dependency.',
  materials: [
    {
      callId: args.callId,
      operation,
      purpose: 'Original selected API instance',
    },
  ],
};
const bindingAuditPlan: ApiBindingPlan = {
  calls: [{ callId: args.callId, bindings: [] }],
  gaps: [],
};
const bindingAudit: ApiBindingPlanningRecord = createApiBindingPlanningRecord({
  ...bindingAuditInput,
  plan: bindingAuditPlan,
  reasons: [{ callId: args.callId, reason: 'No dependency is requested.' }],
});
validateApiBindingPlanningRecord({
  ...bindingAuditInput,
  plan: bindingAuditPlan,
  record: bindingAudit,
});
assert.deepEqual(
  bindingAudit.evidence.context,
  describeApiBindingPlanning(bindingAuditInput).context,
);
bindingAuditPlan.bindingPlanning = bindingAudit;
const nativeAuditInput = {
  planId: 'consumer-native-audit',
  scenario: 'Use only supplied materials.',
  apiMaterials: [
    { callId: args.callId, operation, purpose: 'Original caller role' },
  ],
};
const nativeAuditPlan = createNativeNodePlan({
  ...nativeAuditInput,
  proposal: { nativeNodes: [], gaps: [] },
});
const nativeAudit: NativeNodePlanningRecord = createNativeNodePlanningRecord({
  ...nativeAuditInput,
  plan: nativeAuditPlan,
});
validateNativeNodePlanningRecord({
  ...nativeAuditInput,
  plan: nativeAuditPlan,
  record: nativeAudit,
});
assert.deepEqual(
  nativeAudit.evidence.context,
  describeNativeNodePlanning(nativeAuditInput).context,
);
const nativeNoModel = await planNativeNodes({
  ...nativeAuditInput,
  includeExplanations: true,
});
assert.deepEqual(nativeNoModel.nativePlanning, nativeAudit);
const stagedNativeInput = {
  ...nativeAuditInput,
  capabilities: [
    createJsonOutputCapability({
      name: 'installed-staged-context',
      description: 'Typed installed-consumer runtime inputs.',
      parametersSchema: z.strictObject({
        enabled: z.boolean(),
        count: z.number().int(),
      }),
    }),
  ],
  allowRuntimeParameters: true,
};
const installedNativeSelection: NativeInstanceSelection =
  resolveNativeInstanceSelection({
    ...stagedNativeInput,
    proposal: {
      instances: [
        {
          capability: 'installed-staged-context',
          purpose: 'installed actual context',
          parameterSource: 'workflow-fields',
          pointers: ['/count'],
        },
      ],
      gaps: [],
    },
  });
const stagedNativeConfiguration = {
  ...stagedNativeInput,
  selection: installedNativeSelection,
  nodeId: installedNativeSelection.instances[0].id,
};
const installedNativeDependencies: NativeInstanceDependencyPlan =
  resolveNativeInstanceDependencies({
    ...stagedNativeConfiguration,
    proposal: {
      sourcesByNodeId: {
        [stagedNativeConfiguration.nodeId]: { sourceNodeIds: [] },
      },
    },
  });
validateNativeInstanceDependencies({
  ...stagedNativeConfiguration,
  dependencies: installedNativeDependencies,
});
const installedDependencyDescription = describeNativeNodeConfiguration({
  ...stagedNativeConfiguration,
  dependencies: installedNativeDependencies,
});
assert.deepEqual(installedDependencyDescription.outputs, []);
assert.deepEqual(installedDependencyDescription.context.apiMaterials, []);
const installedNativeDescription = describeNativeNodeConfiguration(
  stagedNativeConfiguration,
);
assert.deepEqual(
  inspectNativeNodeConfigurationReadiness(stagedNativeConfiguration),
  {
    status: 'ready',
    nodeId: stagedNativeConfiguration.nodeId,
  },
);
const installedNativeParameters: NativeNodeParameterResult =
  resolveNativeNodeParameters({
    ...stagedNativeConfiguration,
    fingerprint: installedNativeDescription.fingerprint,
    proposal: {
      decision: { status: 'provided', parameters: { enabled: false } },
    },
  });
assert.equal(installedNativeParameters.status, 'ready');
if (installedNativeParameters.status !== 'ready')
  throw new Error('Installed native literals were not resolved');
assert.deepEqual(installedNativeParameters.node.parameters, { enabled: false });
const installedNativeQuestion = resolveNativeNodeParameters({
  ...stagedNativeConfiguration,
  fingerprint: installedNativeDescription.fingerprint,
  proposal: {
    decision: { status: 'needs-clarification', message: 'What is enabled?' },
  },
});
if (installedNativeQuestion.status !== 'needs-clarification')
  throw new Error('Installed native question was not retained');
const installedNativeReplies: NativeNodeConfigurationReply[] = [
  { question: installedNativeQuestion, text: 'enabled is false' },
];
const installedNativeAnswerInput = {
  ...stagedNativeConfiguration,
  replies: installedNativeReplies,
};
const installedNativeAnswer = resolveNativeNodeParameters({
  ...installedNativeAnswerInput,
  fingerprint: describeNativeNodeConfiguration(installedNativeAnswerInput)
    .fingerprint,
  proposal: {
    decision: { status: 'provided', parameters: { enabled: false } },
  },
});
assert.equal(installedNativeAnswer.status, 'ready');
assert.deepEqual(
  installedNativeAnswerInput.selection,
  installedNativeSelection,
);
assert.deepEqual(
  describeNativeNodeConfiguration(installedNativeAnswerInput).replies,
  installedNativeReplies,
);
const installedWholeSelection = resolveNativeInstanceSelection({
  ...stagedNativeInput,
  proposal: {
    instances: [
      {
        capability: 'installed-staged-context',
        purpose: 'fully deferred installed context',
        parameterSource: 'workflow-input',
      },
    ],
    gaps: [],
  },
});
assert.equal(
  (
    await generateNativeNodeParameters({
      ...stagedNativeInput,
      selection: installedWholeSelection,
      nodeId: installedWholeSelection.instances[0].id,
    })
  ).status,
  'ready',
);
assert.deepEqual(
  (await selectNativeNodeInstances(nativeAuditInput)).instances,
  [],
);
const connectionAuditInput = {
  scenario: 'Execute the one supplied original API independently.',
  materials: [
    {
      status: 'ready' as const,
      operation,
      arguments: args,
      purpose: 'Original caller role',
    },
  ],
};
const connectionAuditProposal = {
  edges: [],
  additionalGaps: [],
  blockedCalls: [],
};
const connectionAuditPlan = createWorkflowConnectionPlan({
  ...connectionAuditInput,
  proposal: connectionAuditProposal,
});
const connectionAudit: WorkflowConnectionPlanningRecord =
  createWorkflowConnectionPlanningRecord({
    ...connectionAuditInput,
    plan: connectionAuditPlan,
    decision: {
      ...connectionAuditProposal,
      reason: 'The supplied API has no producer dependency.',
    },
  });
validateWorkflowConnectionPlanningRecord({
  ...connectionAuditInput,
  plan: connectionAuditPlan,
  record: JSON.parse(JSON.stringify(connectionAudit)),
});
assert.deepEqual(
  connectionAudit.evidence.context,
  describeWorkflowConnectionPlanning(connectionAuditInput).context,
);
const deferredConnectionSlots = collectDeferredApiInputSlots({
  materials: [
    {
      operation,
      callId: 'installed-deferred-connection',
      values: {},
      bindings: [],
      requestMediaType: args.requestMediaType,
    },
  ],
});
assert.ok(deferredConnectionSlots.length);
const deferredConnectionInput: WorkflowConnectionPlanningInput = {
  scenario: 'Keep original API inputs as explicitly deferred slots.',
  materials: [
    {
      status: 'ready',
      operation,
      arguments: {
        callId: 'installed-deferred-connection',
        values: {},
        bindings: [],
        requestMediaType: args.requestMediaType,
        unresolvedInputs: deferredConnectionSlots.map(
          (slot) => slot.targetPointer,
        ),
      },
    },
  ],
  deferredApiInputIds: deferredConnectionSlots.map((slot) => slot.id),
};
const deferredConnectionPlan = createWorkflowConnectionPlan({
  ...deferredConnectionInput,
  proposal: connectionAuditProposal,
});
assert.deepEqual(deferredConnectionPlan.starts, [
  'installed-deferred-connection',
]);
assert.deepEqual(
  describeWorkflowConnectionPlanning(deferredConnectionInput).context
    .deferredApiInputs,
  deferredConnectionSlots,
);
assert.throws(
  () =>
    createWorkflowConnectionPlan({
      ...deferredConnectionInput,
      deferredApiInputIds: [],
      proposal: connectionAuditProposal,
    }),
  /unresolved OAS request inputs/,
);
const graphAuditInput = {
  ...connectionAuditInput,
  mode: 'executable' as const,
  capabilities: [],
  gaps: [],
};
const graphAuditProposal = {
  mode: 'executable' as const,
  additionalNativeNodes: [],
  edges: [],
  gaps: [],
};
const graphAuditPlan = createWorkflowGraphPlanningResult({
  ...graphAuditInput,
  proposal: graphAuditProposal,
});
const graphAudit: WorkflowGraphPlanningRecord =
  createWorkflowGraphPlanningRecord({
    ...graphAuditInput,
    proposal: graphAuditProposal,
    plan: graphAuditPlan,
    assessment: {
      reason: 'Execute the original independent API without new native nodes.',
      nodes: [],
      edges: [],
      blockedCalls: [],
    },
  });
validateWorkflowGraphPlanningRecord({
  ...graphAuditInput,
  plan: graphAuditPlan,
  record: JSON.parse(JSON.stringify(graphAudit)),
});
assert.deepEqual(
  graphAudit.evidence.context,
  describeWorkflowGraphPlanning(graphAuditInput).context,
);
assert.equal(graphAudit.verification.status, 'validated');
assert.equal(auditedArgs.literalGeneration?.callId, args.callId);
const names = { [args.callId]: `Request ${args.callId}` };
const request = createHttpRequestNode({
  operation,
  arguments: args,
  apiNodeNames: names,
  apiResponseContracts: { [args.callId]: operation },
  position: [300, 0],
});
const responseObjectWorkflow = verifyConsumerApiResponseObject({
  operation,
  arguments: args,
  apiNodeNames: names,
  apiResponseContracts: { [args.callId]: operation },
  position: [300, 0],
});
const response = { source: 'response', nodeId: args.callId, pointer: '' };
const result = compileReviewableN8nWorkflow({
  id: 'packed-consumer-workflow',
  name: 'Independent tarball consumer compilation check',
  materials: [{ status: 'ready', operation, arguments: args }],
  apiNodes: [request],
  capabilities: createN8nNativeCapabilities(),
  plan: {
    nativeNodes: [
      {
        id: 'validate-packed-response',
        capability: 'assert-responses',
        parameters: {
          checks: [
            {
              left: response,
              operator: 'equals',
              right: response,
              message: 'Packed response contract check',
            },
          ],
        },
      },
    ],
    starts: [args.callId],
    edges: [
      {
        from: args.callId,
        output: 'main',
        to: 'validate-packed-response',
        input: 'main',
      },
    ],
    gaps: [],
    blockedCalls: [],
  },
});
assert.equal(result.status, 'complete');
assert.ok(
  result.workflow.nodes.some(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  ),
);
assert.ok(
  result.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.code'),
);
const templateContext = {
  operations: [operation],
  capabilities: createN8nNativeCapabilities(),
  messages: [],
};
const draft = createWorkflowDraft({
  context: templateContext,
  content: {
    id: 'packed-consumer-template',
    requirements: [],
    apiCalls: [
      {
        id: args.callId,
        operation: operation.key,
        values: args.values,
        bindings: [],
      },
    ],
    nativeNodes: [],
    edges: [],
  },
});
const template = compileN8nWorkflowTemplate({
  draft,
  context: templateContext,
  name: 'Installed template compilation',
});
const newApiMessage = {
  id: 'installed-api-addition',
  text: `Add a separate API call with these explicit fixture request values: ${JSON.stringify(args.values)}. Keep the existing API unchanged.`,
};
const newApiContext = { ...templateContext, messages: [newApiMessage] };
const installedGap: WorkflowDraftCapabilityGap =
  createWorkflowDraftCapabilityGap({
    id: 'installed-explicit-gap',
    requestedBehavior:
      'A separately requested role outside this supplied contract.',
    finding: {
      kind: 'api-contract-gap',
      operation: operation.key,
      reason:
        'This is an explicit consumer judgment, not proof of a missing service.',
    },
    sourceMessageIds: [newApiMessage.id],
    context: newApiContext,
  });
assert.deepEqual(
  inspectWorkflowDraftCapabilityGap({
    gap: installedGap,
    context: newApiContext,
  }),
  { inventoryCurrent: true },
);
const installedGapDescription = describeWorkflowDraftCapabilityGap({
  gap: installedGap,
  context: newApiContext,
});
assert.equal(installedGapDescription.id, installedGap.id);
assert.equal(Object.hasOwn(installedGapDescription, 'inventory'), false);
const installedGapDraft = createWorkflowDraft({
  context: newApiContext,
  content: {
    id: 'installed-gap-template',
    requirements: [],
    apiCalls: [],
    nativeNodes: [],
    gapNodes: [installedGap],
    edges: [],
  },
});
const installedGapTemplate = compileN8nWorkflowTemplate({
  context: newApiContext,
  draft: installedGapDraft,
  name: 'Installed unresolved workflow export',
});
assert.equal(installedGapTemplate.triggerConnected, false);
assert.equal(installedGapTemplate.workflow.connections.Start, undefined);
assert.ok(
  installedGapTemplate.nodeMappings.some(
    (node) =>
      node.kind === 'capability-gap' &&
      node.nodeId === installedGap.id &&
      node.gap.finding.reason === installedGap.finding.reason,
  ),
);
assert.ok(
  installedGapTemplate.workflow.nodes.some(
    (node) =>
      node.type === 'n8n-nodes-base.stickyNote' &&
      typeof node.parameters?.content === 'string' &&
      node.parameters.content.includes(
        String.raw`판단 근거: This is an explicit consumer judgment, not proof of a missing service\.`,
      ),
  ),
);
const newApiBase = {
  draft,
  context: newApiContext,
  requestMessageIds: [newApiMessage.id],
};
const newApiPlan = createWorkflowDraftEditPlan({
  ...newApiBase,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'add-api-call',
        operation: operation.key,
        instruction: newApiMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: newApiMessage.id,
            quote: newApiMessage.text,
          },
        ],
      },
    ],
  },
});
const newApiInput = {
  ...newApiBase,
  plan: newApiPlan,
  stepId: newApiPlan.steps[0].id,
  resolutions: [],
};
const installedDraftRound = createWorkflowClarificationRound({
  context: newApiContext,
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
        text: newApiMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: newApiMessage.id,
            quote: newApiMessage.text,
          },
        ],
      },
    ],
    categories: [],
  },
});
const installedDraftResolution = resolveWorkflowClarificationReplies({
  context: newApiContext,
  round: installedDraftRound,
  replies: [],
});
const installedDraftClarification: WorkflowDraftClarification =
  prepareWorkflowDraftClarification({
    context: newApiContext,
    round: installedDraftRound,
    resolution: installedDraftResolution,
  });
const installedClarifiedContext = {
  ...newApiContext,
  clarification: installedDraftClarification,
};
const installedClarifiedBase = {
  draft,
  context: installedClarifiedContext,
  requestMessageIds: [newApiMessage.id],
};
const installedClarifiedPlan = createWorkflowDraftEditPlan({
  ...installedClarifiedBase,
  options: { includeExplanations: false },
  proposal: { decisions: newApiPlan.steps.map((step) => step.decision) },
});
const installedScopeInput = {
  ...installedClarifiedBase,
  plan: installedClarifiedPlan,
};
const installedScopeDescription =
  describeWorkflowDraftClarificationScopes(installedScopeInput);
const installedScopeResult = resolveWorkflowDraftClarificationScopes({
  ...installedScopeInput,
  fingerprint: installedScopeDescription.fingerprint,
  proposal: {
    scopes: {
      [installedScopeDescription.requirements[0].id]: {
        scope: {
          kind: 'nodes',
          nodeIds: [installedClarifiedPlan.steps[0].newNodeId!],
        },
      },
    },
  },
});
const installedClarifiedStage = stageWorkflowDraftEdit({
  ...installedScopeInput,
  clarificationScopes: installedScopeResult,
  resolutions: [],
});
assert.equal(
  installedClarifiedStage.content.requirements[0].origin?.roundId,
  installedDraftRound.id,
);
assert.deepEqual(installedScopeResult.unselectedQuestionIds, []);
const selectedResponses: WorkflowDraftApiResponseSource[] =
  stageWorkflowDraftEdit(newApiInput).apiResponseSources;
const selectedResponse = selectedResponses.find(
  (source) => source.nodeId === newApiPlan.steps[0].newNodeId,
);
assert.ok(selectedResponse);
assert.deepEqual(selectedResponse.operation.key, operation.key);
assert.equal(selectedResponse.preparation.status, 'request-pending');
assert.equal(Object.hasOwn(selectedResponse.preparation, 'request'), false);
const installedIntentDescription =
  describeWorkflowDraftApiBindingIntent(newApiInput);
const installedInputIntent: WorkflowDraftApiBindingIntent =
  resolveWorkflowDraftApiBindingIntent({
    ...newApiInput,
    fingerprint: installedIntentDescription.fingerprint,
    proposal: { targets: [], sourceMessageIds: [newApiMessage.id] },
  });
const installedScopedInput = {
  ...newApiInput,
  inputIntent: installedInputIntent,
};
const installedScopedBindings = resolveWorkflowDraftApiCallBindings({
  ...installedScopedInput,
  fingerprint:
    describeWorkflowDraftApiCallBindings(installedScopedInput).fingerprint,
  proposal: {
    decision: { status: 'provided', sourceMessageIds: [newApiMessage.id] },
  },
});
assert.equal(installedScopedBindings.status, 'ready');
assert.deepEqual(installedScopedBindings.inputIntent, installedInputIntent);
const newApiBindings = resolveWorkflowDraftApiCallBindings({
  ...newApiInput,
  fingerprint: describeWorkflowDraftApiCallPlanning(newApiInput).fingerprint,
  proposal: {
    decision: {
      status: 'provided',
      mappings: [],
      sourceMessageIds: [newApiMessage.id],
    },
  },
});
if (newApiBindings.status !== 'ready')
  throw new Error('Installed explicit API mappings must resolve');
const installedQuestionDescription =
  describeWorkflowDraftApiCallPlanning(newApiInput);
assert(installedQuestionDescription.requestInputRoots.length > 0);
for (const targetPointer of installedQuestionDescription.requestInputRoots) {
  const questionProposal = {
    decision: {
      status: 'needs-clarification' as const,
      mappings: [],
      questions: [{ kind: 'binding-intent' as const, targetPointer }],
      sourceMessageIds: [newApiMessage.id],
    },
  };
  const pending = resolveWorkflowDraftApiCallBindings({
    ...newApiInput,
    fingerprint: installedQuestionDescription.fingerprint,
    proposal: questionProposal,
  });
  if (pending.status !== 'needs-clarification')
    throw new Error('Installed typed question must remain unresolved');
  assert.deepEqual(pending.questions[0].operation, operation.key);
  const explicit = resolveWorkflowDraftApiCallBindings({
    ...newApiInput,
    fingerprint: pending.fingerprint,
    proposal: pending.proposal,
    answers: [{ kind: 'no-binding', questionId: pending.questions[0].id }],
  });
  if (explicit.status !== 'ready')
    throw new Error('Installed explicit no-binding answer must resolve');
  assert.deepEqual(explicit.bindings, []);
  describeWorkflowDraftApiCallArguments({
    ...newApiInput,
    bindingPlan: explicit,
  });
}
const newApiArgumentsInput = { ...newApiInput, bindingPlan: newApiBindings };
const newApiArguments = resolveWorkflowDraftApiCallArguments({
  ...newApiArgumentsInput,
  fingerprint:
    describeWorkflowDraftApiCallArguments(newApiArgumentsInput).fingerprint,
  proposal: {
    values: args.values,
    literalSources: [
      {
        targetPointer: '',
        messageId: newApiMessage.id,
        sourceFormat: 'json',
        sourceText: JSON.stringify(args.values),
      },
    ],
    sourceMessageIds: [newApiMessage.id],
  },
});
if (newApiArguments.status !== 'ready')
  throw new Error('Installed explicit API values must resolve');
const trackedApiArgumentsInput = {
  ...newApiArgumentsInput,
  trackRequestedInputs: true,
};
const trackedApiArguments = resolveWorkflowDraftApiCallArguments({
  ...trackedApiArgumentsInput,
  fingerprint: describeWorkflowDraftApiCallArguments(trackedApiArgumentsInput)
    .fingerprint,
  proposal: {
    ...newApiArguments.proposal,
    requestedInputs:
      describeWorkflowDraftApiCallPlanning(newApiInput).requestInputRoots,
  },
});
assert.deepEqual(
  trackedApiArguments.arguments.requestedInputs,
  describeWorkflowDraftApiCallPlanning(newApiInput).requestInputRoots,
);
assert.deepEqual(
  listMissingRequestedApiInputs({
    source: 'installed-consumer',
    rootPointer: '/body',
    value: { enabled: false },
    requestedInputs: ['/body/enabled'],
  }),
  [],
);
assert.equal(newApiArguments.literalSources.length, 1);
assert.ok(newApiArguments.literalSources[0].occurrences.length);
assert.throws(
  () =>
    resolveWorkflowDraftApiCallArguments({
      ...newApiArgumentsInput,
      fingerprint:
        describeWorkflowDraftApiCallArguments(newApiArgumentsInput).fingerprint,
      proposal: { values: args.values, sourceMessageIds: [newApiMessage.id] },
    }),
  /literalSources/,
);
const newApiDraft = assembleWorkflowDraftEdit({
  ...newApiInput,
  resolutions: [newApiArguments.resolution],
}).draft;
assert.deepEqual(
  newApiDraft.apiCalls.find((call) => call.id === args.callId),
  draft.apiCalls[0],
);
assert.deepEqual(
  newApiDraft.apiCalls.find((call) => call.id === newApiPlan.steps[0].newNodeId)
    ?.values,
  args.values,
);
assert.equal(
  compileN8nWorkflowTemplate({
    draft: newApiDraft,
    context: newApiContext,
    name: 'Installed API addition',
  }).nodeMappings.filter((mapping) => mapping.kind === 'api').length,
  2,
);
const installedPassThrough = registeredFeatures.capabilities.find(
  (capability) => capability.name === N8nNativeFeature.PassThrough,
);
assert.ok(installedPassThrough);
const additionMessage = {
  id: 'installed-native-addition',
  text: 'Add a separate pass-through node and keep all existing API inputs and routes.',
};
const additionContext = {
  operations: [operation],
  capabilities: [installedPassThrough],
  messages: [additionMessage],
};
const additionInput = {
  draft,
  context: additionContext,
  requestMessageIds: [additionMessage.id],
};
const additionPlan = createWorkflowDraftEditPlan({
  ...additionInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'add-native-node',
        capability: installedPassThrough.name,
        instruction: additionMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: additionMessage.id,
            quote: additionMessage.text,
          },
        ],
      },
    ],
  },
});
const additionStage = {
  ...additionInput,
  plan: additionPlan,
  stepId: additionPlan.steps[0].id,
  resolutions: [],
};
const installedDraftDependencies: WorkflowDraftNativeDependencies =
  resolveWorkflowDraftNativeDependencies({
    ...additionStage,
    proposal: {
      sourcesByNodeId: {
        [additionPlan.steps[0].newNodeId!]: { sourceNodeIds: [] },
      },
    },
  });
validateWorkflowDraftNativeDependencies({
  ...additionStage,
  producerDependencies: installedDraftDependencies,
});
assert.deepEqual(
  describeWorkflowDraftNativeNodeAddition({
    ...additionStage,
    producerDependencies: installedDraftDependencies,
  }).sources.values,
  [],
);
assert.equal(
  describeWorkflowDraftNativeNodeAddition(additionStage).parameterMode,
  'fixed-empty',
);
const installedAddition =
  await generateWorkflowDraftNativeNodeAddition(additionStage);
assert.equal(installedAddition.status, 'ready');
if (installedAddition.status !== 'ready')
  throw new Error(
    'Installed fixed-empty addition must resolve deterministically',
  );
const addedNative = assembleWorkflowDraftEdit({
  ...additionStage,
  resolutions: [installedAddition.resolution],
});
assert.deepEqual(addedNative.draft.apiCalls, draft.apiCalls);
assert.deepEqual(addedNative.draft.edges, draft.edges);
const terminalMessage = {
  id: 'installed-native-removal',
  text: 'Remove only the newly added pass-through node; preserve existing nodes, settings and connections.',
};
const connectedNative = applyDraftChangeSet({
  draft: addedNative.draft,
  context: additionContext,
  changeSet: {
    baseRevision: addedNative.draft.revision,
    changes: [
      {
        kind: 'add-edge',
        edge: {
          from: args.callId,
          output: 'main',
          to: additionPlan.steps[0].newNodeId!,
          input: 'main',
        },
      },
    ],
  },
}).draft;
const terminalInput = {
  ...additionInput,
  draft: connectedNative,
  context: {
    ...additionContext,
    messages: [...additionContext.messages, terminalMessage],
  },
  requestMessageIds: [terminalMessage.id],
};
const terminalPlan = createWorkflowDraftEditPlan({
  ...terminalInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'remove-node',
        nodeId: additionPlan.steps[0].newNodeId!,
        instruction: terminalMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: terminalMessage.id,
            quote: terminalMessage.text,
          },
        ],
      },
    ],
  },
});
const terminalRemoval: WorkflowDraftTerminalRemovalResult =
  resolveWorkflowDraftTerminalRemoval({
    ...terminalInput,
    plan: terminalPlan,
    resolutions: [],
  });
assert.equal(terminalRemoval.status, 'ready');
if (terminalRemoval.status !== 'ready')
  throw new Error('Installed terminal removal must be structurally ready');
assert.equal(terminalRemoval.result.connections.length, 1);
assert.deepEqual(
  stageWorkflowDraftEdit({
    ...terminalInput,
    plan: terminalPlan,
    resolutions: [],
  }).nodeRemovalConnections,
  terminalRemoval.result.connections,
);
const installedRemovalContext = describeWorkflowDraftEditContext(terminalInput);
assert.ok(
  installedRemovalContext.nodeContracts.some(
    (node) =>
      node.id === additionPlan.steps[0].newNodeId && node.inputs[0] === 'main',
  ),
);
assert.deepEqual(terminalRemoval.result.candidate.draft.edges, draft.edges);
assert.deepEqual(
  terminalRemoval.result.candidate.draft.apiCalls,
  draft.apiCalls,
);
assert.deepEqual(
  terminalRemoval.result.candidate.draft.nativeNodes,
  draft.nativeNodes,
);
assert.ok(
  compileN8nWorkflowTemplate({
    draft: addedNative.draft,
    context: additionContext,
    name: 'Installed deterministic native addition',
  }).workflow.nodes.some((node) => node.type === 'n8n-nodes-base.noOp'),
);
assert.equal(template.revision, draft.revision);
assert.equal(template.requestInputsReady, true);
assert.equal(template.triggerConnected, false);
assert.equal(template.deploymentConfigured, false);
assert.ok(
  template.workflow.nodes.some((node) => node.name === '입력 사전 검사'),
);
assert.ok(
  template.nodeMappings.some(
    (mapping) =>
      mapping.kind === 'api' &&
      mapping.operation.key.snapshotId === operation.key.snapshotId,
  ),
);
assert.match(template.guide, /워크플로우 사용 안내/);
const nativeInputProducer = createJsonOutputCapability({
  name: 'installed-runtime-request-values',
  description:
    'Explicit installed-consumer request values; API contracts still validate every bound field.',
  parametersSchema: z.strictObject({ values: z.json() }),
});
const nativeInputContext = {
  ...templateContext,
  capabilities: [nativeInputProducer],
};
const escapedPointer = (value: string) =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');
const nativeInputBindings = Object.entries(args.values).flatMap(
  ([location, value]) => {
    if (
      location === 'body' ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    )
      throw new Error(
        'Installed native-input fixture requires explicit parameter object groups',
      );
    return Object.keys(value).map((name) => ({
      kind: 'node-output' as const,
      targetPointer: `/${escapedPointer(location)}/${escapedPointer(name)}`,
      sourceNodeId: 'installed-input',
      sourcePointer: `/values/${escapedPointer(location)}/${escapedPointer(name)}`,
    }));
  },
);
const nativeInputDraft = createWorkflowDraft({
  context: nativeInputContext,
  content: {
    id: 'installed-native-input-draft',
    requirements: [],
    apiCalls: [
      {
        id: args.callId,
        operation: operation.key,
        values: {},
        bindings: nativeInputBindings,
      },
    ],
    nativeNodes: [
      {
        id: 'installed-input',
        capability: nativeInputProducer.name,
        parameters: {},
        runtimeParameters: true,
      },
    ],
    edges: [
      {
        from: 'installed-input',
        output: 'main',
        to: args.callId,
        input: 'main',
      },
    ],
  },
});
const [nativeSlot] = collectNativeRuntimeInputSlots({
  nativeNodes: nativeInputDraft.nativeNodes,
  capabilities: nativeInputContext.capabilities,
});
const nativeValues = { [nativeSlot.id]: { values: args.values } };
assert.equal(
  inspectNativeRuntimeInputs({
    nativeNodes: nativeInputDraft.nativeNodes,
    capabilities: nativeInputContext.capabilities,
    inputValues: nativeValues,
  }).status,
  'ready',
);
const nativeTemplate = compileN8nWorkflowTemplate({
  draft: nativeInputDraft,
  context: nativeInputContext,
  name: 'Installed native-input template',
  inputValues: nativeValues,
});
assert.equal(nativeTemplate.runtimeInputsReady, true);
assert.equal(nativeTemplate.inputSlots[0].kind, 'native-parameters-input');
const installedNativeInputConfiguration: N8nNativeInputConfiguration = {
  revision: 9,
  inputValues: nativeValues,
};
assert.equal(
  n8nNativeInputConfigurationSchema.parse(installedNativeInputConfiguration)
    .revision,
  9,
);
const installedNativeOutputSources = createN8nNativeOutputSources({
  nativeNodes: nativeInputDraft.nativeNodes,
  capabilities: nativeInputContext.capabilities,
  apiNodeNames: {},
  nativeInputs: installedNativeInputConfiguration,
});
const installedNativeApiMaterial = {
  operation,
  arguments: { ...args, values: {}, bindings: nativeInputBindings },
};
const installedNativeFragment = createHttpRequestNode({
  ...installedNativeApiMaterial,
  nativeOutputSources: installedNativeOutputSources,
  apiNodeNames: {},
  position: [600, 0],
});
const installedNativeCompiled = compilePlannedN8nWorkflow({
  id: 'installed-native-planned',
  name: 'Installed strict runtime inputs',
  materials: [installedNativeApiMaterial],
  apiNodes: [installedNativeFragment],
  capabilities: nativeInputContext.capabilities,
  nativeInputs: installedNativeInputConfiguration,
  plan: {
    nativeNodes: nativeInputDraft.nativeNodes,
    edges: nativeInputDraft.edges,
    starts: ['installed-input'],
    gaps: [],
  },
});
assert.equal(installedNativeCompiled.nativeInputTemplate?.revision, 9);
assert.equal(installedNativeCompiled.nativeInputTemplate?.inputsReady, true);
assert.equal(
  installedNativeCompiled.nativeInputTemplate?.inputSlots[0].id,
  nativeSlot.id,
);
const installedNativeStartOutputs =
  installedNativeCompiled.workflow.connections.Start.main[0];
assert.ok(installedNativeStartOutputs);
const installedNativeStart = installedNativeStartOutputs[0];
assert.ok(installedNativeStart);
assert.equal(installedNativeStart.node, '입력 설정');
const nativeEditMessage = {
  id: 'installed-native-edit',
  text: 'Use the explicitly supplied installed request values as literal native settings instead of runtime ownership. Keep all API bindings and connections.',
};
const nativeEditContext = {
  ...nativeInputContext,
  messages: [nativeEditMessage],
};
const nativeEditSources = [
  {
    kind: 'message' as const,
    messageId: nativeEditMessage.id,
    quote: nativeEditMessage.text,
  },
];
const nativeEditInput = {
  draft: nativeInputDraft,
  context: nativeEditContext,
  requestMessageIds: [nativeEditMessage.id],
};
const nativeEditPlan = createWorkflowDraftEditPlan({
  ...nativeEditInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'revise-native-node',
        nodeId: 'installed-input',
        instruction: nativeEditMessage.text,
        sources: nativeEditSources,
      },
    ],
  },
});
const nativeEditStage = {
  ...nativeEditInput,
  plan: nativeEditPlan,
  resolutions: [],
  stepId: nativeEditPlan.steps[0].id,
};
const nativeEditTargets = resolveWorkflowDraftNativeParameterEditTargets({
  ...nativeEditStage,
  fingerprint:
    describeWorkflowDraftNativeParameterEdit(nativeEditStage).fingerprint,
  proposal: {
    decision: {
      status: 'targets',
      targets: [{ kind: 'set', pointer: '', sources: nativeEditSources }],
    },
  },
});
assert.equal(nativeEditTargets.status, 'ready');
const nativeEdit = resolveWorkflowDraftNativeParameterEdits({
  ...nativeEditStage,
  contract: nativeEditTargets.contract,
  output: {
    values: {
      'parameter-1': {
        status: 'provided',
        value: { values: args.values },
        sources: nativeEditSources,
      },
    },
  },
});
assert.equal(nativeEdit.status, 'ready');
const nativeConfigured = assembleWorkflowDraftEdit({
  ...nativeEditStage,
  resolutions: [nativeEdit.resolution],
});
const configuredTemplate = compileN8nWorkflowTemplate({
  draft: nativeConfigured.draft,
  context: nativeEditContext,
  name: 'Installed actual native parameter edit',
});
assert.equal(configuredTemplate.inputSlots.length, 0);
assert.equal(configuredTemplate.runtimeInputsReady, true);
assert.deepEqual(nativeConfigured.draft.apiCalls, nativeInputDraft.apiCalls);
assert.deepEqual(nativeConfigured.draft.edges, nativeInputDraft.edges);
const nativeFieldMessage = {
  id: 'installed-native-field',
  text: 'Supply only the native values field at execution; retain every API binding and connection.',
};
const nativeFieldContext = {
  ...nativeEditContext,
  messages: [nativeFieldMessage],
};
const nativeFieldSources = [
  {
    kind: 'message' as const,
    messageId: nativeFieldMessage.id,
    quote: nativeFieldMessage.text,
  },
];
const nativeFieldInput = {
  draft: nativeConfigured.draft,
  context: nativeFieldContext,
  requestMessageIds: [nativeFieldMessage.id],
};
const nativeFieldPlan = createWorkflowDraftEditPlan({
  ...nativeFieldInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'revise-native-node',
        nodeId: 'installed-input',
        instruction: nativeFieldMessage.text,
        sources: nativeFieldSources,
      },
    ],
  },
});
const nativeFieldStage = {
  ...nativeFieldInput,
  plan: nativeFieldPlan,
  resolutions: [],
  stepId: nativeFieldPlan.steps[0].id,
  allowRuntimeParameters: true,
};
const nativeFieldTargets = resolveWorkflowDraftNativeParameterEditTargets({
  ...nativeFieldStage,
  fingerprint:
    describeWorkflowDraftNativeParameterEdit(nativeFieldStage).fingerprint,
  proposal: {
    decision: {
      status: 'targets',
      targets: [
        { kind: 'defer', pointer: '/values', sources: nativeFieldSources },
      ],
    },
  },
});
assert.equal(nativeFieldTargets.status, 'ready');
if (nativeFieldTargets.status !== 'ready')
  throw new Error('Installed field targets must be ready');
// No model is provided: field ownership has no value left to generate.
const nativeFieldEdit = await generateWorkflowDraftNativeParameterEdits({
  ...nativeFieldStage,
  contract: nativeFieldTargets.contract,
});
assert.equal(nativeFieldEdit.status, 'ready');
if (nativeFieldEdit.status !== 'ready')
  throw new Error('Installed explicit deferral must resolve');
const nativeFieldCandidate = assembleWorkflowDraftEdit({
  ...nativeFieldStage,
  resolutions: [nativeFieldEdit.resolution],
});
const nativeFieldTemplate = compileN8nWorkflowTemplate({
  draft: nativeFieldCandidate.draft,
  context: nativeFieldContext,
  name: 'Installed native field deferral',
});
assert.equal(nativeFieldTemplate.inputSlots.length, 1);
assert.equal(nativeFieldTemplate.inputSlots[0].targetPointer, '/values');
assert.equal(
  compileN8nWorkflowTemplate({
    draft: nativeFieldCandidate.draft,
    context: nativeFieldContext,
    name: 'Installed exact field input',
    inputValues: { [nativeFieldTemplate.inputSlots[0].id]: args.values },
  }).runtimeInputsReady,
  true,
);
assert.deepEqual(
  nativeFieldCandidate.draft.apiCalls,
  nativeInputDraft.apiCalls,
);
assert.deepEqual(nativeFieldCandidate.draft.edges, nativeInputDraft.edges);
const mixedAdditionMessage = {
  id: 'installed-mixed-addition',
  text: 'Add a separate native request-values instance and supply only its values field at execution. Keep existing nodes and routes.',
};
const mixedAdditionContext = {
  ...nativeInputContext,
  messages: [mixedAdditionMessage],
};
const mixedAdditionInput = {
  draft: nativeConfigured.draft,
  context: mixedAdditionContext,
  requestMessageIds: [mixedAdditionMessage.id],
};
const mixedAdditionPlan = createWorkflowDraftEditPlan({
  ...mixedAdditionInput,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'add-native-node',
        capability: nativeInputProducer.name,
        instruction: mixedAdditionMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: mixedAdditionMessage.id,
            quote: mixedAdditionMessage.text,
          },
        ],
      },
    ],
  },
});
const mixedAdditionStage = {
  ...mixedAdditionInput,
  plan: mixedAdditionPlan,
  resolutions: [],
  stepId: mixedAdditionPlan.steps[0].id,
  allowRuntimeParameters: true,
};
const mixedOwnership = resolveWorkflowDraftNativeNodeParameterOwnership({
  ...mixedAdditionStage,
  fingerprint:
    describeWorkflowDraftNativeNodeAddition(mixedAdditionStage).fingerprint,
  proposal: {
    decision: {
      status: 'runtime-fields',
      pointers: ['/values'],
      sourceMessageIds: [mixedAdditionMessage.id],
    },
  },
});
if (mixedOwnership.status !== 'ready')
  throw new Error('Installed mixed addition ownership must be ready');
const mixedAddition = await generateWorkflowDraftNativeNodeAddition({
  ...mixedAdditionStage,
  parameterOwnership: mixedOwnership.contract,
});
if (mixedAddition.status !== 'ready')
  throw new Error(
    'Installed fully deferred field addition must resolve without a model',
  );
assert.equal(mixedAddition.resolution.kind, 'native-mixed');
const mixedAdded = assembleWorkflowDraftEdit({
  ...mixedAdditionStage,
  resolutions: [mixedAddition.resolution],
});
const mixedTemplate = compileN8nWorkflowTemplate({
  draft: mixedAdded.draft,
  context: mixedAdditionContext,
  name: 'Installed new native field inputs',
});
assert.equal(mixedTemplate.inputSlots.length, 1);
assert.equal(mixedTemplate.inputSlots[0].targetPointer, '/values');
assert.equal(
  compileN8nWorkflowTemplate({
    draft: mixedAdded.draft,
    context: mixedAdditionContext,
    name: 'Installed supplied new native field',
    inputValues: { [mixedTemplate.inputSlots[0].id]: args.values },
  }).runtimeInputsReady,
  true,
);
assert.ok(
  nativeTemplate.workflow.nodes.some(
    (node) => node.name === 'Parameters installed-input',
  ),
);
const editContext = {
  ...templateContext,
  messages: [
    { id: 'installed-edit', text: 'Add another independent API instance.' },
  ],
};
const editPlan: WorkflowDraftEditPlan = createWorkflowDraftEditPlan({
  draft,
  context: editContext,
  requestMessageIds: ['installed-edit'],
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'add-api-call',
        operation: operation.key,
        instruction: 'Add another independent API instance.',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-edit',
            quote: 'Add another independent API instance.',
          },
        ],
      },
    ],
  },
});
validateWorkflowDraftEditPlan({
  draft,
  context: editContext,
  requestMessageIds: ['installed-edit'],
  plan: editPlan,
});
assert.equal(editPlan.status, 'ready-for-planning');
assert.notEqual(editPlan.steps[0].newNodeId, args.callId);
assert.equal(editPlan.baseRevision, draft.revision);
const editAssembly = assembleWorkflowDraftEdit({
  draft,
  context: editContext,
  requestMessageIds: ['installed-edit'],
  plan: editPlan,
  resolutions: [
    {
      stepId: editPlan.steps[0].id,
      kind: 'api-call',
      values: args.values,
      bindings: [],
    },
  ],
});
assert.equal(editAssembly.status, 'changed');
assert.equal(editAssembly.draft.apiCalls.length, 2);
assert.deepEqual(editAssembly.draft.apiCalls[0], draft.apiCalls[0]);
const parameter = operation.effective.parameters.find(
  (parameter) => parameter.required === true,
);
assert.ok(
  parameter,
  'Installed edit fixture requires an actual OAS-required parameter',
);
const parameterGroup: unknown = Reflect.get(args.values, parameter.in);
assert.ok(
  parameterGroup &&
    typeof parameterGroup === 'object' &&
    Object.hasOwn(parameterGroup, parameter.name),
);
const pointer = `/${escapedPointer(parameter.in)}/${escapedPointer(parameter.name)}`;
const deferContext = {
  ...editContext,
  messages: [
    ...editContext.messages,
    {
      id: 'installed-defer',
      text: 'Defer the required OAS parameter until execution.',
    },
  ],
};
const deferPlan = createWorkflowDraftEditPlan({
  draft,
  context: deferContext,
  requestMessageIds: ['installed-defer'],
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'revise-api-inputs',
        nodeId: args.callId,
        instruction: 'Defer the required OAS parameter',
        sources: [
          {
            kind: 'message',
            messageId: 'installed-defer',
            quote: 'Defer the required OAS parameter',
          },
        ],
      },
    ],
  },
});
const deferInput = {
  draft,
  context: deferContext,
  requestMessageIds: ['installed-defer'],
  plan: deferPlan,
  stepId: deferPlan.steps[0].id,
};
const deferContract = createWorkflowDraftApiInputEditContract({
  ...deferInput,
  proposal: {
    targets: [
      {
        kind: 'remove',
        pointer,
        sources: deferPlan.steps[0].decision.sources,
      },
    ],
  },
});
const deferResult = resolveWorkflowDraftApiInputEdits({
  ...deferInput,
  contract: deferContract,
  output: { values: {} },
});
assert.equal(deferResult.status, 'ready');
const deferredEdit = assembleWorkflowDraftEdit({
  ...deferInput,
  resolutions: [deferResult.resolution],
});
const deferredTemplate = compileN8nWorkflowTemplate({
  draft: deferredEdit.draft,
  context: deferContext,
  name: 'Installed explicit edit input slot',
});
assert.ok(
  deferredTemplate.inputSlots.some(
    (slot) =>
      slot.kind === 'api-request-input' && slot.targetPointer === pointer,
  ),
);
const typedEditMessage = {
  id: 'installed-typed-edit',
  text: 'Change this required OAS parameter. Ask for its actual typed value.',
};
const typedEditContext = {
  ...editContext,
  messages: [...editContext.messages, typedEditMessage],
};
const typedEditBase = {
  draft: deferredEdit.draft,
  context: typedEditContext,
  requestMessageIds: [typedEditMessage.id],
};
const typedEditPlan = createWorkflowDraftEditPlan({
  ...typedEditBase,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'revise-api-inputs',
        nodeId: args.callId,
        instruction: typedEditMessage.text,
        sources: [
          {
            kind: 'message',
            messageId: typedEditMessage.id,
            quote: typedEditMessage.text,
          },
        ],
      },
    ],
  },
});
const typedEditInput = {
  ...typedEditBase,
  plan: typedEditPlan,
  stepId: typedEditPlan.steps[0].id,
};
const typedEditContract = createWorkflowDraftApiInputEditContract({
  ...typedEditInput,
  proposal: {
    targets: [
      {
        kind: 'set',
        pointer,
        sources: typedEditPlan.steps[0].decision.sources,
      },
    ],
  },
});
const pendingTypedEdit = {
  ...typedEditInput,
  contract: typedEditContract,
  output: {
    values: {
      [typedEditContract.targets[0].id]: { status: 'needs-input' as const },
    },
  },
};
const typedPacket: WorkflowDraftApiInputEditAnswers =
  createWorkflowDraftApiInputEditAnswersSchema(pendingTypedEdit).parse({
    contractId: typedEditContract.id,
    answers: [
      {
        targetId: typedEditContract.targets[0].id,
        value: Reflect.get(parameterGroup, parameter.name),
      },
    ],
  });
const typedEditResult = confirmConsumerApiInputEdit(
  pendingTypedEdit,
  typedPacket,
);
assert.deepEqual(
  workflowDraftApiInputEditAnswersSchema.parse(typedPacket),
  typedPacket,
);
assert.equal(typedEditResult.status, 'ready');
assert.deepEqual(typedEditResult.values, pendingTypedEdit.output);
assert.deepEqual(typedEditResult.confirmedAnswers, typedPacket);
const typedEditCandidate = assembleWorkflowDraftEdit({
  ...typedEditInput,
  resolutions: [typedEditResult.resolution],
});
assert.deepEqual(typedEditCandidate.draft.apiCalls[0].values, args.values);

const bindingContext = {
  ...nativeInputContext,
  messages: [
    {
      id: 'installed-binding-edit',
      text: 'Replace this API literal parameter with the declared installed input node output.',
    },
  ],
};
const bindingDraft = createWorkflowDraft({
  context: bindingContext,
  content: {
    id: 'installed-binding-edit',
    requirements: [],
    apiCalls: draft.apiCalls,
    nativeNodes: [
      {
        id: 'installed-input',
        capability: nativeInputProducer.name,
        parameters: { values: args.values },
      },
    ],
    edges: [],
  },
});
const bindingSources = [
  {
    kind: 'message' as const,
    messageId: 'installed-binding-edit',
    quote: bindingContext.messages[0].text,
  },
];
const bindingPlan = createWorkflowDraftEditPlan({
  draft: bindingDraft,
  context: bindingContext,
  requestMessageIds: ['installed-binding-edit'],
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'revise-api-bindings',
        nodeId: args.callId,
        instruction: bindingContext.messages[0].text,
        sources: bindingSources,
      },
    ],
  },
});
const bindingStage = {
  draft: bindingDraft,
  context: bindingContext,
  plan: bindingPlan,
  requestMessageIds: ['installed-binding-edit'],
  resolutions: [],
  scope: { kind: 'step' as const, stepId: bindingPlan.steps[0].id },
};
assert.deepEqual(
  stageWorkflowDraftEdit(bindingStage).pendingResolutionStepIds,
  [bindingPlan.steps[0].id],
);
const bindingResult = resolveWorkflowDraftApiBindingEdit({
  ...bindingStage,
  fingerprint: describeWorkflowDraftApiBindingEdit(bindingStage).fingerprint,
  proposal: {
    decisions: [
      {
        kind: 'replace-literal-with-binding',
        targetPointer: pointer,
        sourceNodeId: 'installed-input',
        sourcePointer: `/values${pointer}`,
        sources: bindingSources,
      },
    ],
  },
});
assert.equal(bindingResult.status, 'ready');
assert.equal(bindingResult.kind, 'step');
const connectionStage = {
  ...bindingStage,
  resolutions: [bindingResult.resolution],
};
const connectionResult = resolveWorkflowDraftConnectionEdit({
  ...connectionStage,
  fingerprint: describeWorkflowDraftConnectionEdit(connectionStage).fingerprint,
  proposal: {
    decisions: [
      {
        kind: 'add',
        source: { nodeId: 'installed-input', port: 'main' },
        target: { nodeId: args.callId, port: 'main' },
        sources: bindingSources,
      },
    ],
  },
});
assert.equal(connectionResult.status, 'ready');
const bindingEdited = connectionResult.candidate;
const bindingTemplate = compileN8nWorkflowTemplate({
  draft: bindingEdited.draft,
  context: bindingContext,
  name: 'Installed explicit binding edit',
});
assert.equal(bindingTemplate.requestInputsReady, true);
assert.equal(
  bindingEdited.draft.apiCalls[0].bindings[0].sourceNodeId,
  'installed-input',
);
// Root response references retain the actual OAS contract across an explicit operation replacement.
const replacementEntry = catalog.operations.find(
  (entry) => entry.operationRef !== operation.key.operationRef,
);
assert.ok(
  replacementEntry,
  'Real consumer OAS needs a second declared operation for repair verification',
);
const [replacementOperation] = await resolveApiOperations(catalog, [
  replacementEntry.key,
]);
createResponseValueSchema(operation, '');
createResponseValueSchema(replacementOperation, '');
const referenceMessage = {
  id: 'installed-reference-repair',
  text: 'Replace the API operation and retain the IF comparison against the complete original response body. Preserve the comparison value and routes.',
};
const referenceContext = {
  operations: [operation, replacementOperation],
  capabilities: resolveN8nNativeFeatures({ features: [N8nNativeFeature.If] })
    .capabilities,
  messages: [referenceMessage],
};
const referenceDraft = createWorkflowDraft({
  context: referenceContext,
  content: {
    id: 'installed-reference-repair',
    requirements: [],
    apiCalls: [{ ...draft.apiCalls[0], id: 'source' }],
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
const referenceEvidence = [
  {
    kind: 'message' as const,
    messageId: referenceMessage.id,
    quote: referenceMessage.text,
  },
];
const referenceBase = {
  draft: referenceDraft,
  context: referenceContext,
  requestMessageIds: [referenceMessage.id],
};
const referencePlan = createWorkflowDraftEditPlan({
  ...referenceBase,
  options: { includeExplanations: false },
  proposal: {
    decisions: [
      {
        kind: 'replace-api-operation',
        nodeId: 'source',
        operation: replacementOperation.key,
        instruction: referenceMessage.text,
        sources: referenceEvidence,
      },
    ],
  },
});
const referenceStage = {
  ...referenceBase,
  plan: referencePlan,
  resolutions: [
    {
      stepId: referencePlan.steps[0].id,
      kind: 'api-call' as const,
      values: {},
      bindings: [],
    },
  ],
};
const referenceTask = stageWorkflowDraftEdit(
  referenceStage,
).pendingRepairs.find((task) => task.nodeId === 'gate');
assert.ok(referenceTask);
const referenceInput = { ...referenceStage, taskId: referenceTask.id };
const referenceDescription =
  describeWorkflowDraftNativeReferenceRepair(referenceInput);
const referenceResult = resolveWorkflowDraftNativeReferenceRepair({
  ...referenceInput,
  fingerprint: referenceDescription.fingerprint,
  proposal: {
    decisions: Object.fromEntries(
      referenceDescription.bindings.map((binding) => [
        binding.id,
        { kind: 'keep' as const, sourceMessageIds: [referenceMessage.id] },
      ]),
    ),
  },
});
assert.equal(referenceResult.status, 'ready');
assert.deepEqual(referenceResult.repair.edits, []);
const referenceEdited = assembleWorkflowDraftEdit({
  ...referenceStage,
  repairs: [referenceResult.repair],
});
assert.deepEqual(referenceEdited.draft.nativeNodes, referenceDraft.nativeNodes);
assert.deepEqual(referenceEdited.draft.edges, referenceDraft.edges);
const referenceTemplate = compileN8nWorkflowTemplate({
  draft: referenceEdited.draft,
  context: referenceContext,
  name: 'Installed actual OAS native reference repair',
});
const collectionDefinition = createResponseCollectionCapability({
  materials: [{ callId: 'source', operation }],
});
const collectionNode = {
  id: 'installed-material-collection',
  capability: collectionDefinition.name,
  parameters: { sourceNodeId: 'source', pointer: '' },
};
const currentMaterialInput: ResolveNativeMaterialSnapshotInput = {
  apiMaterials: [{ callId: 'source', operation: replacementOperation }],
  nativeOutputs: [],
  nativeNodes: [collectionNode],
  capabilities: [collectionDefinition],
  deferredNodeIds: [],
};
const currentMaterial = resolveNativeMaterialSnapshot(currentMaterialInput);
const installedMaterialInput: ResolveN8nNativeMaterialsInput = {
  apiMaterials: currentMaterialInput.apiMaterials,
  nativeOutputs: [],
  nativeNodes: [collectionNode],
  capabilities: [collectionDefinition],
};
const installedMaterial: ResolvedN8nNativeMaterials = resolveN8nNativeMaterials(
  installedMaterialInput,
);
assert.deepEqual(installedMaterial.outputs, currentMaterial.outputs);
assert.equal(typeof installedMaterial.capabilities[0].compile, 'function');
assert.equal(currentMaterial.status, 'ready');
if (currentMaterial.status !== 'ready')
  throw new Error(
    'Installed consumer requires actual resolved material contracts',
  );
assert.deepEqual(
  currentMaterial.capabilities[0].materialSources?.apiMaterials[0].operation,
  replacementOperation,
);
assert.deepEqual(
  collectionDefinition.materialSources?.apiMaterials[0].operation,
  operation,
);
const currentSource = referenceTemplate.nodeMappings.find(
  (mapping) => mapping.nodeId === 'source',
);
assert.ok(currentSource);
const compiledCollectionSources = createN8nNativeOutputSources({
  nativeNodes: [collectionNode],
  capabilities: [collectionDefinition],
  apiNodeNames: { source: currentSource.exitNodeName },
  apiResponseContracts: { source: replacementOperation },
});
assert.deepEqual(
  compiledCollectionSources.map(({ nodeId, schema }) => ({ nodeId, schema })),
  currentMaterial.outputs,
);
const installedReviewInput = {
  context: {
    operations: [operation],
    capabilities: [],
    messages: [
      {
        id: 'installed-review-intent',
        text: 'Review this original supplied API operation without executing it.',
      },
    ],
  },
  boundary: {
    key: 'installed-current-review',
    kind: 'selection-review' as const,
    revision: 0,
    questions: [],
    data: {
      documentId: operation.key.documentId,
      operationRef: operation.key.operationRef,
    },
  },
  limits: { maxSuggestions: 2 },
};
const installedReview: WorkflowReviewSuggestions =
  createWorkflowReviewSuggestions({
    ...installedReviewInput,
    proposal: {
      suggestions: [
        {
          kind: 'change-request',
          text: 'Keep this original operation and enter actual required values before execution.',
          reason: 'The current original OAS remains authoritative.',
          sources: [{ kind: 'oas', operation: operation.key, pointer: '' }],
        },
      ],
    },
  });
const installedAdoption = adoptWorkflowReviewSuggestion({
  ...installedReviewInput,
  review: installedReview,
  suggestionId: installedReview.suggestions[0].id,
  messageId: 'installed-explicit-adoption',
});
assert.equal(
  JSON.parse(installedAdoption.message.text).kind,
  'user-adopted-workflow-review-suggestion',
);
assert.equal(Object.hasOwn(installedAdoption, 'workflow'), false);
const installedChoiceInput = {
  ...installedReviewInput,
  boundary: {
    ...installedReviewInput.boundary,
    questions: [
      {
        id: 'installed-original-question',
        message: 'Choose an original option.',
        answer: {
          kind: 'single-choice' as const,
          choices: [
            { id: 'installed-original-choice', label: '  0007 unchanged  ' },
          ],
        },
      },
    ],
  },
};
const installedChoiceProposal: ProposedWorkflowReviewChoiceSuggestion = {
  kind: 'answer-choice',
  questionId: 'installed-original-question',
  choiceIds: ['installed-original-choice'],
  reason: 'This optional choice is from the supplied question.',
};
const installedChoiceSchema = createWorkflowReviewChoiceSuggestionSchema(
  installedChoiceInput.boundary.questions[0],
  true,
);
assert.deepEqual(
  installedChoiceSchema.parse(installedChoiceProposal),
  installedChoiceProposal,
);
assert.equal(
  installedChoiceSchema.safeParse({ ...installedChoiceProposal, text: 'new' })
    .success,
  false,
);
const installedChoice = createWorkflowReviewChoiceSuggestion({
  ...installedChoiceInput,
  proposal: installedChoiceProposal,
});
assert.equal(installedChoice.kind, 'answer-question');
if (installedChoice.kind !== 'answer-question')
  throw new Error('Expected the original typed choice answer');
const installedChoiceReply: WorkflowReviewChoiceReply | undefined =
  installedChoice.choiceReply;
assert.deepEqual(installedChoiceReply, {
  kind: 'single-choice',
  questionId: 'installed-original-question',
  choiceId: 'installed-original-choice',
});
assert.equal(
  installedChoice.text,
  'Choose an original option.\n선택:   0007 unchanged  ',
);
const installedChoiceReview = createWorkflowReviewSuggestions({
  ...installedChoiceInput,
  proposal: { suggestions: [installedChoice] },
});
const installedChoiceAdoption = adoptWorkflowReviewSuggestion({
  ...installedChoiceInput,
  review: installedChoiceReview,
  suggestionId: installedChoiceReview.suggestions[0].id,
  messageId: 'installed-explicit-choice-adoption',
});
assert.deepEqual(
  JSON.parse(installedChoiceAdoption.message.text).choiceReply,
  installedChoiceReply,
);
await writeFile(
  new URL('../workflow.json', import.meta.url),
  JSON.stringify(result.workflow, null, 2),
);
await writeFile(
  new URL('../api-response-object.workflow.json', import.meta.url),
  JSON.stringify(responseObjectWorkflow, null, 2),
);
console.log(
  JSON.stringify({
    installedTarballs: 3,
    workspaceSymlinks: false,
    selectionExplanations: 'passed',
    requestMediaDecisions: 'passed',
    literalGenerationRecord: 'passed',
    bindingPlanningRecord: 'passed',
    nativePlanningRecord: 'passed',
    stagedNativeConfiguration: 'passed',
    nativeConfigurationMaterialBinding: 'passed',
    explicitNativeProducerDependencies: 'passed',
    draftNativeProducerDependencies: 'passed',
    terminalNodeRemoval: 'passed',
    deterministicIncidentEdgeRemoval: 'passed',
    nativeConfigurationReplies: 'passed',
    connectionPlanningRecord: 'passed',
    explicitDeferredConnectionPlanning: 'passed',
    graphPlanningRecord: 'passed',
    operationCount: catalog.operations.length,
    workflowNodes: result.workflow.nodes.length,
    runtimeCompilation: 'passed',
    apiResponseObjectCompilation: 'passed',
    apiResponseObjectApiRoles: 3,
    apiResponseObjectWorkflowNodes: responseObjectWorkflow.nodes.length,
    templateCompilation: 'passed',
    requirementsClarification: 'passed',
    registeredNativeFeatures: 'passed',
    nativeRuntimeInputs: 'passed',
    strictNativeRuntimeCompilation: 'passed',
    draftEditPlanning: 'passed',
    draftEditAssembly: 'passed',
    draftApiInputEditing: 'passed',
    typedApiInputEditAnswers: 'passed',
    draftApiBindingEditing: 'passed',
    draftConnectionEditing: 'passed',
    draftNativeParameterEditing: 'passed',
    nativeFieldOwnership: 'passed',
    nativeAdditionFieldOwnership: 'passed',
    draftNativeReferenceRepair: 'passed',
    nativeReferenceStructure: 'passed',
    currentNativeMaterialSnapshot: 'passed',
    nativeNodeAddition: 'passed',
    selectedApiCallPlanning: 'passed',
    canonicalApiLiteralSources: 'passed',
    selectedApiResponseContracts: 'passed',
    draftClarificationScopes: 'passed',
    reviewSuggestions: 'passed',
    typedReviewChoices: 'passed',
    clarificationAnswerRevisions: 'passed',
    scopedApiBindingQuestions: 'passed',
    requestedApiInputPresence: 'passed',
    explicitCapabilityGapContracts: 'passed',
    lateNativeFeatureBinding: 'passed',
    requirementHistory: 'passed',
    requirementRestoration: 'passed',
    selectedRequirementScope: 'passed',
    clarificationOwnership: 'passed',
    modelCalls: 0,
    businessApiCalls: 0,
  }),
);
