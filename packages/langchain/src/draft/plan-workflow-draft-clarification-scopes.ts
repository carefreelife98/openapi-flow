import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarificationScopes,
  createWorkflowDraftClarificationScopeSchema,
  resolveWorkflowDraftClarificationScopes,
} from '@openapi-flow/core';
import type {
  WorkflowDraftClarificationScopeProposal,
  ResolvedWorkflowDraftClarificationScopes,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftClarificationScopesInput } from '../types/workflow-draft-clarification.js';
import { workflowDraftClarificationScopePrompt } from '../prompts/workflow-draft-clarification-scope-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftClarificationScopePlanningError } from './workflow-draft-clarification-scope-planning-error.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One semantic scope choice. No calls when there are no requirements or only the workflow scope exists. */
export async function planWorkflowDraftClarificationScopes(
  input: PlanWorkflowDraftClarificationScopesInput,
): Promise<ResolvedWorkflowDraftClarificationScopes> {
  const description = describeWorkflowDraftClarificationScopes(input);
  if (
    !description.requirements.length ||
    (!description.nodes.length &&
      description.requirements.every(
        (requirement) => requirement.origin?.kind !== 'clarification-question',
      ))
  )
    return resolveWorkflowDraftClarificationScopes({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        scopes: Object.fromEntries(
          description.requirements.map((requirement) => [
            requirement.id,
            {
              scope: { kind: 'workflow' as const },
              ...(description.includeExplanations
                ? {
                    explanation: {
                      reason:
                        'No workflow nodes are selected; workflow is the only available scope.',
                      evidence: description.messages.map((message) => ({
                        kind: 'message' as const,
                        messageId: message.id,
                        quote: message.text,
                      })),
                    },
                  }
                : {}),
            },
          ]),
        ),
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planWorkflowDraftClarificationScopes.model must support structured output when multiple scopes exist',
    );
  const schema = createWorkflowDraftClarificationScopeSchema(
    input,
    createWorkflowMessageEvidenceSelectionSchema(description.messages),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftClarificationScopeProposal>
    >(serializeStructuredOutputSchema(schema, 'draft-2020-12', 'input'), {
      name: 'scope_workflow_draft_clarification',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftClarificationScopePrompt),
      new HumanMessage(
        JSON.stringify({
          requirements: description.requirements,
          nodes: description.nodes,
          messages: description.messages,
          includeExplanations: description.includeExplanations,
        }),
      ),
    ]);
  let proposal: WorkflowDraftClarificationScopeProposal;
  try {
    proposal = parseStructuredOutput(
      schema,
      output,
      'workflow draft clarification scopes',
    );
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftClarificationScopePlanningError(
      { stage: 'scope-schema', output },
      cause,
    );
  }
  try {
    return resolveWorkflowDraftClarificationScopes({
      ...input,
      fingerprint: description.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftClarificationScopePlanningError(
      { stage: 'scope-resolution', output },
      cause,
    );
  }
}
