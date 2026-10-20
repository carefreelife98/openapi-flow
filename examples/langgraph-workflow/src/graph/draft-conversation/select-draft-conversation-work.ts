import {
  stageWorkflowDraftEdit,
  describeWorkflowDraftNativeNodeAdditionReadiness,
  describeWorkflowDraftRequirementEdit,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationWork,
  WorkflowDraftConversationWorkKind,
  WorkflowDraftConversationQuestion,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';

/** Planning order is not execution order. Only explicit validated edges define the workflow DAG. */
export function selectDraftConversationWork(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  const input = draftConversationEditInput(state, dependencies);
  if (!state.attempted || !state.bundles || !state.questions)
    throw new Error('Draft conversation planning queues are not initialized');
  if (
    dependencies.planNativeDependencies === true &&
    state.nativeDependencies === undefined
  ) {
    return {
      work: {
        kind: 'native-dependencies',
        key: `native-dependencies:${input.plan.id}`,
      },
      phase: 'planning',
    };
  }
  const stage = stageWorkflowDraftEdit(input);
  const materialQuestions: WorkflowDraftConversationQuestion[] = [];
  const workFor = (
    kind: WorkflowDraftConversationWorkKind,
    stepId?: string,
    taskId?: string,
  ): WorkflowDraftConversationWork => ({
    kind,
    key: `${kind}:${stepId === undefined ? taskId : stepId}`,
    ...(stepId === undefined ? {} : { stepId }),
    ...(taskId === undefined ? {} : { taskId }),
  });
  for (const step of input.plan.steps) {
    if (!stage.pendingResolutionStepIds.includes(step.id)) continue;
    const decision = step.decision;
    const nodeId = 'nodeId' in decision ? decision.nodeId : step.newNodeId;
    if (
      stage.content.requirements.some(
        (item) =>
          item.state !== 'confirmed' &&
          (item.scope.kind === 'workflow' ||
            (nodeId !== undefined && item.scope.nodeIds.includes(nodeId))),
      )
    )
      continue;
    const bundle = state.bundles.find((item) => item.stepId === step.id);
    let kind: WorkflowDraftConversationWorkKind | undefined;
    if (
      decision.kind === 'add-api-call' ||
      decision.kind === 'replace-api-operation'
    )
      kind = !bundle?.mediaSelected
        ? 'api-media'
        : dependencies.planApiBindingInputs === true &&
            bundle.inputIntent === undefined
          ? 'api-binding-inputs'
          : !bundle.bindingPlan
            ? 'api-bindings'
            : 'api-arguments';
    else if (decision.kind === 'revise-api-inputs')
      kind = bundle?.apiInputContract
        ? 'api-input-values'
        : 'api-input-targets';
    else if (decision.kind === 'revise-api-bindings') kind = 'api-binding-edit';
    else if (decision.kind === 'add-native-node') {
      const readiness = describeWorkflowDraftNativeNodeAdditionReadiness({
        ...input,
        stepId: step.id,
      });
      if (readiness.status === 'requires-context') {
        // Keep the original producer's question; a downstream wait is not a second missing-input question.
        if (
          readiness.pendingSourceNodeIds?.some(
            (id) =>
              input.plan.steps.some(
                (producer) =>
                  stage.pendingResolutionStepIds.includes(producer.id) &&
                  (producer.newNodeId === id ||
                    ('nodeId' in producer.decision &&
                      producer.decision.nodeId === id)),
              ) || stage.pendingRepairs.some((task) => task.nodeId === id),
          )
        )
          continue;
        materialQuestions.push({
          id: `native-materials:${step.id}`,
          kind: 'native-materials',
          stepId: step.id,
          message: `${readiness.capability}의 실제 소스 계약이 필요합니다: ${readiness.missingContext.map((entry) => `${entry.field} ${entry.minimumItems}개 이상, 현재 ${entry.availableItems}개`).join(', ')}${readiness.pendingSourceNodeIds?.length ? '; 선택한 생산자: ' + readiness.pendingSourceNodeIds.join(', ') : ''}. 소스를 추가하거나 해당 기능의 사용 계획을 수정해 주세요.`,
          nativeMaterialReadiness: readiness,
        });
        continue;
      }
      const capability = input.context.capabilities.find(
        (item) => item.name === decision.capability,
      )!;
      kind =
        dependencies.allowRuntimeParameters &&
        capability.supportsRuntimeParameters &&
        !bundle?.nativeAdditionOwnership
          ? 'native-addition-ownership'
          : 'native-addition';
    } else if (decision.kind === 'revise-native-node')
      kind = bundle?.nativeContract ? 'native-values' : 'native-targets';
    if (!kind) continue;
    const work = workFor(kind, step.id);
    if (!state.attempted.includes(work.key)) return { work, phase: 'planning' };
  }
  for (const task of stage.pendingRepairs) {
    if (stage.blockedSourceNodeIds.includes(task.nodeId)) continue;
    const work = workFor(
      task.kind === 'api-bindings' ? 'api-repair' : 'native-repair',
      undefined,
      task.id,
    );
    if (!state.attempted.includes(work.key)) return { work, phase: 'planning' };
  }
  const semantic = input.plan.steps
    .filter(
      (step) =>
        (step.decision.kind === 'needs-clarification' &&
          step.decision.owner.kind === 'semantic') ||
        ((step.decision.kind === 'revise-requirement' ||
          step.decision.kind === 'restore-requirement') &&
          stage.pendingResolutionStepIds.includes(step.id)),
    )
    .map((step) => ({
      id: step.id,
      kind:
        step.decision.kind === 'revise-requirement' ||
        step.decision.kind === 'restore-requirement'
          ? ('requirement' as const)
          : ('message' as const),
      stepId: step.id,
      message: step.decision.instruction,
      ...(step.decision.kind === 'revise-requirement' ||
      step.decision.kind === 'restore-requirement'
        ? {
            requirementEdit: describeWorkflowDraftRequirementEdit({
              ...input,
              stepId: step.id,
            }),
          }
        : {}),
    }));
  const questions = [
    ...state.questions,
    ...materialQuestions.filter(
      (item) => !state.questions!.some((existing) => existing.id === item.id),
    ),
    ...semantic.filter(
      (item) => !state.questions!.some((existing) => existing.id === item.id),
    ),
  ];
  if (state.clarification) {
    const all = state.clarification.round.categories.flatMap(
      (category) => category.questions,
    );
    for (const questionId of stage.pendingClarificationQuestionIds) {
      const original = all.find((question) => question.id === questionId);
      if (!original)
        throw new Error(
          `Pending clarification ${questionId} has no original question`,
        );
      if (!questions.some((question) => question.id === original.id))
        questions.push({
          id: original.id,
          kind: 'clarification',
          message: original.message,
          clarificationQuestion: original,
        });
    }
  }
  if (
    questions.length ||
    stage.pendingResolutionStepIds.length ||
    stage.pendingRepairs.length ||
    (stage.blockedSourceNodeIds.length &&
      input.plan.steps.some((step) => step.stages.includes('connections')))
  )
    return { questions, work: undefined, phase: 'questions' };
  return { work: undefined, phase: 'connections' };
}
