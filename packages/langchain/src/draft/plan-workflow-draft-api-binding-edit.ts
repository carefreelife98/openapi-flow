import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftApiBindingEdit,
  createWorkflowDraftApiBindingEditProposalSchema,
  resolveWorkflowDraftApiBindingEdit,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiBindingEditProposal,
  WorkflowDraftApiBindingEditResult,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftApiBindingEditInput } from '../types/workflow-draft-api-binding-edit.js';
import { workflowDraftApiBindingEditPrompt } from '../prompts/workflow-draft-api-binding-edit-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftApiBindingEditPlanningError } from './workflow-draft-api-binding-edit-planning-error.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One bounded semantic call, usable for an unfinished step or code-derived repair. */
export async function planWorkflowDraftApiBindingEdit(
  input: PlanWorkflowDraftApiBindingEditInput,
): Promise<WorkflowDraftApiBindingEditResult> {
  const context = describeWorkflowDraftApiBindingEdit(input);
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planWorkflowDraftApiBindingEdit.model must support structured output',
    );
  const schema = createWorkflowDraftApiBindingEditProposalSchema(
    context,
    createWorkflowMessageEvidenceSelectionSchema(context.messages),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftApiBindingEditProposal>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input'), {
      name: 'plan_draft_api_binding_edit',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftApiBindingEditPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications:
            context.scope.kind === 'step'
              ? describeWorkflowDraftClarificationOwnership({
                  ...input,
                  stepId: context.scope.stepId,
                  stage: 'api-bindings',
                })
              : [],
          mode: context.scope.kind,
          instruction: context.instruction,
          target: {
            values: context.call.values,
            bindings: context.call.bindings,
            requestSchema: context.requestSchema,
            operation: {
              method: context.operation.method,
              path: context.operation.path,
              summary: context.operation.operation.summary,
              description: context.operation.operation.description,
              parameters: context.operation.effective.parameters,
              requestBody: context.operation.operation.requestBody,
            },
          },
          sourceCandidates: context.sourceCandidates.map((source) =>
            source.kind === 'native'
              ? source
              : {
                  nodeId: source.nodeId,
                  kind: source.kind,
                  operation: {
                    method: source.operation.method,
                    path: source.operation.path,
                    summary: source.operation.operation.summary,
                    description: source.operation.operation.description,
                    responses: source.operation.operation.responses,
                  },
                  responsePointerCatalog: source.responsePointerCatalog,
                  preparation: source.preparation,
                  requirements: source.requirements,
                },
          ),
          requiredTargetPointers: context.requiredTargetPointers,
          messages: context.messages,
          backgroundMessages: context.backgroundMessages,
          pendingSourceChanges: input.plan.steps.flatMap((step) => {
            const decision = step.decision;
            return context.stage.pendingResolutionStepIds.includes(step.id) &&
              'nodeId' in decision &&
              context.sourceCandidates.some(
                (source) => source.nodeId === decision.nodeId,
              )
              ? [
                  {
                    nodeId: decision.nodeId,
                    kind: decision.kind,
                    instruction: decision.instruction,
                  },
                ]
              : [];
          }),
          includeExplanations: context.includeExplanations,
        }),
      ),
    ]);
  let proposal: WorkflowDraftApiBindingEditProposal;
  try {
    proposal = parseStructuredOutput(schema, output, 'draft API binding edit');
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiBindingEditPlanningError(
      { stage: 'proposal-schema', output },
      cause,
    );
  }
  try {
    return resolveWorkflowDraftApiBindingEdit({
      ...input,
      fingerprint: context.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiBindingEditPlanningError(
      { stage: 'proposal-validation', output },
      cause,
    );
  }
}
