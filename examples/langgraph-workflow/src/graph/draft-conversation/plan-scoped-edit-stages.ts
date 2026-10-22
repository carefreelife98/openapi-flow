import {
  selectWorkflowDraftApiInputEditTargets,
  generateWorkflowDraftApiInputEdits,
  planWorkflowDraftApiBindingEdit,
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
import { describeDraftConversationApiInputEditQuestions } from './describe-draft-conversation-api-input-edit-questions.js';

export async function selectDraftConversationApiInputTargets(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  const contract = await selectWorkflowDraftApiInputEditTargets({
    ...input,
    stepId: bundle.stepId,
    model: dependencies.model,
  });
  return {
    ...completeDraftConversationWork(state, contract),
    bundles: saveDraftConversationBundle(state, {
      ...bundle,
      apiInputContract: contract,
    }),
  };
}
export async function generateDraftConversationApiInputValues(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  if (!bundle.apiInputContract)
    throw new Error(
      'API input value work requires its validated target contract',
    );
  const result = await generateWorkflowDraftApiInputEdits({
    ...input,
    stepId: bundle.stepId,
    contract: bundle.apiInputContract,
    selectOasEnums: dependencies.selectOasEnums,
    model: dependencies.model,
  });
  if (result.status === 'needs-input')
    return completeDraftConversationWork(
      state,
      result,
      describeDraftConversationApiInputEditQuestions(bundle.stepId, result),
    );
  return {
    ...completeDraftConversationWork(state, result),
    resolutions: [...state.resolutions!, result.resolution],
  };
}
export async function planDraftConversationBindingEdit(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const input = draftConversationEditInput(state, dependencies);
  if (!state.work) throw new Error('API binding work requires an active task');
  const scope =
    state.work.kind === 'api-repair'
      ? { kind: 'repair' as const, taskId: state.work.taskId! }
      : { kind: 'step' as const, stepId: state.work.stepId! };
  const result = await planWorkflowDraftApiBindingEdit({
    ...input,
    scope,
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
        ...(state.work!.stepId === undefined
          ? {}
          : { stepId: state.work!.stepId }),
        ...(state.work!.taskId === undefined
          ? {}
          : { taskId: state.work!.taskId }),
      })),
    );
  return {
    ...completeDraftConversationWork(state, result),
    ...(result.kind === 'step'
      ? { resolutions: [...state.resolutions!, result.resolution] }
      : { repairs: [...state.repairs!, result.repair] }),
  };
}
