import { StateGraph, START, END } from '@langchain/langgraph';
import { listApiOperations } from '@openapi-flow/core';
import { analyzeApiSelection } from '@openapi-flow/langchain';
import type { NativePlanningGraphDependencies } from '../types/native-planning.js';
import type {
  ConversationalGraphDependencies,
  ConversationState,
  ConversationUpdate,
} from '../types/workflow-conversation.js';
import { conversationStateSchema } from '../schemas/conversation-state-schema.js';
import { createApiPreparationStages } from './prepare-api-workflow.js';
import { createApiRequestMediaTypesStage } from './select-api-request-media-types-stage.js';
import { prepareReviewableApiMaterials } from './review/prepare-reviewable-api-calls.js';
import { compileReviewableWorkflowStage } from './review/compile-reviewable-workflow-stage.js';
import { askOperationChoice } from './conversation/ask-operation-choice.js';
import { askRequestInputs } from './conversation/ask-request-inputs.js';
import { applyRequestAnswers } from './conversation/apply-request-answers.js';
import { createNativeNodePlanningStage } from './plan-native-nodes-stage.js';
import { createWorkflowConnectionPlanningStage } from './plan-workflow-connections-stage.js';
import { resolveWorkflowNativeDependencies } from './native-planning/resolve-workflow-native-dependencies.js';
import { validateNativePlanningConfiguration } from './native-planning/native-planning-input.js';
import {
  createStagedNativePlanningStages,
  routeNativeConfiguration,
} from './native-planning/create-staged-native-planning-stages.js';
import { askNativeConfiguration } from './native-planning/ask-native-configuration.js';

/** Host-owned persistence and UI; old one-shot factories keep their fail-fast contract. */
export function createConversationalWorkflowGenerationGraph(
  input: ConversationalGraphDependencies,
) {
  if (!input.checkpointer)
    throw new Error(
      'Conversational graph requires an explicit host checkpointer',
    );
  const dependencies: NativePlanningGraphDependencies = {
    ...input,
    capabilities: input.capabilities ?? [],
  };
  validateNativePlanningConfiguration(dependencies);
  const stages = createApiPreparationStages(dependencies);
  async function initialize(
    state: ConversationState,
  ): Promise<ConversationUpdate> {
    if (
      state.selection ||
      state.catalog ||
      state.nativePlan ||
      state.workflow ||
      state.confirmedInputs ||
      state.selectionAnalysis ||
      state.nativeSelection !== undefined ||
      state.nativeDependencies !== undefined ||
      state.nativeConfigurations !== undefined ||
      state.nativePlanningStatus !== undefined ||
      state.nativeInputTemplate !== undefined
    )
      throw new Error(
        'Start a new conversation without generated state; resume the existing thread with Command',
      );
    return {
      ...(await stages.buildCatalog(state)),
      confirmedInputs: [],
      inputAnswerIssues: [],
      operationAnswerErrors: [],
      conversationStatus: 'working',
    };
  }
  async function select(state: ConversationState): Promise<ConversationUpdate> {
    if (!state.catalog) throw new Error('API analysis requires catalog');
    if (state.catalog.documents.length === 0)
      return {
        selectionAnalysis: {
          selection: { operations: [], gaps: [] },
          questions: [],
        },
        selection: { operations: [], gaps: [] },
        conversationStatus: 'working',
        trace: [...state.trace, 'select'],
      };
    const analysis = await analyzeApiSelection({
      operations: listApiOperations(state.catalog),
      scenario: state.scenario,
      model: input.model,
      includeExplanations: input.selectionOptions?.includeExplanations,
    });
    return {
      selectionAnalysis: analysis,
      selection: analysis.selection,
      conversationStatus: analysis.questions.length
        ? 'awaiting-input'
        : 'working',
      trace: [...state.trace, 'select'],
    };
  }
  async function resolve(
    state: ConversationState,
  ): Promise<ConversationUpdate> {
    if (!state.selection)
      throw new Error('contract resolution requires selection');
    dependencies.reviewSelection?.(state.selection);
    return stages.resolveContracts(state);
  }
  const natives = createNativeNodePlanningStage(dependencies);
  const nativeStages = createStagedNativePlanningStages(dependencies);
  async function prepare(
    state: ConversationState,
  ): Promise<ConversationUpdate> {
    if (!state.nativePlan)
      throw new Error('argument preparation requires native plan');
    const prepared = await prepareReviewableApiMaterials(
      state,
      {
        ...(dependencies.nativePlanning?.mode === 'staged'
          ? resolveWorkflowNativeDependencies(state, dependencies)
          : dependencies),
        preparedNativeNodes: state.nativePlan.nativeNodes,
      },
      'confirmed-only',
    );
    return {
      ...prepared,
      conversationStatus: prepared.requirements.length
        ? 'awaiting-input'
        : 'working',
    };
  }
  async function connect(
    state: ConversationState,
  ): Promise<ConversationUpdate> {
    if (state.requirements?.length)
      throw new Error('connection planning requires resolved request inputs');
    return createWorkflowConnectionPlanningStage(
      dependencies.nativePlanning?.mode === 'staged'
        ? resolveWorkflowNativeDependencies(state, dependencies)
        : dependencies,
    )(state);
  }
  return new StateGraph(conversationStateSchema)
    .addNode('buildCatalog', initialize)
    .addNode('analyzeOperations', select)
    .addNode('askOperationChoice', askOperationChoice)
    .addNode('resolveContracts', resolve)
    .addNode(
      'selectRequestMediaTypes',
      createApiRequestMediaTypesStage(dependencies),
    )
    .addNode('planNativeNodes', natives)
    .addNode('selectNativeInstances', nativeStages.select)
    .addNode('planNativeDependencies', nativeStages.planDependencies)
    .addNode('scheduleNativeConfiguration', (state): ConversationUpdate => {
      const result = nativeStages.schedule(state);
      return {
        ...result,
        conversationStatus:
          result.nativePlanningStatus === 'awaiting-input'
            ? 'awaiting-input'
            : 'working',
      };
    })
    .addNode('generateNativeParameters', nativeStages.generate)
    .addNode('askNativeConfiguration', askNativeConfiguration)
    .addNode('finalizeNativePlan', nativeStages.finalize)
    .addNode('cancelNativePlanning', (): ConversationUpdate => ({
      conversationStatus: 'cancelled',
    }))
    .addNode('prepareCalls', prepare)
    .addNode('askRequestInputs', askRequestInputs)
    .addNode('applyRequestAnswers', (state) =>
      applyRequestAnswers(state, dependencies),
    )
    .addNode('connectNodes', connect)
    .addNode('compileWorkflow', (state): ConversationUpdate => {
      const result = compileReviewableWorkflowStage(
        state,
        dependencies.nativePlanning?.mode === 'staged'
          ? resolveWorkflowNativeDependencies(state, dependencies)
          : dependencies,
        dependencies.nativeInputs,
      );
      return { ...result, conversationStatus: result.status };
    })
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'analyzeOperations')
    .addConditionalEdges('analyzeOperations', (state) =>
      state.selectionAnalysis?.questions.length
        ? 'askOperationChoice'
        : 'resolveContracts',
    )
    .addConditionalEdges('askOperationChoice', (state) =>
      state.conversationStatus === 'cancelled'
        ? END
        : state.selectionAnalysis?.questions.length
          ? 'askOperationChoice'
          : 'resolveContracts',
    )
    .addEdge('resolveContracts', 'selectRequestMediaTypes')
    .addConditionalEdges('selectRequestMediaTypes', () =>
      dependencies.nativePlanning?.mode === 'staged'
        ? 'selectNativeInstances'
        : 'planNativeNodes',
    )
    .addEdge('planNativeNodes', 'prepareCalls')
    .addConditionalEdges('selectNativeInstances', () =>
      dependencies.nativePlanning?.planDependencies === true
        ? 'planNativeDependencies'
        : 'scheduleNativeConfiguration',
    )
    .addEdge('planNativeDependencies', 'scheduleNativeConfiguration')
    .addConditionalEdges(
      'scheduleNativeConfiguration',
      routeNativeConfiguration,
    )
    .addEdge('generateNativeParameters', 'scheduleNativeConfiguration')
    .addConditionalEdges('askNativeConfiguration', (state) =>
      state.nativePlanningStatus === 'cancelled'
        ? 'cancelNativePlanning'
        : 'scheduleNativeConfiguration',
    )
    .addEdge('cancelNativePlanning', END)
    .addEdge('finalizeNativePlan', 'prepareCalls')
    .addConditionalEdges('prepareCalls', (state) =>
      state.requirements?.length ? 'askRequestInputs' : 'connectNodes',
    )
    .addConditionalEdges('askRequestInputs', (state) =>
      state.conversationStatus === 'cancelled'
        ? END
        : state.pendingInputResponse
          ? 'applyRequestAnswers'
          : 'askRequestInputs',
    )
    .addConditionalEdges('applyRequestAnswers', (state) =>
      state.requirements?.length ? 'askRequestInputs' : 'connectNodes',
    )
    .addEdge('connectNodes', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile({ checkpointer: input.checkpointer });
}
