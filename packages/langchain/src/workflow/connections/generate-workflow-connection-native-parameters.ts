import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionNativeParameters,
  createWorkflowConnectionNativeParametersSchema,
  resolveWorkflowConnectionNativeParameters,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  NativeNodeParameterProposal,
  WorkflowConnectionNativeParameterResult,
} from '@openapi-flow/core';
import type { GenerateWorkflowConnectionNativeParametersInput } from '../../types/workflow-connection-native-repair.js';
import { invokeStructuredModel } from '../../model/invoke-structured-model.js';
import { workflowConnectionNativeRepairPrompt } from '../../prompts/workflow-connection-native-repair-prompt.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { WorkflowConnectionNativeRepairError } from './workflow-connection-native-repair-error.js';

/** One existing instance, checked selected producers, and at most one value decision. */
export async function generateWorkflowConnectionNativeParameters(
  input: GenerateWorkflowConnectionNativeParametersInput,
): Promise<WorkflowConnectionNativeParameterResult> {
  const context = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'generateWorkflowConnectionNativeParameters',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      if (
        input.model !== undefined &&
        (!input.model || typeof input.model.withStructuredOutput !== 'function')
      )
        throw new Error(
          'generateWorkflowConnectionNativeParameters.model must support structured output when supplied',
        );
      return describeWorkflowConnectionNativeParameters(input);
    },
  );
  input.signal?.throwIfAborted();
  if (!context.hasLiteralParameters)
    return resolveWorkflowConnectionNativeParameters({
      ...input,
      fingerprint: context.fingerprint,
      proposal: {
        decision: {
          status: 'provided',
          parameters: {},
          ...(input.includeExplanations === true
            ? {
                reason:
                  'The original ownership contract leaves no literal setting choice.',
              }
            : {}),
        },
      },
    });
  if (!input.model)
    throw new Error(
      'generateWorkflowConnectionNativeParameters.model is required for remaining settings',
    );
  const output = await invokeStructuredModel<NativeNodeParameterProposal>({
    model: input.model,
    schema: createWorkflowConnectionNativeParametersSchema(input),
    operation: 'generateWorkflowConnectionNativeParameters',
    name: 'repair_native_parameters',
    method: 'functionCalling',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(workflowConnectionNativeRepairPrompt),
      new HumanMessage(JSON.stringify(context)),
    ],
  });
  input.signal?.throwIfAborted();
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'generateWorkflowConnectionNativeParameters',
      stage: 'contract-validation',
      code: 'NATIVE_NODE_PLANNING_FAILED',
    },
    () => {
      try {
        if (
          !isDeepStrictEqual(
            context,
            describeWorkflowConnectionNativeParameters(input),
          )
        )
          throw new Error(
            'Native repair source changed during parameter planning',
          );
        return resolveWorkflowConnectionNativeParameters({
          ...input,
          fingerprint: context.fingerprint,
          proposal: output,
        });
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        throw new WorkflowConnectionNativeRepairError(
          {
            operation: 'generateWorkflowConnectionNativeParameters',
            fingerprint: context.fingerprint,
            output,
          },
          cause,
        );
      }
    },
  );
}
