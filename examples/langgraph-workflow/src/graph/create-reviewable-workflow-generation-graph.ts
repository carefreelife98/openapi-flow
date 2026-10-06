import type { PlannedGraphDependencies } from '../types/workflow-graph.js';
import { buildPlannedWorkflowGraph } from './build-planned-workflow-graph.js';
import { createWorkflowGapHandlers } from './preview/create-workflow-gap-handlers.js';

export function createReviewableWorkflowGenerationGraph(
  dependencies: PlannedGraphDependencies,
) {
  return buildPlannedWorkflowGraph(dependencies, createWorkflowGapHandlers());
}
