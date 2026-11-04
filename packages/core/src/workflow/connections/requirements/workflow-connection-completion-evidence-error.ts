import type { WorkflowConnectionViolation } from '../../../types/workflow-connection-session.js';

/** Invalid review evidence is a protocol/input failure, never another unchanged connection attempt. */
export class WorkflowConnectionCompletionEvidenceError extends Error {
  readonly violations: WorkflowConnectionViolation[];
  constructor(violations: WorkflowConnectionViolation[]) {
    super(
      'Connection completion evidence failed validation; correct the evidence contract or source before another review.',
    );
    this.name = 'WorkflowConnectionCompletionEvidenceError';
    this.violations = structuredClone(violations);
  }
}
