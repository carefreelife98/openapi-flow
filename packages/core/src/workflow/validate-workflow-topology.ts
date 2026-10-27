import type { ValidateWorkflowTopologyInput } from '../types/workflow-plan.js';
import { analyzeWorkflowTopology } from './analyze-workflow-topology.js';
import { inspectWorkflowNodeConstraints } from './connections/constraints/inspect-workflow-node-constraints.js';
import { WorkflowPlanningConstraintError } from './connections/constraints/workflow-planning-constraint-error.js';

/** Keep the existing validation boundary; analysis owns the same checks and route evidence. */
export function validateWorkflowTopology(
  input: ValidateWorkflowTopologyInput,
): void {
  const inspection = inspectWorkflowNodeConstraints({
    contracts: input.contracts,
    goals: [],
    protectedEdges: [],
  });
  if (inspection.conflicts.length)
    throw new WorkflowPlanningConstraintError(inspection);
  analyzeWorkflowTopology(input);
}
