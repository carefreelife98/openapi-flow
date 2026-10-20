import {
  analyzeApiRequestMediaType,
  selectWorkflowDraftApiBindingInputs,
  planWorkflowDraftApiCallBindings,
  generateWorkflowDraftApiCallArguments,
} from '@openapi-flow/langchain';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import {
  draftConversationBundleInput,
  saveDraftConversationBundle,
  completeDraftConversationWork,
} from './draft-conversation-context.js';

export async function planDraftConversationApiMedia(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  const step = input.plan.steps.find((item) => item.id === bundle.stepId)!;
  if (
    step.decision.kind !== 'add-api-call' &&
    step.decision.kind !== 'replace-api-operation'
  )
    throw new Error(
      'API media work requires a selected API addition or replacement',
    );
  const key = step.decision.operation;
  const matches = input.context.operations.filter(
    (operation) =>
      operation.key.documentId === key.documentId &&
      operation.key.snapshotId === key.snapshotId &&
      operation.key.operationRef === key.operationRef,
  );
  if (matches.length !== 1)
    throw new Error(
      'API media work requires exactly one selected original OAS contract',
    );
  const decision = await analyzeApiRequestMediaType({
    operation: matches[0],
    scenario: JSON.stringify({
      instruction: step.decision.instruction,
      messages: input.context.messages,
    }),
    model: dependencies.model,
    includeExplanations: input.plan.options.includeExplanations,
  });
  const { requestMediaType } = decision;
  return {
    ...completeDraftConversationWork(state, {
      kind: 'request-media',
      decision,
      ...(requestMediaType === undefined ? {} : { requestMediaType }),
    }),
    bundles: saveDraftConversationBundle(state, {
      ...bundle,
      mediaSelected: true,
      ...(requestMediaType === undefined ? {} : { requestMediaType }),
    }),
  };
}
export async function selectDraftConversationApiBindingInputs(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  if (!bundle.mediaSelected || dependencies.planApiBindingInputs !== true)
    throw new Error(
      'API binding input selection requires an explicit option and completed media decision',
    );
  const inputIntent = await selectWorkflowDraftApiBindingInputs({
    ...input,
    stepId: bundle.stepId,
    requestMediaType: bundle.requestMediaType,
    model: dependencies.model,
  });
  return {
    ...completeDraftConversationWork(state, {
      kind: 'api-binding-intent',
      inputIntent,
    }),
    bundles: saveDraftConversationBundle(state, { ...bundle, inputIntent }),
  };
}

export async function planDraftConversationApiBindings(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  if (!bundle.mediaSelected)
    throw new Error('API bindings require a completed media decision');
  if (
    dependencies.planApiBindingInputs === true &&
    bundle.inputIntent === undefined
  )
    throw new Error(
      'API bindings require the selected request input intent when planApiBindingInputs is enabled',
    );
  const result = await planWorkflowDraftApiCallBindings({
    ...input,
    stepId: bundle.stepId,
    requestMediaType: bundle.requestMediaType,
    ...(bundle.inputIntent === undefined
      ? {}
      : { inputIntent: bundle.inputIntent }),
    model: dependencies.model,
  });
  if (result.status === 'needs-clarification')
    return {
      ...completeDraftConversationWork(
        state,
        result,
        result.questions.map((question) => ({
          id: question.id,
          kind: 'api-binding',
          message: question.message,
          stepId: bundle.stepId,
          bindingQuestion: question,
        })),
      ),
      bundles: saveDraftConversationBundle(state, {
        ...bundle,
        bindingQuestionPlan: result,
      }),
    };
  return {
    ...completeDraftConversationWork(state, result),
    bundles: saveDraftConversationBundle(state, {
      ...bundle,
      bindingPlan: result,
    }),
  };
}
export async function generateDraftConversationApiArguments(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const { input, bundle } = draftConversationBundleInput(state, dependencies);
  if (!bundle.bindingPlan || !state.apiArgumentResults)
    throw new Error(
      'API arguments require validated bindings and initialized result storage',
    );
  const result = await generateWorkflowDraftApiCallArguments({
    ...input,
    stepId: bundle.stepId,
    requestMediaType: bundle.requestMediaType,
    bindingPlan: bundle.bindingPlan,
    confirmedInputs: bundle.confirmedInputs,
    allowRuntimeInputs: dependencies.allowRuntimeInputs,
    trackRequestedInputs: dependencies.trackRequestedApiInputs,
    model: dependencies.model,
  });
  const update = completeDraftConversationWork(
    state,
    result,
    result.status === 'needs-input'
      ? result.requirements.map((requirement) => ({
          id: requirement.id,
          kind: 'api-input',
          stepId: bundle.stepId,
          message: requirement.message,
          requirement,
        }))
      : [],
  );
  return {
    ...update,
    apiArgumentResults: {
      ...state.apiArgumentResults,
      [bundle.stepId]: result,
    },
    ...(result.status === 'ready'
      ? { resolutions: [...state.resolutions!, result.resolution] }
      : {}),
  };
}
