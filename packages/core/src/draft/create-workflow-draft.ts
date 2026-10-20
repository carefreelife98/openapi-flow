import type {
  CreateWorkflowDraftInput,
  WorkflowDraft,
} from '../types/workflow-draft.js';
import { workflowDraftContentSchema } from '../schemas/workflow-draft-schema.js';
import { validateWorkflowDraft } from './validate-workflow-draft.js';
import { appendWorkflowDraftRequirementHistory } from './requirements/history/append-workflow-draft-requirement-history.js';

export function createWorkflowDraft(
  input: CreateWorkflowDraftInput,
): WorkflowDraft {
  if (!input.context || !Array.isArray(input.context.messages))
    throw new Error('draft context.messages must be an explicit array');
  const draft: WorkflowDraft = {
    ...workflowDraftContentSchema.parse(input.content),
    revision: 0,
    approvals: [],
    requirementHistory: [],
  };
  for (const requirement of draft.requirements)
    draft.requirementHistory.push(
      appendWorkflowDraftRequirementHistory({
        draftId: draft.id,
        revision: 0,
        history: draft.requirementHistory,
        after: requirement,
        sourceMessageIds: requirement.sourceMessageIds,
        messages: input.context.messages,
      }),
    );
  validateWorkflowDraft({ draft, context: input.context });
  return structuredClone(draft);
}
