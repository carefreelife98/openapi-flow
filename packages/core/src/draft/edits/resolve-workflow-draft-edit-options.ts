import type {
  WorkflowDraftEditOptions,
  ResolvedWorkflowDraftEditOptions,
} from '../../types/workflow-draft-edit.js';
import { workflowDraftEditOptionsSchema } from '../../schemas/workflow-draft-edit-options-schema.js';

export function resolveWorkflowDraftEditOptions(
  input?: WorkflowDraftEditOptions,
): ResolvedWorkflowDraftEditOptions {
  const configured = workflowDraftEditOptionsSchema.parse(
    input === undefined ? {} : input,
  );
  return {
    includeExplanations:
      configured.includeExplanations === undefined
        ? true
        : configured.includeExplanations,
  };
}
