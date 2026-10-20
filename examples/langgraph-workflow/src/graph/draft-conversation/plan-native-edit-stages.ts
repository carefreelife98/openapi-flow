import {
  generateWorkflowDraftNativeNodeAddition,
  selectWorkflowDraftNativeParameterEditTargets,
  generateWorkflowDraftNativeParameterEdits,
  planWorkflowDraftNativeReferenceRepair,
  selectWorkflowDraftNativeNodeParameterOwnership,
  planWorkflowDraftNativeDependencies,
} from '@openapi-flow/langchain';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import {
  draftConversationBundleInput,
  draftConversationEditInput,
  saveDraftConversationBundle,
  completeDraftConversationWork,
} from './draft-conversation-context.js';

export async function planDraftConversationNativeDependencies(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  if (
    dependencies.planNativeDependencies !== true ||
    state.nativeDependencies !== undefined
  )
    throw new Error(
      'Draft native dependencies require explicit policy and no prior choice',
    );
  const input = draftConversationEditInput(state, dependencies);
  const result = await planWorkflowDraftNativeDependencies({
    ...input,
    model: dependencies.model,
  });
  return {
    ...completeDraftConversationWork(state, {
      kind: 'native-dependencies',
      dependencies: result,
    }),
    nativeDependencies: result,
  };
}

export async function selectDraftConversationNativeAdditionOwnership(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  const result = await selectWorkflowDraftNativeNodeParameterOwnership({
    ...input,
    stepId: bundle.stepId,
    allowRuntimeParameters: dependencies.allowRuntimeParameters,
    model: dependencies.model,
  });
  if (result.status === 'needs-clarification')
    return completeDraftConversationWork(
      state,
      result,
      result.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
        stepId: bundle.stepId,
      })),
    );
  return {
    ...completeDraftConversationWork(state, result),
    bundles: saveDraftConversationBundle(state, {
      ...bundle,
      nativeAdditionOwnership: result.contract,
    }),
  };
}

export async function planDraftConversationNativeAddition(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  const result = await generateWorkflowDraftNativeNodeAddition({
    ...input,
    stepId: bundle.stepId,
    allowRuntimeParameters: dependencies.allowRuntimeParameters,
    ...(bundle.nativeAdditionOwnership === undefined
      ? {}
      : { parameterOwnership: bundle.nativeAdditionOwnership }),
    model: dependencies.model,
  });
  if (result.status === 'needs-clarification')
    return completeDraftConversationWork(
      state,
      result,
      result.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
        stepId: bundle.stepId,
      })),
    );
  return {
    ...completeDraftConversationWork(state, result),
    resolutions: [...state.resolutions!, result.resolution],
  };
}
export async function selectDraftConversationNativeTargets(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  const result = await selectWorkflowDraftNativeParameterEditTargets({
    ...input,
    stepId: bundle.stepId,
    allowRuntimeParameters: dependencies.allowRuntimeParameters,
    model: dependencies.model,
  });
  if (result.status === 'needs-clarification')
    return completeDraftConversationWork(
      state,
      result,
      result.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
        stepId: bundle.stepId,
      })),
    );
  if (result.status === 'runtime-parameters')
    return {
      ...completeDraftConversationWork(state, result),
      resolutions: [...state.resolutions!, result.resolution],
    };
  return {
    ...completeDraftConversationWork(state, result),
    bundles: saveDraftConversationBundle(state, {
      ...bundle,
      nativeContract: result.contract,
    }),
  };
}
export async function generateDraftConversationNativeValues(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  if (!bundle.nativeContract)
    throw new Error('Native value work requires its validated target contract');
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...input,
    stepId: bundle.stepId,
    allowRuntimeParameters: dependencies.allowRuntimeParameters,
    contract: bundle.nativeContract,
    model: dependencies.model,
  });
  if (result.status === 'needs-input')
    return completeDraftConversationWork(
      state,
      result,
      result.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
        stepId: bundle.stepId,
      })),
    );
  return {
    ...completeDraftConversationWork(state, result),
    resolutions: [...state.resolutions!, result.resolution],
  };
}
export async function repairDraftConversationNativeReferences(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const input = draftConversationEditInput(state, dependencies);
  if (!state.work?.taskId)
    throw new Error('Native repair work requires an active taskId');
  const result = await planWorkflowDraftNativeReferenceRepair({
    ...input,
    taskId: state.work.taskId,
    model: dependencies.model,
  });
  if (result.status === 'needs-clarification')
    return completeDraftConversationWork(
      state,
      result,
      result.questions.map((question) => ({
        id: question.id,
        kind: 'message',
        message: question.message,
        taskId: state.work!.taskId,
      })),
    );
  return {
    ...completeDraftConversationWork(state, result),
    repairs: [...state.repairs!, result.repair],
  };
}
