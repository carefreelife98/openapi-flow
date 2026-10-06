import type { PlannedGraphDependencies } from '../types/workflow-graph.js';
import { buildPlannedWorkflowGraph } from './build-planned-workflow-graph.js';

/** Automatic graph design; consumers may instead compose the package functions themselves. */
export function createPlannedWorkflowGenerationGraph(
  dependencies: PlannedGraphDependencies,
) {
  return buildPlannedWorkflowGraph(dependencies);
}
