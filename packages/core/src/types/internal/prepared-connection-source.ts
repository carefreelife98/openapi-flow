import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSessionDescription,
} from '../workflow-connection-session.js';
/** Runtime-only immutable source view, not a model decision or host checkpoint. */
export interface PreparedWorkflowConnectionSource {
  source: WorkflowConnectionSessionSource;
  description: WorkflowConnectionSessionDescription;
}
