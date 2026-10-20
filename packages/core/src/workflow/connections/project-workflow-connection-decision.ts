import type {
  WorkflowConnectionDecision,
  WorkflowConnectionProposal,
} from '../../types/workflow-connection-planning.js';
import { workflowConnectionDecisionSchema } from '../../schemas/workflow-connection-planning-schema.js';

/** Project only validated execution decisions; reasons never become workflow data. */
export function projectWorkflowConnectionDecision(
  input: WorkflowConnectionDecision,
): WorkflowConnectionProposal {
  const decision = workflowConnectionDecisionSchema.parse(input);
  return {
    edges: decision.edges.map(({ from, output, to, input }) => ({
      from,
      output,
      to,
      input,
    })),
    blockedCalls: decision.blockedCalls.map(({ callId, gapIds }) => ({
      callId,
      gapIds: structuredClone(gapIds),
    })),
    additionalGaps: structuredClone(decision.additionalGaps),
  };
}
