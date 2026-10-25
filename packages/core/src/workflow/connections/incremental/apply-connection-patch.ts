import type {
  ApplyWorkflowConnectionPatchInput,
  WorkflowConnectionWorkingGraph,
} from '../../../types/workflow-connection-session.js';
import { workflowConnectionEdgeId } from './connection-graph-identity.js';

/** Pure candidate construction. Validation and adoption are separate, never partial mutation. */
export function applyConnectionPatch({
  graph,
  proposal,
  protectedEdgeIds,
}: ApplyWorkflowConnectionPatchInput): WorkflowConnectionWorkingGraph {
  const next = structuredClone(graph);
  if (new Set(proposal.removeEdgeIds).size !== proposal.removeEdgeIds.length)
    throw new Error('Duplicate removed edge IDs');
  for (const id of proposal.removeEdgeIds) {
    if (protectedEdgeIds.has(id))
      throw new Error(`Original edge ${id} is not editable`);
    const index = next.edges.findIndex(
      (edge) => workflowConnectionEdgeId(edge) === id,
    );
    if (index < 0) throw new Error(`Removed edge ${id} does not exist`);
    next.edges.splice(index, 1);
  }
  for (const id of proposal.removeRootNodeIds) {
    const index = next.rootNodeIds.indexOf(id);
    if (index < 0) throw new Error(`Removed root ${id} does not exist`);
    next.rootNodeIds.splice(index, 1);
  }
  for (const item of proposal.removeTerminals) {
    const index = next.terminals.findIndex(
      (entry) => entry.nodeId === item.nodeId && entry.output === item.output,
    );
    if (index < 0)
      throw new Error(
        `Removed terminal ${item.nodeId}/${item.output} does not exist`,
      );
    next.terminals.splice(index, 1);
  }
  next.edges.push(...structuredClone(proposal.addEdges));
  next.rootNodeIds.push(...proposal.addRootNodeIds);
  next.terminals.push(...structuredClone(proposal.addTerminals));
  next.assessments = [];
  return next;
}
