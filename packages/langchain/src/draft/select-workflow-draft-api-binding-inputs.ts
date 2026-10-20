import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftApiBindingIntent,
  describeWorkflowDraftClarificationOwnership,
  createWorkflowDraftApiBindingIntentSchema,
  resolveWorkflowDraftApiBindingIntent,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiBindingIntent,
  WorkflowDraftApiBindingIntentProposal,
} from '@openapi-flow/core';
import type { SelectWorkflowDraftApiBindingInputsInput } from '../types/workflow-draft-api-call-planning.js';
import { workflowDraftApiBindingIntentPrompt } from '../prompts/workflow-draft-api-call-planning-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftApiCallPlanningError } from './workflow-draft-api-call-planning-error.js';

/** Select dependency intent before exposing producer schemas or permitting binding questions. */
export async function selectWorkflowDraftApiBindingInputs(
  input: SelectWorkflowDraftApiBindingInputsInput,
): Promise<WorkflowDraftApiBindingIntent> {
  const description = describeWorkflowDraftApiBindingIntent(input);
  const schema = createWorkflowDraftApiBindingIntentSchema(input);
  const planningClarifications = describeWorkflowDraftClarificationOwnership({
    ...input,
    stepId: input.stepId,
    stage: 'api-bindings',
  });
  if (
    !description.hasRequestInputs ||
    (!description.hasPotentialPredecessors && !planningClarifications.length)
  )
    return resolveWorkflowDraftApiBindingIntent({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        targets: [],
        sourceMessageIds: description.messages.map((message) => message.id),
        ...(description.includeExplanations
          ? {
              explanation: {
                reason: !description.hasRequestInputs
                  ? 'The selected OAS has no request fields for predecessor bindings.'
                  : 'There is no other selected instance or declared predecessor contract and no explicit binding concern. Missing literals remain the OAS argument stage responsibility.',
                evidence: description.messages.map((message) => ({
                  kind: 'message' as const,
                  messageId: message.id,
                })),
              },
            }
          : {}),
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'selectWorkflowDraftApiBindingInputs.model must support structured output when dependency intent is unresolved',
    );
  const output = await input.model
    .withStructuredOutput<WorkflowDraftApiBindingIntentProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'select_draft_api_binding_inputs',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftApiBindingIntentPrompt),
      new HumanMessage(
        JSON.stringify({
          instruction: description.instruction,
          messages: description.messages,
          backgroundMessages: description.backgroundMessages,
          planningClarifications,
          operation: {
            key: description.operation.key,
            method: description.operation.method,
            path: description.operation.path,
            summary: description.operation.operation.summary,
            description: description.operation.operation.description,
            parameters: description.operation.effective.parameters,
          },
          requestSchema: description.requestSchema,
          requestMediaType: description.requestMediaType,
          includeExplanations: description.includeExplanations,
        }),
      ),
    ]);
  try {
    const proposal = parseStructuredOutput(
      schema,
      output,
      'draft API binding input intent',
    );
    if (!isDeepStrictEqual(proposal, output))
      throw new Error(
        'API binding input intent output changed during validation',
      );
    return resolveWorkflowDraftApiBindingIntent({
      ...input,
      fingerprint: description.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiCallPlanningError(
      { stage: 'binding-inputs', output },
      cause,
    );
  }
}
