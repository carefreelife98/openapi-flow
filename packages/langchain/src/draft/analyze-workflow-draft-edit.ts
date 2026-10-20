import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createWorkflowDraftEditPlan,
  describeWorkflowDraftEditContext,
  resolveWorkflowDraftEditOptions,
  describeWorkflowDraftCapabilityGap,
} from '@openapi-flow/core';
import type { WorkflowDraftEditPlan } from '@openapi-flow/core';
import type {
  AnalyzeWorkflowDraftEditInput,
  WorkflowDraftEditModelOutput,
} from '../types/workflow-draft-edit.js';
import { createWorkflowDraftEditSchema } from '../schemas/workflow-draft-edit-schema.js';
import { workflowDraftEditPrompt } from '../prompts/workflow-draft-edit-prompt.js';
import { workflowUserActionEvidencePrompt } from '../prompts/workflow-user-action-evidence-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftEditPlanningError } from './workflow-draft-edit-planning-error.js';
import { resolveWorkflowDraftEditProposal } from './resolve-workflow-draft-edit-proposal.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One semantic call. Resolution/values/bindings/edges and canonical mutation stay separate. */
export async function analyzeWorkflowDraftEdit(
  input: AnalyzeWorkflowDraftEditInput,
): Promise<WorkflowDraftEditPlan> {
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'analyzeWorkflowDraftEdit.model must support structured output',
    );
  const context = describeWorkflowDraftEditContext(input);
  const options = resolveWorkflowDraftEditOptions(input.options);
  const candidates = context.planning.operations.map((operation, index) => ({
    candidateId: `candidate-${index + 1}`,
    operation,
  }));
  const schema = createWorkflowDraftEditSchema(
    context,
    options,
    candidates.map((candidate) => candidate.candidateId),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftEditModelOutput>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input', 'ref'), {
      name: 'analyze_workflow_draft_edit',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(
        workflowDraftEditPrompt + '\n' + workflowUserActionEvidencePrompt,
      ),
      new HumanMessage(
        JSON.stringify({
          requestMessageIds: context.requestMessageIds,
          draft: {
            requirements: context.draft.requirements,
            removedRequirements: context.removedRequirements,
            apiCalls: context.draft.apiCalls,
            nativeNodes: context.draft.nativeNodes,
            nodeContracts: context.nodeContracts,
            ...(context.draft.gapNodes === undefined
              ? {}
              : {
                  gapNodes: context.draft.gapNodes.map((gap) =>
                    describeWorkflowDraftCapabilityGap({
                      gap,
                      context: input.context,
                    }),
                  ),
                }),
            edges: context.draft.edges,
          },
          messages: context.planning.messages,
          candidates,
          capabilities: context.planning.capabilities,
          options,
          ...(context.planning.clarification === undefined
            ? {}
            : { clarification: context.planning.clarification }),
        }),
      ),
    ]);
  let proposed: WorkflowDraftEditModelOutput;
  try {
    proposed = parseStructuredOutput(schema, output, 'model draft edit');
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftEditPlanningError(
      { stage: 'proposal-schema', proposal: output },
      cause,
    );
  }
  try {
    const plan = createWorkflowDraftEditPlan({
      ...input,
      options,
      proposal: resolveWorkflowDraftEditProposal(proposed, candidates),
    });
    if (
      plan.draftFingerprint !== context.draftFingerprint ||
      plan.contextFingerprint !== context.contextFingerprint ||
      plan.nodeContractsFingerprint !== context.nodeContractsFingerprint ||
      JSON.stringify(plan.requestMessageIds) !==
        JSON.stringify(context.requestMessageIds)
    )
      throw new Error(
        'Draft edit input changed during model invocation; no automatic rebase is permitted',
      );
    return plan;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftEditPlanningError(
      { stage: 'proposal-validation', proposal: output },
      cause,
    );
  }
}
