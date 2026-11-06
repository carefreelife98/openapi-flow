import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  compileWorkflowApiValues,
  fingerprintWorkflowApiValueContext,
  workflowApiValuePlanSchema,
  describeApiLiteralGeneration,
  describeWorkflowConnectionApiRepair,
} from '@openapi-flow/core';
import type {
  WorkflowApiValueProposal,
  CompiledWorkflowApiValues,
} from '@openapi-flow/core';
import type { GenerateWorkflowApiValuesInput } from '../types/workflow-api-values.js';
import { createWorkflowApiValueGenerationSchema } from '../schemas/workflow-api-value-generation-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { workflowApiValuesPrompt } from '../prompts/workflow-api-values-prompt.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';

/** One OAS value proposal for pending calls; per-call validation and attribution happen in Core. */
export async function generateWorkflowApiValues(
  input: GenerateWorkflowApiValuesInput,
): Promise<CompiledWorkflowApiValues> {
  modelSignalSchema.parse(input.signal);
  input.signal?.throwIfAborted();
  const snapshot = structuredClone({
    scenario: input.scenario,
    messages: input.messages,
    calls: input.calls,
    interpretSchemaChoices: input.interpretSchemaChoices,
  });
  const sourceFingerprint = fingerprintWorkflowApiValueContext(snapshot);
  const captureRepairs = () =>
    input.materialRepairs === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(input.materialRepairs).map(([callId, repair]) => {
            const call = snapshot.calls.find((call) => call.callId === callId);
            if (call === undefined)
              throw new Error(
                `Workflow value repair references unknown call ${callId}`,
              );
            return [
              callId,
              describeWorkflowConnectionApiRepair({
                stage: 'api-arguments',
                repair,
                planning: {
                  ...call,
                  scenario: snapshot.scenario,
                  literalSourceMessages: snapshot.messages,
                },
              }),
            ];
          }),
        );
  const materialRepairs = captureRepairs();
  for (const rejection of input.rejectedCalls ?? []) {
    const call = snapshot.calls.find(
      (call) => call.callId === rejection.callId,
    );
    if (
      call === undefined ||
      rejection.sourceFingerprint !==
        fingerprintWorkflowApiValueContext({ ...snapshot, calls: [call] })
    )
      throw new Error(
        'Workflow value rejection does not match its current call',
      );
  }
  const descriptions = snapshot.calls.map((call) =>
    describeApiLiteralGeneration({
      ...call,
      scenario: snapshot.scenario,
      literalSourceMessages: snapshot.messages,
    }),
  );
  if (
    descriptions.some((description) => description.contract.hasLiteralInputs) &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'generateWorkflowApiValues.model is required for remaining request values',
    );
  const schema = descriptions.some(
    (description) => description.contract.hasLiteralInputs,
  )
    ? createWorkflowApiValueGenerationSchema(descriptions)
    : undefined;
  const proposal: WorkflowApiValueProposal = descriptions.every(
    (description) => !description.contract.hasLiteralInputs,
  )
    ? {
        calls: Object.fromEntries(
          snapshot.calls.map((call) => [
            call.callId,
            { values: {}, requestedInputs: [] },
          ]),
        ),
      }
    : await invokeStructuredModel<WorkflowApiValueProposal>({
        model: input.model!,
        schema: serializeStructuredOutputSchema(
          schema!,
          'draft-2020-12',
          'output',
          'ref',
        ),
        operation: 'generateWorkflowApiValues',
        name: 'generate_workflow_api_values',
        method: 'functionCalling',
        // Partial OAS objects intentionally omit unanswered fields. Provider strict mode requires all
        // object properties; preserve the OAS and validate it per call instead of inventing nulls.
        strict: false,
        signal: input.signal,
        messages: [
          new SystemMessage(workflowApiValuesPrompt),
          new HumanMessage(
            JSON.stringify({
              scenario: snapshot.scenario,
              messages: snapshot.messages,
              interpretSchemaChoices: snapshot.interpretSchemaChoices,
              calls: descriptions.map(({ input: call, context }) => ({
                callId: call.callId,
                purpose: call.purpose,
                operation: context.operation,
              })),
              ...(input.rejectedCalls === undefined
                ? {}
                : { rejectedCalls: input.rejectedCalls }),
              ...(materialRepairs === undefined ? {} : { materialRepairs }),
            }),
          ),
        ],
      });
  input.signal?.throwIfAborted();
  if (
    !isDeepStrictEqual(snapshot, {
      scenario: input.scenario,
      messages: input.messages,
      calls: input.calls,
      interpretSchemaChoices: input.interpretSchemaChoices,
    })
  )
    throw new Error('Workflow value sources changed while planning');
  if (!isDeepStrictEqual(materialRepairs, captureRepairs()))
    throw new Error('Workflow value repair request changed while planning');
  return compileWorkflowApiValues({
    ...snapshot,
    plan: workflowApiValuePlanSchema.parse({ ...proposal, sourceFingerprint }),
  });
}
