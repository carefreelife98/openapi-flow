import { END, START, StateGraph } from '@langchain/langgraph';
import type { ApiArgumentPlanningDependencies } from '../types/api-argument-planning.js';
import {
  apiArgumentPlanningPolicySchema,
  apiArgumentPlanningStateSchema,
} from '../schemas/api-argument-planning-state-schema.js';
import { createApiArgumentPlanningStages } from './arguments/create-api-argument-planning-stages.js';

/** Optional host-owned correction loop; never inserted into the importable OSS planner itself. */
export function createApiArgumentPlanningGraph(
  input: ApiArgumentPlanningDependencies,
) {
  const dependencies = {
    ...input,
    policy: apiArgumentPlanningPolicySchema.parse(input.policy),
  };
  const recursionLimit = dependencies.policy.maxAttempts * 4 + 6;
  if (!Number.isSafeInteger(recursionLimit))
    throw new Error(
      'API argument maxAttempts exceeds safe LangGraph step accounting',
    );
  const stages = createApiArgumentPlanningStages(dependencies);
  return new StateGraph(apiArgumentPlanningStateSchema)
    .addNode('initialize', stages.initialize)
    .addNode('reserveAttempt', stages.reserve)
    .addNode('publishAttempt', stages.publishAttempt)
    .addNode('generateValues', stages.generate)
    .addNode('publishOutcome', stages.publishOutcome)
    .addNode('fail', stages.fail)
    .addEdge(START, 'initialize')
    .addConditionalEdges(
      'initialize',
      (state) =>
        state.failureId
          ? 'fail'
          : state.status === 'complete'
            ? END
            : 'reserveAttempt',
      ['reserveAttempt', 'fail', END],
    )
    .addEdge('reserveAttempt', 'publishAttempt')
    .addEdge('publishAttempt', 'generateValues')
    .addConditionalEdges(
      'generateValues',
      (state) => (state.failureId ? 'fail' : 'publishOutcome'),
      ['fail', 'publishOutcome'],
    )
    .addEdge('fail', END)
    .addConditionalEdges(
      'publishOutcome',
      (state) => (state.status === 'complete' ? END : 'reserveAttempt'),
      ['reserveAttempt', END],
    )
    .compile({ checkpointer: dependencies.checkpointer })
    .withConfig({ recursionLimit });
}
