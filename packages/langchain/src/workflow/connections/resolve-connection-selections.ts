import type {
  WorkflowConnectionGoalProposal,
  WorkflowPlanNodeContract,
  WorkflowPlanEdge,
  WorkflowConnectionPatch,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionGoalSelection,
  WorkflowConnectionEdgeSelection,
  WorkflowConnectionEndpointSelection,
} from '../../types/incremental-connection-planning.js';
import { resolveConnectionPortSelection } from './resolve-connection-port-selection.js';

export function resolveConnectionGoalSelections(
  selections: WorkflowConnectionGoalSelection[],
  nodes: WorkflowPlanNodeContract[],
): WorkflowConnectionGoalProposal[] {
  return selections.map((goal) =>
    goal.kind !== 'route'
      ? goal
      : {
          kind: goal.kind,
          from: goal.source.nodeId,
          to: goal.to,
          factIds: goal.factIds,
          reason: goal.reason,
          output: resolveConnectionPortSelection(goal.source, nodes, 'outputs'),
        },
  );
}

/** Endpoint intent is model-owned; a unique declared output port is code-owned. */
export function resolveConnectionEndpointSelections(
  selections: WorkflowConnectionEndpointSelection[],
  nodes: WorkflowPlanNodeContract[],
): WorkflowConnectionPatch['addTerminals'] {
  return selections.map((selection) => ({
    nodeId: selection.nodeId,
    output: resolveConnectionPortSelection(selection, nodes, 'outputs'),
  }));
}
export function resolveConnectionEdgeSelections(
  selections: WorkflowConnectionEdgeSelection[],
  nodes: WorkflowPlanNodeContract[],
): WorkflowPlanEdge[] {
  return selections.map((edge) => ({
    from: edge.source.nodeId,
    output: resolveConnectionPortSelection(edge.source, nodes, 'outputs'),
    to: edge.target.nodeId,
    input: resolveConnectionPortSelection(edge.target, nodes, 'inputs'),
  }));
}
