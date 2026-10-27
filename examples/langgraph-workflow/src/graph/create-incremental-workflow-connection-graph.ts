import { StateGraph, START, END } from '@langchain/langgraph';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionGraph,
} from '../types/incremental-connections.js';
import {
  incrementalConnectionPolicySchema,
  incrementalConnectionStateSchema,
} from '../schemas/incremental-connection-state-schema.js';
import { createIncrementalConnectionStages } from './connections/create-incremental-connection-stages.js';

/** Host-owned loop. Optional native augmentation never adds per-edge human interrupts. */
export function createIncrementalWorkflowConnectionGraph(
  input: IncrementalConnectionDependencies,
): IncrementalConnectionGraph {
  const dependencies = {
    ...input,
    policy: incrementalConnectionPolicySchema.parse(input.policy),
    ...(input.nativeAugmentation === undefined
      ? {}
      : { nativeAugmentation: structuredClone(input.nativeAugmentation) }),
    ...(input.materialRecovery === undefined
      ? {}
      : {
          materialRecovery: {
            ...input.materialRecovery,
            ...(input.materialRecovery.argumentPlanning === undefined
              ? {}
              : {
                  argumentPlanning: {
                    ...input.materialRecovery.argumentPlanning,
                  },
                }),
          },
        }),
    ...(input.initialGoalReview === undefined
      ? {}
      : { initialGoalReview: { ...input.initialGoalReview } }),
    ...(input.outlinePlanning === undefined
      ? {}
      : { outlinePlanning: { ...input.outlinePlanning } }),
    ...(input.revisionPlanning === undefined
      ? {}
      : { revisionPlanning: { ...input.revisionPlanning } }),
  };
  if (
    dependencies.revisionPlanning !== undefined &&
    (typeof dependencies.revisionPlanning?.model?.withStructuredOutput !==
      'function' ||
      (dependencies.revisionPlanning.observe !== undefined &&
        typeof dependencies.revisionPlanning.observe !== 'function'))
  )
    throw new Error(
      'revisionPlanning requires an explicit model and optional observe function',
    );
  if (
    dependencies.outlinePlanning !== undefined &&
    (typeof dependencies.outlinePlanning?.model?.withStructuredOutput !==
      'function' ||
      typeof dependencies.outlinePlanning.selectBundle !== 'function' ||
      (dependencies.outlinePlanning.observe !== undefined &&
        typeof dependencies.outlinePlanning.observe !== 'function'))
  )
    throw new Error(
      'outlinePlanning requires an explicit model, selectBundle function and optional observe function',
    );
  if (
    dependencies.initialGoalReview !== undefined &&
    typeof dependencies.initialGoalReview?.model?.withStructuredOutput !==
      'function'
  )
    throw new Error(
      'initialGoalReview.model must provide withStructuredOutput',
    );
  if (
    dependencies.nativeAugmentation !== undefined &&
    !dependencies.nativeAugmentation?.parameterOwnership
  )
    throw new Error('nativeAugmentation.parameterOwnership is required');
  if (
    dependencies.materialRecovery !== undefined &&
    (!dependencies.materialRecovery ||
      typeof dependencies.materialRecovery.replan !== 'function' ||
      !Number.isSafeInteger(dependencies.materialRecovery.modelInvocations) ||
      dependencies.materialRecovery.modelInvocations < 0 ||
      (dependencies.materialRecovery.observe !== undefined &&
        typeof dependencies.materialRecovery.observe !== 'function'))
  )
    throw new Error(
      'materialRecovery requires a replan function and an optional observe function',
    );
  if (
    dependencies.materialRecovery?.argumentPlanning !== undefined &&
    (typeof dependencies.materialRecovery.argumentPlanning?.model
      ?.withStructuredOutput !== 'function' ||
      (dependencies.materialRecovery.argumentPlanning
        .selectDeferredApiInputIds !== undefined &&
        typeof dependencies.materialRecovery.argumentPlanning
          .selectDeferredApiInputIds !== 'function') ||
      (dependencies.materialRecovery.argumentPlanning.observe !== undefined &&
        typeof dependencies.materialRecovery.argumentPlanning.observe !==
          'function'))
  )
    throw new Error(
      'materialRecovery.argumentPlanning requires an explicit model and optional observe function',
    );
  // Every material request itself consumes a model call; include its deterministic zero-call stages.
  const recursionLimit = dependencies.policy.maxModelInvocations * 12 + 16;
  if (!Number.isSafeInteger(recursionLimit))
    throw new Error(
      'maxModelInvocations exceeds the safe LangGraph recursion accounting range',
    );
  const stages = createIncrementalConnectionStages(dependencies);
  return new StateGraph(incrementalConnectionStateSchema)
    .addNode('initialize', stages.initialize)
    .addNode('reserveModelCall', stages.reserve)
    .addNode('interpretGoals', stages.goals)
    .addNode('proposeBundle', stages.propose)
    .addNode('applyBundle', stages.apply)
    .addNode('publishProgress', stages.publish)
    .addNode('finalize', stages.finalize)
    .addNode('publishCompletion', stages.publish)
    .addNode('fail', stages.fail)
    .addNode('prepareNative', stages.prepareNative)
    .addNode('planNativeDependencies', stages.nativeDependencies)
    .addNode('generateNativeParameters', stages.nativeParameters)
    .addNode('applyNativeMaterial', stages.applyNative)
    .addNode('recoverGoalMaterial', stages.recoverGoals)
    .addNode('replanOriginMaterial', stages.replanMaterial)
    .addNode('applyOriginMaterial', stages.applyMaterial)
    .addNode('publishMaterialRecovery', stages.publishRecovery)
    .addNode('reviewInitialGoals', stages.reviewGoals)
    .addNode('planOutline', stages.outline)
    .addNode('publishOutline', stages.publishOutline)
    .addNode('reviseAcceptedPlan', stages.revise)
    .addNode('reviewRevisedGoals', stages.reviewRevision)
    .addNode('adoptRevision', stages.adoptRevision)
    .addNode('publishRevision', stages.publishRevision)
    .addNode('generateMaterialArguments', stages.generateMaterialArguments)
    .addNode('publishMaterialArguments', stages.publishMaterialArguments)
    .addNode('finishMaterialArguments', stages.finishMaterialArguments)
    .addEdge(START, 'initialize')
    .addConditionalEdges(
      'initialize',
      (state) => (state.session ? 'publishProgress' : 'reserveModelCall'),
      ['publishProgress', 'reserveModelCall'],
    )
    .addConditionalEdges(
      'reserveModelCall',
      (state) => {
        switch (state.nextModelStage) {
          case 'goals':
            return 'interpretGoals';
          case 'step':
            return 'proposeBundle';
          case 'native-dependencies':
            return 'planNativeDependencies';
          case 'native-parameters':
            return 'generateNativeParameters';
          case 'goal-recovery':
            return 'recoverGoalMaterial';
          case 'material-replan':
            return 'replanOriginMaterial';
          case 'goal-review':
            return 'reviewInitialGoals';
          case 'outline':
            return 'planOutline';
          case 'revision':
            return 'reviseAcceptedPlan';
          case 'revision-review':
            return 'reviewRevisedGoals';
          case 'material-api-arguments':
            return 'generateMaterialArguments';
          default:
            throw new Error(
              'Reserved model call requires an explicit nextModelStage',
            );
        }
      },
      [
        'interpretGoals',
        'proposeBundle',
        'planNativeDependencies',
        'generateNativeParameters',
        'recoverGoalMaterial',
        'replanOriginMaterial',
        'reviewInitialGoals',
        'planOutline',
        'reviseAcceptedPlan',
        'reviewRevisedGoals',
        'generateMaterialArguments',
      ],
    )
    .addConditionalEdges(
      'interpretGoals',
      (state) =>
        state.failureId
          ? 'fail'
          : state.session
            ? 'publishProgress'
            : 'reserveModelCall',
      ['fail', 'publishProgress', 'reserveModelCall'],
    )
    .addConditionalEdges(
      'reviewInitialGoals',
      (state) =>
        state.failureId
          ? 'fail'
          : state.session
            ? 'publishProgress'
            : 'reserveModelCall',
      ['fail', 'publishProgress', 'reserveModelCall'],
    )
    .addConditionalEdges(
      'proposeBundle',
      (state) => (state.failureId ? 'fail' : 'applyBundle'),
      ['fail', 'applyBundle'],
    )
    .addConditionalEdges(
      'planOutline',
      (state) =>
        state.failureId
          ? 'fail'
          : state.nextModelStage === 'outline'
            ? 'reserveModelCall'
            : 'publishOutline',
      ['fail', 'publishOutline', 'reserveModelCall'],
    )
    .addEdge('publishOutline', 'publishProgress')
    .addConditionalEdges(
      'reviseAcceptedPlan',
      (state) => (state.failureId ? 'fail' : 'publishRevision'),
      ['fail', 'publishRevision'],
    )
    .addConditionalEdges(
      'reviewRevisedGoals',
      (state) => (state.failureId ? 'fail' : 'publishRevision'),
      ['fail', 'publishRevision'],
    )
    .addEdge('adoptRevision', 'publishRevision')
    .addConditionalEdges(
      'publishRevision',
      (state) => {
        switch (state.revisionPhase) {
          case 'requested':
            return 'publishMaterialRecovery';
          case 'candidate':
            return dependencies.initialGoalReview
              ? 'reserveModelCall'
              : 'adoptRevision';
          case 'reviewed':
            return 'adoptRevision';
          case 'rejected':
            return 'reserveModelCall';
          case 'adopted':
            return 'publishProgress';
          default:
            throw new Error(
              'Revision progress requires an explicit next phase',
            );
        }
      },
      [
        'publishMaterialRecovery',
        'reserveModelCall',
        'adoptRevision',
        'publishProgress',
      ],
    )
    .addEdge('applyBundle', 'publishProgress')
    .addConditionalEdges('publishProgress', stages.route, {
      propose: 'reserveModelCall',
      finalize: 'finalize',
      stop: END,
      'prepare-native': 'prepareNative',
      'publish-revision': 'publishRevision',
    })
    .addConditionalEdges(
      'prepareNative',
      (state) => {
        if (state.status === 'planning') return 'publishProgress';
        return stages.dependencyNeedsModel(state)
          ? 'reserveModelCall'
          : 'planNativeDependencies';
      },
      ['publishProgress', 'reserveModelCall', 'planNativeDependencies'],
    )
    .addConditionalEdges(
      'planNativeDependencies',
      (state) => {
        if (state.failureId) return 'fail';
        return stages.parametersNeedModel(state)
          ? 'reserveModelCall'
          : 'generateNativeParameters';
      },
      ['fail', 'reserveModelCall', 'generateNativeParameters'],
    )
    .addConditionalEdges(
      'generateNativeParameters',
      (state) => (state.failureId ? 'fail' : 'applyNativeMaterial'),
      ['fail', 'applyNativeMaterial'],
    )
    .addEdge('applyNativeMaterial', 'publishProgress')
    .addConditionalEdges(
      'recoverGoalMaterial',
      (state) =>
        state.failureId
          ? 'fail'
          : state.session
            ? 'publishProgress'
            : state.pendingMaterialRepair
              ? 'publishMaterialRecovery'
              : 'reserveModelCall',
      [
        'fail',
        'publishProgress',
        'publishMaterialRecovery',
        'reserveModelCall',
      ],
    )
    .addConditionalEdges(
      'replanOriginMaterial',
      (state) => (state.failureId ? 'fail' : 'publishMaterialRecovery'),
      ['fail', 'publishMaterialRecovery'],
    )
    .addEdge('applyOriginMaterial', 'publishMaterialRecovery')
    .addConditionalEdges(
      'publishMaterialRecovery',
      (state) => {
        if (state.pendingMaterialArgumentWork) return 'reserveModelCall';
        if (state.recoveryPhase === 'replanned') return 'applyOriginMaterial';
        if (
          state.recoveryPhase === 'requested' ||
          state.recoveryPhase === 'applied'
        )
          return 'reserveModelCall';
        throw new Error('Material recovery requires an explicit next phase');
      },
      ['applyOriginMaterial', 'reserveModelCall'],
    )
    .addEdge('finalize', 'publishCompletion')
    .addConditionalEdges(
      'generateMaterialArguments',
      (state) => (state.failureId ? 'fail' : 'publishMaterialArguments'),
      ['fail', 'publishMaterialArguments'],
    )
    .addConditionalEdges(
      'publishMaterialArguments',
      (state) =>
        stages.materialArgumentsComplete(state)
          ? 'finishMaterialArguments'
          : 'reserveModelCall',
      ['finishMaterialArguments', 'reserveModelCall'],
    )
    .addEdge('finishMaterialArguments', 'publishMaterialRecovery')
    .addEdge('publishCompletion', END)
    .addEdge('fail', END)
    .compile({ checkpointer: dependencies.checkpointer })
    .withConfig({ recursionLimit });
}
