import { z } from 'zod';
import type {
  WorkflowDraftClarificationScopeInput,
  WorkflowDraftClarificationScopeProposal,
} from '../types/workflow-draft-clarification.js';
import { describeWorkflowDraftClarificationScopes } from '../draft/requirements/describe-workflow-draft-clarification-scopes.js';
import { workflowMessageEvidenceSchema } from './planning-evidence-schema.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';
import { createWorkflowDraftSelectedScopeSchema } from './create-workflow-draft-selected-scope-schema.js';

/** Known requirement IDs are object keys; the model chooses only scope and optional user-facing evidence. */
export function createWorkflowDraftClarificationScopeSchema(
  input: WorkflowDraftClarificationScopeInput,
  messageSchema: z.ZodType<WorkflowMessageEvidence> = workflowMessageEvidenceSchema,
): z.ZodType<WorkflowDraftClarificationScopeProposal> {
  const description = describeWorkflowDraftClarificationScopes(input);
  const nodeIds = description.nodes.map((node) => node.id);
  const scope = createWorkflowDraftSelectedScopeSchema(nodeIds);
  const decision = (question: boolean) =>
    z.strictObject({
      scope: question
        ? z.union([
            scope,
            z.strictObject({ kind: z.literal('unselected-work') }),
          ])
        : scope,
      ...(description.includeExplanations
        ? {
            explanation: z.strictObject({
              reason: z.string().min(1),
              evidence: z.array(messageSchema).min(1),
            }),
          }
        : {}),
    });
  return z.strictObject({
    scopes: z.strictObject(
      Object.fromEntries(
        description.requirements.map((requirement) => [
          requirement.id,
          decision(requirement.origin?.kind === 'clarification-question'),
        ]),
      ),
    ),
  }) as z.ZodType<WorkflowDraftClarificationScopeProposal>;
}
