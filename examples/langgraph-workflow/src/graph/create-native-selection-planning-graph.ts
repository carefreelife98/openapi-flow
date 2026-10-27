import { END, START, StateGraph } from '@langchain/langgraph';
import type { NativeSelectionPlanningDependencies } from '../types/native-selection-planning.js';
import {
  nativeSelectionPlanningPolicySchema,
  nativeSelectionPlanningStateSchema,
} from '../schemas/native-selection-planning-state-schema.js';
import { createNativeSelectionPlanningStages } from './native-planning/selection/create-native-selection-planning-stages.js';

/** Explicit host-owned repair loop, separate from the library's one-call selection/review APIs. */
export function createNativeSelectionPlanningGraph(
  input: NativeSelectionPlanningDependencies,
) {
  if (!Array.isArray(input.capabilities))
    throw new Error('Native selection planning.capabilities must be explicit');
  if (typeof input.now !== 'function')
    throw new Error('Native selection planning.now is required');
  const policy = nativeSelectionPlanningPolicySchema.parse(input.policy);
  const recursionLimit =
    (policy.maxModelInvocations + policy.maxReselections + 1) * 4 + 8;
  if (!Number.isSafeInteger(recursionLimit))
    throw new Error(
      'Native selection policy exceeds safe LangGraph step accounting',
    );
  const stages = createNativeSelectionPlanningStages({ ...input, policy });
  return new StateGraph(nativeSelectionPlanningStateSchema)
    .addNode('initialize', stages.initialize)
    .addNode('reserveModelCall', stages.reserve)
    .addNode('selectInstances', stages.select)
    .addNode('reviewSelection', stages.review)
    .addNode('publishOutcome', stages.publish)
    .addNode('fail', stages.fail)
    .addEdge(START, 'initialize')
    .addConditionalEdges(
      'initialize',
      (state) =>
        state.failureId
          ? 'fail'
          : state.status === 'planning'
            ? 'reserveModelCall'
            : END,
      ['fail', 'reserveModelCall', END],
    )
    .addConditionalEdges(
      'reserveModelCall',
      (state) =>
        state.nextAction === 'select' ? 'selectInstances' : 'reviewSelection',
      ['selectInstances', 'reviewSelection'],
    )
    .addConditionalEdges(
      'selectInstances',
      (state) => (state.failureId ? 'fail' : 'publishOutcome'),
      ['fail', 'publishOutcome'],
    )
    .addConditionalEdges(
      'reviewSelection',
      (state) => (state.failureId ? 'fail' : 'publishOutcome'),
      ['fail', 'publishOutcome'],
    )
    .addConditionalEdges(
      'publishOutcome',
      (state) =>
        state.failureId
          ? 'fail'
          : state.status === 'planning'
            ? 'reserveModelCall'
            : END,
      ['fail', 'reserveModelCall', END],
    )
    .addEdge('fail', END)
    .compile({ checkpointer: input.checkpointer })
    .withConfig({ recursionLimit });
}
