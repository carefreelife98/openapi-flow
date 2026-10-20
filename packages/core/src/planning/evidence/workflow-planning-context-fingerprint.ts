import { createHash } from 'node:crypto';
import type {
  WorkflowPlanningContext,
  WorkflowPlanningContextDescription,
} from '../../types/planning-evidence.js';
import { describeWorkflowPlanningContext } from './describe-workflow-planning-context.js';

export function workflowPlanningContextFingerprint(
  context: WorkflowPlanningContext,
): string {
  const described = describeWorkflowPlanningContext(context);
  return workflowPlanningContextFingerprintFromDescription(described);
}

export function workflowPlanningContextFingerprintFromDescription(
  described: WorkflowPlanningContextDescription,
): string {
  return createHash('sha256').update(JSON.stringify(described)).digest('hex');
}
