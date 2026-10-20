import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftNativeReferenceRepair,
  createWorkflowDraftNativeReferenceRepairSchema,
  resolveWorkflowDraftNativeReferenceRepair,
} from '@openapi-flow/core';
import type {
  WorkflowDraftNativeReferenceRepairProposal,
  WorkflowDraftNativeReferenceRepairResult,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftNativeReferenceRepairInput } from '../types/workflow-draft-native-reference-repair.js';
import { workflowDraftNativeReferenceRepairPrompt } from '../prompts/workflow-draft-native-reference-repair-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftNativeReferenceRepairPlanningError } from './workflow-draft-native-reference-repair-planning-error.js';

/** One model call proposes only source choices for implementation-declared reference locations. */
export async function planWorkflowDraftNativeReferenceRepair(
  input: PlanWorkflowDraftNativeReferenceRepairInput,
): Promise<WorkflowDraftNativeReferenceRepairResult> {
  const context = describeWorkflowDraftNativeReferenceRepair(input);
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planWorkflowDraftNativeReferenceRepair.model must support structured output',
    );
  const schema = createWorkflowDraftNativeReferenceRepairSchema(context);
  const output = await input.model
    .withStructuredOutput<WorkflowDraftNativeReferenceRepairProposal>(
      serializeStructuredOutputSchema(schema, 'draft-7'),
      {
        name: 'plan_draft_native_reference_repair',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftNativeReferenceRepairPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          instructions: context.instructions,
          target: { node: context.node, references: context.bindings },
          sourceChanges: context.task.sourceNodeIds,
          sourceCandidates: context.sources.values.map((source) =>
            source.kind === 'native'
              ? source
              : {
                  kind: source.kind,
                  nodeId: source.nodeId,
                  preparation: source.preparation,
                  operation: {
                    method: source.operation.method,
                    path: source.operation.path,
                    summary: source.operation.operation.summary,
                    description: source.operation.operation.description,
                    responses: source.operation.operation.responses,
                  },
                  responsePointerCatalog: source.responsePointerCatalog,
                },
          ),
          exclusiveOutputSources: context.sources.exclusiveOutputs,
          messages: context.messages,
          backgroundMessages: context.backgroundMessages,
          includeExplanations: context.includeExplanations,
        }),
      ),
    ]);
  let proposal: WorkflowDraftNativeReferenceRepairProposal;
  try {
    proposal = parseStructuredOutput(
      schema,
      output,
      'draft native reference repair',
    );
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeReferenceRepairPlanningError(
      { stage: 'proposal-schema', output },
      cause,
    );
  }
  try {
    return resolveWorkflowDraftNativeReferenceRepair({
      ...input,
      fingerprint: context.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeReferenceRepairPlanningError(
      { stage: 'proposal-validation', output },
      cause,
    );
  }
}
