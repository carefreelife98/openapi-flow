import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftNativeNodeAddition,
  createWorkflowDraftNativeNodeAdditionSchema,
  resolveWorkflowDraftNativeNodeAddition,
  validateWorkflowDraftNativeNodeParameterOwnershipContract,
} from '@openapi-flow/core';
import type {
  WorkflowDraftNativeNodeAdditionProposal,
  WorkflowDraftNativeNodeAdditionResult,
} from '@openapi-flow/core';
import type { GenerateWorkflowDraftNativeNodeAdditionInput } from '../types/workflow-draft-native-node-addition.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { workflowDraftNativeNodeAdditionPrompt } from '../prompts/workflow-draft-native-node-addition-prompt.js';
import { WorkflowDraftNativeNodeAdditionPlanningError } from './workflow-draft-native-node-addition-planning-error.js';

/** One selected instance, zero or one model call; the original draft is never adopted here. */
export async function generateWorkflowDraftNativeNodeAddition(
  input: GenerateWorkflowDraftNativeNodeAdditionInput,
): Promise<WorkflowDraftNativeNodeAdditionResult> {
  const description = describeWorkflowDraftNativeNodeAddition(input);
  const ownership =
    input.parameterOwnership === undefined
      ? undefined
      : validateWorkflowDraftNativeNodeParameterOwnershipContract(input);
  const originalOwnership = JSON.stringify(input.parameterOwnership);
  if (ownership !== undefined && !ownership.hasLiteralParameters)
    return resolveWorkflowDraftNativeNodeAddition({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          ...(ownership.runtimeParameters === true
            ? { status: 'runtime-parameters' as const }
            : { status: 'provided' as const, parameters: {} }),
          sourceMessageIds: ownership.proposal.decision.sourceMessageIds,
          ...(ownership.proposal.decision.explanation === undefined
            ? {}
            : { explanation: ownership.proposal.decision.explanation }),
        },
      },
    });
  if (description.parameterMode === 'fixed-empty') {
    return resolveWorkflowDraftNativeNodeAddition({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          parameters: {},
          sourceMessageIds: description.messages.map((message) => message.id),
          ...(description.includeExplanations
            ? {
                explanation: {
                  reason:
                    'The registered configuration admits exactly one value: the empty object.',
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
  }
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'generateWorkflowDraftNativeNodeAddition.model must support structured output for parameter choices',
    );
  const schema = createWorkflowDraftNativeNodeAdditionSchema(input);
  const output = await input.model
    .withStructuredOutput<WorkflowDraftNativeNodeAdditionProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'generate_draft_native_node_addition',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftNativeNodeAdditionPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'native-parameters',
          }),
          instruction: description.instruction,
          ...(description.plannedNativeRoles === undefined
            ? {}
            : {
                nodeId: description.nodeId,
                stepId: input.stepId,
                plannedNativeRoles: description.plannedNativeRoles,
              }),
          ...(description.sourceDependencies === undefined
            ? {}
            : { sourceDependencies: description.sourceDependencies }),
          capability: description.capability,
          parametersSchema:
            ownership === undefined
              ? description.parametersSchema
              : ownership.literalParametersSchema,
          ...(ownership === undefined
            ? {}
            : { runtimeParameters: ownership.runtimeParameters }),
          sourceCandidates: description.sources.values.map((source) =>
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
          exclusiveOutputSources: description.sources.exclusiveOutputs,
          messages: description.messages,
          backgroundMessages: description.backgroundMessages,
          includeExplanations: description.includeExplanations,
        }),
      ),
    ]);
  let proposal: WorkflowDraftNativeNodeAdditionProposal;
  try {
    proposal = parseStructuredOutput(schema, output, 'native node addition');
    if (!isDeepStrictEqual(proposal, output))
      throw new Error(
        'Native node addition output must validate without defaults, coercion or transformation',
      );
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeNodeAdditionPlanningError(
      { stage: 'proposal-schema', output },
      cause,
    );
  }
  try {
    if (JSON.stringify(input.parameterOwnership) !== originalOwnership)
      throw new Error(
        'Native addition ownership changed during value generation; no automatic rebase',
      );
    return resolveWorkflowDraftNativeNodeAddition({
      ...input,
      fingerprint: description.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeNodeAdditionPlanningError(
      { stage: 'node-validation', output },
      cause,
    );
  }
}
