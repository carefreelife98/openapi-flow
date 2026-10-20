import type {
  WorkflowClarificationOptions,
  ResolvedWorkflowClarificationOptions,
} from '../../types/workflow-clarification.js';
import { workflowClarificationOptionsSchema } from '../../schemas/workflow-clarification-settings-schema.js';

/** Product-approved optional feature defaults, not recovery of required data. */
export function resolveWorkflowClarificationOptions(
  input: WorkflowClarificationOptions = {},
): ResolvedWorkflowClarificationOptions {
  const options = workflowClarificationOptionsSchema.parse(input);
  return {
    includeExplanations:
      options.includeExplanations === undefined
        ? true
        : options.includeExplanations,
    includeSuggestions:
      options.includeSuggestions === undefined
        ? true
        : options.includeSuggestions,
  };
}
