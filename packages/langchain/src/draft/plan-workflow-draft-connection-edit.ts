import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftConnectionEdit,
  createWorkflowDraftConnectionEditProposalSchema,
  resolveWorkflowDraftConnectionEdit,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConnectionEditProposal,
  WorkflowDraftConnectionEditResult,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftConnectionEditInput } from '../types/workflow-draft-connection-edit.js';
import { workflowDraftConnectionEditPrompt } from '../prompts/workflow-draft-connection-edit-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftConnectionEditPlanningError } from './workflow-draft-connection-edit-planning-error.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One final topology delta call, after actual material/consumer decisions have resolved. */
export async function planWorkflowDraftConnectionEdit(
  input: PlanWorkflowDraftConnectionEditInput,
): Promise<WorkflowDraftConnectionEditResult> {
  const context = describeWorkflowDraftConnectionEdit(input);
  if (context.status !== 'ready')
    return { status: context.status, description: context };
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planWorkflowDraftConnectionEdit.model must support structured output',
    );
  const schema = createWorkflowDraftConnectionEditProposalSchema(
    context,
    createWorkflowMessageEvidenceSelectionSchema(context.messages),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftConnectionEditProposal>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input'), {
      name: 'plan_draft_connection_edit',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftConnectionEditPrompt),
      new HumanMessage(
        JSON.stringify({
          ...(input.context.entrypoint === undefined
            ? {}
            : { entrypoint: input.context.entrypoint }),
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stage: 'connections',
          }),
          instructions: context.steps.map((step) => ({
            kind: step.decision.kind,
            ...('nodeId' in step.decision
              ? { nodeId: step.decision.nodeId }
              : {}),
            instruction: step.decision.instruction,
          })),
          affectedNodeIds: context.affectedNodeIds,
          contracts: context.contracts,
          existingEdges: context.existingEdges,
          removedIncidentEdges: context.stage.nodeRemovalConnections.map(
            (change) => change.edge,
          ),
          apiInstances: context.apiInstances,
          nativeNodes: context.stage.content.nativeNodes,
          ...(context.stage.content.gapNodes === undefined
            ? {}
            : {
                gapNodes: context.stage.content.gapNodes.map((gap) => ({
                  id: gap.id,
                  requestedBehavior: gap.requestedBehavior,
                  finding: gap.finding,
                })),
              }),
          requirements: context.stage.content.requirements,
          messages: context.messages,
          backgroundMessages: context.backgroundMessages,
          includeExplanations: context.includeExplanations,
        }),
      ),
    ]);
  let proposal: WorkflowDraftConnectionEditProposal;
  try {
    proposal = parseStructuredOutput(schema, output, 'draft connection edit');
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftConnectionEditPlanningError(
      { stage: 'proposal-schema', output },
      cause,
    );
  }
  try {
    return resolveWorkflowDraftConnectionEdit({
      ...input,
      fingerprint: context.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftConnectionEditPlanningError(
      { stage: 'proposal-validation', output },
      cause,
    );
  }
}
