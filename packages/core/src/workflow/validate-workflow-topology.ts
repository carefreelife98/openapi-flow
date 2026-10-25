import type { ValidateWorkflowTopologyInput } from '../types/workflow-plan.js';
import { analyzeWorkflowTopology } from './analyze-workflow-topology.js';

/** Keep the existing validation boundary; analysis owns the same checks and route evidence. */
export function validateWorkflowTopology(
  input: ValidateWorkflowTopologyInput,
): void {
  analyzeWorkflowTopology(input);
}
