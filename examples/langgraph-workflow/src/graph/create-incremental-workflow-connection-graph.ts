import { StateGraph, START, END } from '@langchain/langgraph';
import type { IncrementalConnectionDependencies } from '../types/incremental-connections.js';
import {
  incrementalConnectionPolicySchema,
  incrementalConnectionStateSchema,
} from '../schemas/incremental-connection-state-schema.js';
import { createIncrementalConnectionStages } from './connections/create-incremental-connection-stages.js';

/** Host-owned loop. Optional native augmentation never adds per-edge human interrupts. */
export function createIncrementalWorkflowConnectionGraph(
  input: IncrementalConnectionDependencies,
) {
  const dependencies = {
    ...input,
    policy: incrementalConnectionPolicySchema.parse(input.policy),
    ...(input.nativeAugmentation === undefined
      ? {}
      : { nativeAugmentation: structuredClone(input.nativeAugmentation) }),
  };
  if (
    dependencies.nativeAugmentation !== undefined &&
    !dependencies.nativeAugmentation?.parameterOwnership
  )
    throw new Error('nativeAugmentation.parameterOwnership is required');
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
      'proposeBundle',
      (state) => (state.failureId ? 'fail' : 'applyBundle'),
      ['fail', 'applyBundle'],
    )
    .addEdge('applyBundle', 'publishProgress')
    .addConditionalEdges('publishProgress', stages.route, {
      propose: 'reserveModelCall',
      finalize: 'finalize',
      stop: END,
      'prepare-native': 'prepareNative',
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
    .addEdge('finalize', 'publishCompletion')
    .addEdge('publishCompletion', END)
    .addEdge('fail', END)
    .compile({ checkpointer: dependencies.checkpointer })
    .withConfig({ recursionLimit });
}
