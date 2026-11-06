import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeApiBindingCalls,
  describeApiLiteralJsonSources,
  resolveWorkflowApiBindingSources,
} from '@openapi-flow/core';
import type { ApiBindingSourceSelection } from '@openapi-flow/core';
import type {
  SelectWorkflowApiBindingSourcesInput,
  WorkflowApiBindingSourceDecisionOutput,
} from '../types/workflow-api-binding-sources.js';
import { createApiBindingSourceDecisionSchema } from '../schemas/api-call-binding-plan-schema.js';
import { createApiBindingSourceProposal } from './create-api-binding-source-proposal.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { workflowApiBindingSourcesPrompt } from '../prompts/workflow-api-binding-sources-prompt.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';

/** One shared producer-selection call; field binding and final cycle checks keep their owners. */
export async function selectWorkflowApiBindingSources(
  input: SelectWorkflowApiBindingSourcesInput,
): Promise<ApiBindingSourceSelection[]> {
  modelSignalSchema.parse(input.signal);
  input.signal?.throwIfAborted();
  const descriptions = describeApiBindingCalls(input);
  const pending = descriptions.filter(
    (description) =>
      Object.keys(description.requestSchema.properties as object).length > 0,
  );
  const schemas = Object.fromEntries(
    pending.map((description) => [
      description.input.callId,
      createApiBindingSourceDecisionSchema(description),
    ]),
  );
  const sourceCandidates = [
    ...new Map(
      descriptions
        .flatMap((description) => [
          description.target,
          ...description.sourceCandidates,
        ])
        .map((candidate) => [candidate.nodeId, candidate]),
    ).values(),
  ];
  const proposal: WorkflowApiBindingSourceDecisionOutput = pending.length
    ? await invokeStructuredModel<WorkflowApiBindingSourceDecisionOutput>({
        model: input.model,
        schema: serializeStructuredOutputSchema(
          z.strictObject({ calls: z.strictObject(schemas) }),
          'draft-2020-12',
          'output',
          'ref',
        ),
        operation: 'selectWorkflowApiBindingSources',
        name: 'select_workflow_api_binding_sources',
        method: 'functionCalling',
        strict: true,
        signal: input.signal,
        messages: [
          new SystemMessage(workflowApiBindingSourcesPrompt),
          new HumanMessage(
            JSON.stringify({
              scenario: input.scenario,
              sourceCandidates,
              calls: pending.map((description) => ({
                callId: description.input.callId,
                targetId: description.target.nodeId,
                requestSchema: description.requestSchema,
                allowedSourceNodeIds: description.sourceCandidates.map(
                  (candidate) => candidate.nodeId,
                ),
              })),
              ...(input.literalSourceMessages === undefined
                ? {}
                : {
                    literalSourceMessages: input.literalSourceMessages,
                    literalJsonSources: describeApiLiteralJsonSources(
                      input.literalSourceMessages,
                    ),
                  }),
            }),
          ),
        ],
      })
    : { calls: {} };
  input.signal?.throwIfAborted();
  if (!isDeepStrictEqual(descriptions, describeApiBindingCalls(input)))
    throw new Error(
      'Workflow binding sources changed while selecting producers',
    );
  const parsed = z
    .strictObject({
      calls: z.strictObject(
        Object.fromEntries(
          pending.map((description) => [
            description.input.callId,
            createApiBindingSourceDecisionSchema(description, false),
          ]),
        ),
      ),
    })
    .parse(proposal);
  return resolveWorkflowApiBindingSources({
    ...input,
    proposals: Object.fromEntries(
      descriptions.map((description) => {
        const output = parsed.calls[description.input.callId];
        return [
          description.input.callId,
          output === undefined
            ? { sourceNodeIds: [], gaps: [] }
            : createApiBindingSourceProposal(
                output,
                description.input.literalSourceMessages,
              ),
        ];
      }),
    ),
  });
}
