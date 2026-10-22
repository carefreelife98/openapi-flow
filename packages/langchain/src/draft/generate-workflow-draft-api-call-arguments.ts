import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftApiCallArguments,
  createWorkflowDraftApiCallArgumentsSchema,
  resolveWorkflowDraftApiCallArguments,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiCallArgumentsProposal,
  WorkflowDraftApiCallArgumentsResult,
} from '@openapi-flow/core';
import type { GenerateWorkflowDraftApiCallArgumentsInput } from '../types/workflow-draft-api-call-planning.js';
import { workflowDraftApiCallArgumentsPrompt } from '../prompts/workflow-draft-api-call-planning-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftApiCallPlanningError } from './workflow-draft-api-call-planning-error.js';
import { selectWorkflowDraftApiEnums } from './select-workflow-draft-api-enums.js';

export async function generateWorkflowDraftApiCallArguments(
  input: GenerateWorkflowDraftApiCallArgumentsInput,
): Promise<WorkflowDraftApiCallArgumentsResult> {
  if (
    input.selectOasEnums !== undefined &&
    typeof input.selectOasEnums !== 'boolean'
  )
    throw new Error(
      'generateWorkflowDraftApiCallArguments.selectOasEnums must be a boolean',
    );
  const description = describeWorkflowDraftApiCallArguments(input);
  const schema = createWorkflowDraftApiCallArgumentsSchema(input);
  if (!description.hasLiteralInputs)
    return resolveWorkflowDraftApiCallArguments({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        values: {},
        ...(input.trackRequestedInputs === true ? { requestedInputs: [] } : {}),
        sourceMessageIds: description.messages.map((message) => message.id),
        ...(description.includeExplanations
          ? {
              explanation: {
                reason:
                  'The OAS input contract has no remaining literal fields after explicit bindings and confirmed inputs.',
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
      'generateWorkflowDraftApiCallArguments.model must support structured output when literal inputs remain',
    );
  const output = await input.model
    .withStructuredOutput<WorkflowDraftApiCallArgumentsProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'generate_draft_api_call_arguments',
        // Omitted unknown OAS values are intentional. OpenAI strict JSON Schema
        // requires every property, so use the same primary tool transport as
        // generateApiArguments and validate the unchanged schema locally.
        method: 'functionCalling',
        strict: false,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftApiCallArgumentsPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'api-arguments',
          }),
          instruction: description.instruction,
          messages: description.messages,
          backgroundMessages: description.backgroundMessages,
          operation: {
            key: description.operation.key,
            method: description.operation.method,
            path: description.operation.path,
            summary: description.operation.operation.summary,
            description: description.operation.operation.description,
          },
          requestMediaType: description.requestMediaType,
          literalInputSchema: description.literalInputSchema,
          ...(input.trackRequestedInputs === true
            ? {
                trackRequestedInputs: true,
                requestedInputSchema: description.requestSchema,
              }
            : {}),
          includeExplanations: description.includeExplanations,
          selectOasEnums: input.selectOasEnums === true,
        }),
      ),
    ]);
  try {
    const parsed = parseStructuredOutput(
      schema,
      output,
      'draft API call arguments',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error('API call argument output changed during validation');
    const resolutionInput = {
      ...input,
      fingerprint: description.fingerprint,
      proposal: parsed,
    };
    if (input.selectOasEnums === true)
      return selectWorkflowDraftApiEnums({
        ...resolutionInput,
        model: input.model,
      });
    return resolveWorkflowDraftApiCallArguments(resolutionInput);
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiCallPlanningError(
      { stage: 'arguments', output },
      cause,
    );
  }
}
