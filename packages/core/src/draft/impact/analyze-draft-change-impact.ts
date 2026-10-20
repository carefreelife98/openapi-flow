import { isDeepStrictEqual } from 'node:util';
import type {
  AnalyzeDraftChangeImpactInput,
  DraftChangeImpact,
} from '../../types/workflow-draft-changes.js';
import type {
  WorkflowDraftContent,
  WorkflowDraftNode,
} from '../../types/workflow-draft.js';
import { validateWorkflowDraft } from '../validate-workflow-draft.js';
import { createWorkflowDraft } from '../create-workflow-draft.js';
import { workflowDraftDependencies } from './workflow-draft-dependencies.js';
import { draftEdgeKey } from '../changes/draft-edge-key.js';

export function analyzeDraftChangeImpact(
  input: AnalyzeDraftChangeImpactInput,
): DraftChangeImpact {
  validateWorkflowDraft({ draft: input.before, context: input.context });
  const after = createWorkflowDraft({
    content: input.after,
    context: input.context,
  });
  if (input.before.id !== after.id)
    throw new Error('Draft changes cannot replace the workflow identity');
  const beforeNodes = draftNodes(input.before);
  const afterNodes = draftNodes(after);
  const allIds = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
  const changedNodeIds = [...allIds].filter(
    (id) => !isDeepStrictEqual(beforeNodes.get(id), afterNodes.get(id)),
  );
  const affected = new Set(changedNodeIds);
  const propagated = new Set(changedNodeIds);
  const beforeEdges = new Set(input.before.edges.map(draftEdgeKey));
  const afterEdges = new Set(after.edges.map(draftEdgeKey));
  for (const edge of [...input.before.edges, ...after.edges])
    if (
      beforeEdges.has(draftEdgeKey(edge)) !== afterEdges.has(draftEdgeKey(edge))
    ) {
      affected.add(edge.from);
      affected.add(edge.to);
      // A new consumer changes its own incoming route, not existing sibling
      // consumers of an unchanged producer. Review the producer's new wire,
      // but propagate only from the changed input endpoint.
      propagated.add(edge.to);
    }
  const oldRequirements = new Map(
    input.before.requirements.map((item) => [item.id, item]),
  );
  const newRequirements = new Map(
    after.requirements.map((item) => [item.id, item]),
  );
  const changedRequirementIds = [
    ...new Set([...oldRequirements.keys(), ...newRequirements.keys()]),
  ].filter(
    (id) =>
      !isDeepStrictEqual(oldRequirements.get(id), newRequirements.get(id)),
  );
  for (const id of changedRequirementIds)
    for (const requirement of [
      oldRequirements.get(id),
      newRequirements.get(id),
    ]) {
      if (!requirement) continue;
      for (const nodeId of requirement.scope.kind === 'workflow'
        ? allIds
        : requirement.scope.nodeIds) {
        affected.add(nodeId);
        propagated.add(nodeId);
      }
    }
  const beforeDependencies = workflowDraftDependencies({
    draft: input.before,
    context: input.context,
  });
  const afterDependencies = workflowDraftDependencies({
    draft: after,
    context: input.context,
  });
  let expanded: boolean;
  do {
    expanded = false;
    for (const [id, dependencies] of [
      ...beforeDependencies,
      ...afterDependencies,
    ])
      if (
        !propagated.has(id) &&
        [...dependencies].some((dependency) => propagated.has(dependency))
      ) {
        affected.add(id);
        propagated.add(id);
        expanded = true;
      }
  } while (expanded);
  return {
    changedNodeIds,
    addedNodeIds: [...afterNodes.keys()].filter((id) => !beforeNodes.has(id)),
    removedNodeIds: [...beforeNodes.keys()].filter((id) => !afterNodes.has(id)),
    affectedNodeIds: [...affected],
    preservedNodeIds: [...afterNodes.keys()].filter((id) => !affected.has(id)),
    changedRequirementIds,
    invalidatedApprovalIds: input.before.approvals
      .filter((approval) =>
        approval.nodeIds.some(
          (id) => affected.has(id) && !approval.invalidatedNodeIds.includes(id),
        ),
      )
      .map((approval) => approval.id),
  };
}

function draftNodes(
  draft: WorkflowDraftContent,
): Map<string, WorkflowDraftNode> {
  return new Map<string, WorkflowDraftNode>([
    ...draft.apiCalls.map((call) => [call.id, call] as const),
    ...draft.nativeNodes.map((node) => [node.id, node] as const),
    ...(draft.gapNodes === undefined
      ? []
      : draft.gapNodes.map((node) => [node.id, node] as const)),
  ]);
}
