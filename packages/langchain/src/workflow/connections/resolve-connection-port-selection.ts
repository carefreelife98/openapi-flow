import type { WorkflowPlanNodeContract } from '@openapi-flow/core';
import type { WorkflowConnectionEndpointSelection } from '../../types/incremental-connection-planning.js';

/** The schema deliberately excludes a unique port from the model's decision. This is not a fallback. */
export function resolveConnectionPortSelection(
  selection: WorkflowConnectionEndpointSelection,
  contracts: WorkflowPlanNodeContract[],
  direction: 'inputs' | 'outputs',
): string {
  const node = contracts.find((contract) => contract.id === selection.nodeId);
  if (!node)
    throw new Error(`Connection selection has no node ${selection.nodeId}`);
  const ports = node[direction];
  if (ports.length === 1) {
    if (selection.port !== undefined)
      throw new Error(
        `Connection selection ${node.id} must not regenerate its unique port`,
      );
    return ports[0]!;
  }
  if (selection.port === undefined || !ports.includes(selection.port))
    throw new Error(
      `Connection selection ${node.id} requires an actual ${direction} port`,
    );
  return selection.port;
}
