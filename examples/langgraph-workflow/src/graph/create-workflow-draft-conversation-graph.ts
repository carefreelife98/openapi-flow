import { StateGraph, START, END } from '@langchain/langgraph';
import { isDeepStrictEqual } from 'node:util';
import { resolveN8nNativeFeatures } from '@openapi-flow/n8n';
import { selectN8nTemplateDeployments } from '@openapi-flow/n8n';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import { draftConversationReviewSuggestionOptionsSchema } from '../schemas/workflow-draft-conversation-review-suggestion-schema.js';
import { prepareDraftConversationReviewSuggestions } from './draft-conversation/prepare-draft-conversation-review-suggestions.js';
import { draftConversationClarificationOptionsSchema } from '../schemas/workflow-draft-conversation-clarification-schema.js';
import { clarifyDraftConversationRequest } from './draft-conversation/clarify-draft-conversation-request.js';
import { askDraftConversationClarification } from './draft-conversation/ask-draft-conversation-clarification.js';
import { scopeDraftConversationClarification } from './draft-conversation/scope-draft-conversation-clarification.js';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
} from '../types/workflow-draft-conversation.js';
import {
  draftConversationStateSchema,
  draftConversationInputSchema,
} from '../schemas/workflow-draft-conversation-state-schema.js';
import { acceptDraftConversationTurn } from './draft-conversation/accept-draft-conversation-turn.js';
import { analyzeDraftConversationTurn } from './draft-conversation/analyze-draft-conversation-turn.js';
import { selectDraftConversationWork } from './draft-conversation/select-draft-conversation-work.js';
import {
  planDraftConversationApiMedia,
  selectDraftConversationApiBindingInputs,
  planDraftConversationApiBindings,
  generateDraftConversationApiArguments,
} from './draft-conversation/plan-api-call-stages.js';
import {
  selectDraftConversationApiInputTargets,
  generateDraftConversationApiInputValues,
  planDraftConversationBindingEdit,
} from './draft-conversation/plan-scoped-edit-stages.js';
import {
  planDraftConversationNativeAddition,
  selectDraftConversationNativeAdditionOwnership,
  selectDraftConversationNativeTargets,
  generateDraftConversationNativeValues,
  repairDraftConversationNativeReferences,
  planDraftConversationNativeDependencies,
} from './draft-conversation/plan-native-edit-stages.js';
import { planDraftConversationConnections } from './draft-conversation/plan-draft-conversation-connections.js';
import { askDraftConversationReview } from './draft-conversation/ask-draft-conversation-review.js';
import { askDraftConversationQuestions } from './draft-conversation/ask-draft-conversation-questions.js';
import { applyDraftConversationResponse } from './draft-conversation/apply-draft-conversation-response.js';
import { extractDraftConversationInputAnswers } from './draft-conversation/extract-draft-conversation-input-answers.js';
import { adoptDraftConversationCandidate } from './draft-conversation/adopt-draft-conversation-candidate.js';
import { compileDraftConversationExport } from './draft-conversation/compile-draft-conversation-export.js';
import { resolveDraftConversationNativeFeatures } from './draft-conversation/resolve-draft-conversation-native-features.js';
import { draftConversationWorkKindSchema } from '../schemas/workflow-draft-conversation-work-kind-schema.js';

/** Optional host composition. The OSS primitives remain independently callable. */
export function createWorkflowDraftConversationGraph(
  providedDependencies: WorkflowDraftConversationDependencies,
) {
  const { dependencies, inventory } =
    resolveDraftConversationNativeFeatures(providedDependencies);
  if (!dependencies.checkpointer)
    throw new Error(
      'Draft conversation requires an explicit host checkpointer',
    );
  if (
    !dependencies.model ||
    typeof dependencies.model.withStructuredOutput !== 'function'
  )
    throw new Error(
      'Draft conversation requires an injected structured-output model',
    );
  if (
    !dependencies.context ||
    !Array.isArray(dependencies.context.operations) ||
    !Array.isArray(dependencies.context.capabilities) ||
    !Array.isArray(dependencies.context.messages)
  )
    throw new Error(
      'Draft conversation context requires explicit operations, capabilities and messages arrays',
    );
  if (
    dependencies.reviewPolicy !== 'review' &&
    dependencies.reviewPolicy !== 'automatic'
  )
    throw new Error(
      'Draft conversation reviewPolicy must be review or automatic',
    );
  if (typeof dependencies.name !== 'string' || !dependencies.name.trim())
    throw new Error('Draft conversation name must be non-empty');
  if (dependencies.context.clarification !== undefined)
    throw new Error(
      'Draft conversation context.clarification is owned by the per-turn host state',
    );
  if (dependencies.context.planningMessageIds !== undefined)
    throw new Error(
      'Draft conversation context.planningMessageIds is owned by the per-turn host state',
    );
  if (
    dependencies.context.entrypoint !== undefined &&
    !isDeepStrictEqual(
      dependencies.context.entrypoint,
      describeN8nManualTrigger(),
    )
  )
    throw new Error(
      'Draft conversation context.entrypoint must match the actual n8n Manual Trigger compiler',
    );
  if (dependencies.clarification !== undefined)
    draftConversationClarificationOptionsSchema.parse(
      dependencies.clarification,
    );
  if (dependencies.reviewSuggestions !== undefined) {
    draftConversationReviewSuggestionOptionsSchema.parse(
      dependencies.reviewSuggestions,
    );
  }
  if (dependencies.deployments !== undefined)
    selectN8nTemplateDeployments({
      deployments: dependencies.deployments,
      availableDocumentIds: [
        ...new Set(
          dependencies.context.operations.map(
            (operation) => operation.key.documentId,
          ),
        ),
      ],
      selectedDocumentIds: [],
    });
  if (dependencies.itemMode !== undefined && dependencies.itemMode !== 'linked')
    throw new Error('Draft conversation itemMode must be linked or omitted');
  resolveN8nNativeFeatures({
    features: [],
    extensions: dependencies.context.capabilities,
  });
  for (const flag of [
    'includeExplanations',
    'allowRuntimeInputs',
    'allowRuntimeParameters',
    'planNativeDependencies',
    'planApiBindingInputs',
    'trackRequestedApiInputs',
    'selectOasEnums',
  ] as const)
    if (
      dependencies[flag] !== undefined &&
      typeof dependencies[flag] !== 'boolean'
    )
      throw new Error(
        `Draft conversation ${flag} must be boolean when supplied`,
      );
  const reviewRoute = (state: WorkflowDraftConversationState) =>
    state.phase === 'cancelled'
      ? END
      : state.response
        ? 'applyResponse'
        : state.phase === 'selecting' || state.phase === 'candidate'
          ? 'awaitReview'
          : state.phase === 'adopting'
            ? 'adopt'
            : 'schedule';
  return new StateGraph({
    state: draftConversationStateSchema,
    input: draftConversationInputSchema,
  })
    .addNode('acceptTurn', (state) => ({
      ...acceptDraftConversationTurn(state, dependencies),
      ...(inventory === undefined
        ? {}
        : { nativeFeatures: structuredClone(inventory) }),
    }))
    .addNode('clarifyRequest', (state) =>
      clarifyDraftConversationRequest(state, dependencies),
    )
    .addNode('prepareReviewSuggestions', (state) =>
      prepareDraftConversationReviewSuggestions(state, dependencies),
    )
    .addNode('awaitClarification', (state) =>
      askDraftConversationClarification(state, dependencies),
    )
    .addNode('scopeClarification', (state) =>
      scopeDraftConversationClarification(state, dependencies),
    )
    .addNode('analyze', (state) =>
      analyzeDraftConversationTurn(state, dependencies),
    )
    .addNode('schedule', (state) =>
      selectDraftConversationWork(state, dependencies),
    )
    .addNode('native-dependencies', (state) =>
      planDraftConversationNativeDependencies(state, dependencies),
    )
    .addNode('api-media', (state) =>
      planDraftConversationApiMedia(state, dependencies),
    )
    .addNode('api-bindings', (state) =>
      planDraftConversationApiBindings(state, dependencies),
    )
    .addNode('api-binding-inputs', (state) =>
      selectDraftConversationApiBindingInputs(state, dependencies),
    )
    .addNode('api-arguments', (state) =>
      generateDraftConversationApiArguments(state, dependencies),
    )
    .addNode('api-input-targets', (state) =>
      selectDraftConversationApiInputTargets(state, dependencies),
    )
    .addNode('api-input-values', (state) =>
      generateDraftConversationApiInputValues(state, dependencies),
    )
    .addNode('api-binding-edit', (state) =>
      planDraftConversationBindingEdit(state, dependencies),
    )
    .addNode('native-addition', (state) =>
      planDraftConversationNativeAddition(state, dependencies),
    )
    .addNode('native-addition-ownership', (state) =>
      selectDraftConversationNativeAdditionOwnership(state, dependencies),
    )
    .addNode('native-targets', (state) =>
      selectDraftConversationNativeTargets(state, dependencies),
    )
    .addNode('native-values', (state) =>
      generateDraftConversationNativeValues(state, dependencies),
    )
    .addNode('api-repair', (state) =>
      planDraftConversationBindingEdit(state, dependencies),
    )
    .addNode('native-repair', (state) =>
      repairDraftConversationNativeReferences(state, dependencies),
    )
    .addNode('connections', (state) =>
      planDraftConversationConnections(state, dependencies),
    )
    .addNode('awaitReview', (state) =>
      askDraftConversationReview(state, dependencies),
    )
    .addNode('awaitQuestions', (state) =>
      askDraftConversationQuestions(state, dependencies),
    )
    .addNode('applyResponse', (state) =>
      applyDraftConversationResponse(state, dependencies),
    )
    .addNode('extractInputAnswers', (state) =>
      extractDraftConversationInputAnswers(state, dependencies),
    )
    .addNode('adopt', (state) =>
      adoptDraftConversationCandidate(state, dependencies),
    )
    .addNode('export', (state) =>
      compileDraftConversationExport(state, dependencies),
    )
    .addEdge(START, 'acceptTurn')
    .addConditionalEdges(
      'acceptTurn',
      (state) => (state.phase === 'clarifying' ? 'clarifyRequest' : 'analyze'),
      ['clarifyRequest', 'analyze'],
    )
    .addConditionalEdges(
      'clarifyRequest',
      (state) =>
        state.phase === 'clarification-questions'
          ? 'prepareReviewSuggestions'
          : 'analyze',
      ['prepareReviewSuggestions', 'analyze'],
    )
    .addConditionalEdges(
      'prepareReviewSuggestions',
      (state) => {
        if (state.phase === 'clarification-questions')
          return 'awaitClarification';
        if (state.phase === 'questions') return 'awaitQuestions';
        if (state.phase === 'selecting' || state.phase === 'candidate')
          return 'awaitReview';
        throw new Error(
          'Prepared review suggestions require an actual HITL boundary',
        );
      },
      ['awaitClarification', 'awaitQuestions', 'awaitReview'],
    )
    .addConditionalEdges(
      'awaitClarification',
      (state) =>
        state.phase === 'cancelled'
          ? END
          : state.response
            ? 'applyResponse'
            : 'awaitClarification',
      [END, 'applyResponse', 'awaitClarification'],
    )
    .addConditionalEdges(
      'analyze',
      (state) =>
        state.phase === 'scoping'
          ? 'scopeClarification'
          : state.phase === 'selecting'
            ? 'prepareReviewSuggestions'
            : 'schedule',
      ['scopeClarification', 'prepareReviewSuggestions', 'schedule'],
    )
    .addConditionalEdges(
      'scopeClarification',
      (state) =>
        state.phase === 'selecting' ? 'prepareReviewSuggestions' : 'schedule',
      ['prepareReviewSuggestions', 'schedule'],
    )
    .addConditionalEdges(
      'schedule',
      (state) =>
        state.work
          ? state.work.kind
          : state.phase === 'questions'
            ? 'prepareReviewSuggestions'
            : 'connections',
      [
        ...draftConversationWorkKindSchema.options,
        'prepareReviewSuggestions',
        'connections',
      ],
    )
    .addEdge('api-media', 'schedule')
    .addEdge('native-dependencies', 'schedule')
    .addEdge('api-bindings', 'schedule')
    .addEdge('api-binding-inputs', 'schedule')
    .addEdge('api-arguments', 'schedule')
    .addEdge('api-input-targets', 'schedule')
    .addEdge('api-input-values', 'schedule')
    .addEdge('api-binding-edit', 'schedule')
    .addEdge('native-addition', 'schedule')
    .addEdge('native-addition-ownership', 'schedule')
    .addEdge('native-targets', 'schedule')
    .addEdge('native-values', 'schedule')
    .addEdge('api-repair', 'schedule')
    .addEdge('native-repair', 'schedule')
    .addConditionalEdges(
      'connections',
      (state) =>
        state.phase === 'questions'
          ? 'prepareReviewSuggestions'
          : state.phase === 'candidate'
            ? 'prepareReviewSuggestions'
            : 'adopt',
      ['prepareReviewSuggestions', 'adopt'],
    )
    .addConditionalEdges('awaitReview', reviewRoute, [
      END,
      'applyResponse',
      'awaitReview',
      'adopt',
      'schedule',
    ])
    .addConditionalEdges(
      'awaitQuestions',
      (state) =>
        state.phase === 'cancelled'
          ? END
          : state.response
            ? state.response.action === 'reply-inputs' ||
              state.response.action === 'reply-api-input-edits'
              ? 'extractInputAnswers'
              : 'applyResponse'
            : 'awaitQuestions',
      [END, 'extractInputAnswers', 'applyResponse', 'awaitQuestions'],
    )
    .addConditionalEdges(
      'extractInputAnswers',
      (state) => (state.response ? 'applyResponse' : 'awaitQuestions'),
      ['applyResponse', 'awaitQuestions'],
    )
    .addConditionalEdges(
      'applyResponse',
      (state) =>
        state.response === undefined && state.issues?.length
          ? state.phase === 'selecting' || state.phase === 'candidate'
            ? 'awaitReview'
            : state.phase === 'clarification-questions'
              ? 'awaitClarification'
              : 'awaitQuestions'
          : state.phase === 'analyzing'
            ? 'analyze'
            : state.phase === 'clarifying'
              ? 'clarifyRequest'
              : state.phase === 'clarification-questions'
                ? 'prepareReviewSuggestions'
                : 'schedule',
      [
        'awaitReview',
        'awaitClarification',
        'awaitQuestions',
        'analyze',
        'clarifyRequest',
        'prepareReviewSuggestions',
        'schedule',
      ],
    )
    .addEdge('adopt', 'export')
    .addEdge('export', END)
    .compile({ checkpointer: dependencies.checkpointer });
}
