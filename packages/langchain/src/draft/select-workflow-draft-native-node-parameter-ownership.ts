import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftNativeNodeAddition,
  createWorkflowDraftNativeNodeParameterOwnershipSchema,
  resolveWorkflowDraftNativeNodeParameterOwnership,
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
} from '@openapi-flow/core';
import type {
  WorkflowDraftNativeNodeParameterOwnershipProposal,
  WorkflowDraftNativeNodeParameterOwnershipResult,
} from '@openapi-flow/core';
import type { SelectWorkflowDraftNativeNodeParameterOwnershipInput } from '../types/workflow-draft-native-node-addition.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { workflowDraftNativeNodeParameterOwnershipPrompt } from '../prompts/workflow-draft-native-node-addition-prompt.js';
import { WorkflowDraftNativeNodeAdditionPlanningError } from './workflow-draft-native-node-addition-planning-error.js';

/** One separately checkpointable ownership choice; never a hidden value-generation call. */
export async function selectWorkflowDraftNativeNodeParameterOwnership(
  input: SelectWorkflowDraftNativeNodeParameterOwnershipInput,
): Promise<WorkflowDraftNativeNodeParameterOwnershipResult> {
  if (input.parameterOwnership !== undefined)
    throw new Error(
      'Native addition already has explicit ownership; remove it before selecting again',
    );
  const description = describeWorkflowDraftNativeNodeAddition(input);
  if (
    !description.allowRuntimeParameters ||
    !description.capability.supportsRuntimeParameters ||
    description.parameterMode === 'fixed-empty'
  )
    return resolveWorkflowDraftNativeNodeParameterOwnership({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'literal',
          sourceMessageIds: description.messages.map((message) => message.id),
          ...(description.includeExplanations
            ? {
                explanation: {
                  reason:
                    'The supplied policy and registered implementation require no runtime ownership choice.',
                  evidence: description.messages.map((message) => ({
                    kind: 'message' as const,
                    messageId: message.id,
                  })),
                },
              }
            : {}),
        },
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'selectWorkflowDraftNativeNodeParameterOwnership.model must support structured output when ownership is selectable',
    );
  const schema = createWorkflowDraftNativeNodeParameterOwnershipSchema(input);
  const output = await input.model
    .withStructuredOutput<WorkflowDraftNativeNodeParameterOwnershipProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'select_draft_native_node_parameter_ownership',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftNativeNodeParameterOwnershipPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'native-parameters',
          }),
          instruction: description.instruction,
          ...(description.sourceDependencies === undefined
            ? {}
            : { sourceDependencies: description.sourceDependencies }),
          capability: description.capability,
          parametersSchema: description.parametersSchema,
          messages: description.messages,
          backgroundMessages: description.backgroundMessages,
          sourceCandidates: description.sources.values.map((source) => ({
            kind: source.kind,
            nodeId: source.nodeId,
          })),
          includeExplanations: description.includeExplanations,
        }),
      ),
    ]);
  try {
    return resolveWorkflowDraftNativeNodeParameterOwnership({
      ...input,
      fingerprint: description.fingerprint,
      proposal: parseStructuredOutput(
        schema,
        output,
        'native addition parameter ownership',
      ),
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeNodeAdditionPlanningError(
      { stage: 'ownership', output },
      cause,
    );
  }
}
