import type { ValidateWorkflowDraftEditPlanInput } from '../../../types/workflow-draft-edit.js';
import type { WorkflowDraftEditConnectionChange } from '../../../types/workflow-draft-edit-assembly.js';

/** A validated explicit removal owns all incident edges, never replacement routes or other nodes. */
export function deriveWorkflowDraftNodeRemovalConnections(
  input: ValidateWorkflowDraftEditPlanInput,
): WorkflowDraftEditConnectionChange[] {
  const removals = input.plan.steps.filter(
    (step) => step.decision.kind === 'remove-node',
  );
  return input.draft.edges.flatMap((edge) => {
    const stepIds = removals
      .filter(
        (step) =>
          step.decision.kind === 'remove-node' &&
          (step.decision.nodeId === edge.from ||
            step.decision.nodeId === edge.to),
      )
      .map((step) => step.id);
    return stepIds.length
      ? [{ kind: 'remove-edge' as const, stepIds, edge: structuredClone(edge) }]
      : [];
  });
}
