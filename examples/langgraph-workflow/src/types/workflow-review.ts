import type {
  ApiSelection,
  ApiBindingPlan,
  WorkflowGraphPlan,
} from '@openapi-flow/core';
import type { WorkflowState, WorkflowUpdate } from './workflow-graph.js';

export type SelectionGapHandler = (
  state: WorkflowState,
  selection: ApiSelection,
) => Promise<WorkflowUpdate>;
export type BindingGapHandler = (
  state: WorkflowState,
  plan: ApiBindingPlan,
) => Promise<WorkflowUpdate>;
export type GraphGapHandler = (
  state: WorkflowState,
  plan: WorkflowGraphPlan,
) => Promise<WorkflowUpdate>;

export interface WorkflowGapHandlers {
  selection: SelectionGapHandler;
  bindings: BindingGapHandler;
  graph: GraphGapHandler;
}
