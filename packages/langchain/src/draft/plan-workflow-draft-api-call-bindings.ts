import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftApiCallBindings,
  createWorkflowDraftApiCallBindingsSchema,
  resolveWorkflowDraftApiCallBindings,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiCallBindingProposal,
  WorkflowDraftApiCallBindingResult,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftApiCallBindingsInput } from '../types/workflow-draft-api-call-planning.js';
import { workflowDraftApiCallBindingsPrompt } from '../prompts/workflow-draft-api-call-planning-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftApiCallPlanningError } from './workflow-draft-api-call-planning-error.js';

export async function planWorkflowDraftApiCallBindings(
  input: PlanWorkflowDraftApiCallBindingsInput,
): Promise<WorkflowDraftApiCallBindingResult> {
  const description = describeWorkflowDraftApiCallBindings(input);
  const schema = createWorkflowDraftApiCallBindingsSchema(input);
  const planningClarifications = describeWorkflowDraftClarificationOwnership({
    ...input,
    stepId: input.stepId,
    stage: 'api-bindings',
  });
  const noPredecessorChoice =
    !description.hasOtherSelectedNodes &&
    !description.sources.values.length &&
    !planningClarifications.length;
  if (
    !description.hasRequestInputs ||
    description.inputIntent?.targets.length === 0 ||
    (description.inputIntent === undefined && noPredecessorChoice)
  )
    return resolveWorkflowDraftApiCallBindings({
      ...input,
      fingerprint: description.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          sourceMessageIds: description.messages.map((message) => message.id),
          ...(description.includeExplanations
            ? {
                explanation: {
                  reason: !description.hasRequestInputs
                    ? 'The selected OAS declares no request input fields, so there are no request fields to bind.'
                    : description.inputIntent !== undefined
                      ? 'The validated input intent requests no predecessor data. Unspecified optional inputs are not binding questions; required literals remain the OAS argument stage responsibility.'
                      : 'The selected graph has no other API/native instance and no declared binding concern. There is no predecessor choice; missing literal values remain the argument stage responsibility.',
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
      'planWorkflowDraftApiCallBindings.model must support structured output when request inputs exist',
    );
  const output = await input.model
    .withStructuredOutput<WorkflowDraftApiCallBindingProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_draft_api_call_bindings',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftApiCallBindingsPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications,
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
          ...(description.bindingTargets === undefined
            ? {
                requestSchema: description.requestSchema,
                requestInputRoots: description.requestInputRoots,
              }
            : { bindingTargets: description.bindingTargets }),
          requestMediaType: description.requestMediaType,
          sourceCandidates: description.sources.values.map((source) =>
            source.kind === 'native'
              ? source
              : {
                  kind: source.kind,
                  nodeId: source.nodeId,
                  preparation: source.preparation,
                  operation: {
                    key: source.operation.key,
                    method: source.operation.method,
                    path: source.operation.path,
                    responses: source.operation.operation.responses,
                    summary: source.operation.operation.summary,
                    description: source.operation.operation.description,
                  },
                  responsePointerCatalog: source.responsePointerCatalog,
                },
          ),
          ...(description.previousCall === undefined
            ? {}
            : { previousCall: description.previousCall }),
          includeExplanations: description.includeExplanations,
        }),
      ),
    ]);
  try {
    const parsed = parseStructuredOutput(
      schema,
      output,
      'draft API call bindings',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error('API call binding output changed during validation');
    return resolveWorkflowDraftApiCallBindings({
      ...input,
      fingerprint: description.fingerprint,
      proposal: parsed,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiCallPlanningError(
      { stage: 'bindings', output },
      cause,
    );
  }
}
