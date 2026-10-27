import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowConnectionNativeDependencies,
  createWorkflowConnectionNativeDependenciesSchema,
  resolveWorkflowConnectionNativeDependencies,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  NativeInstanceDependencyProposal,
  WorkflowConnectionNativeDependencies,
} from '@openapi-flow/core';
import type { PlanWorkflowConnectionNativeDependenciesInput } from '../../types/workflow-connection-native-repair.js';
import { invokeStructuredModel } from '../../model/invoke-structured-model.js';
import { workflowConnectionNativeRepairPrompt } from '../../prompts/workflow-connection-native-repair-prompt.js';
import { modelSignalSchema } from '../../schemas/model-signal-schema.js';
import { WorkflowConnectionNativeRepairError } from './workflow-connection-native-repair-error.js';

/** Zero or one scoped decision. No retries or mutation of the original source. */
export async function planWorkflowConnectionNativeDependencies(
  input: PlanWorkflowConnectionNativeDependenciesInput,
): Promise<WorkflowConnectionNativeDependencies> {
  const context = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'planWorkflowConnectionNativeDependencies',
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
          'planWorkflowConnectionNativeDependencies.model must support structured output when supplied',
        );
      return describeWorkflowConnectionNativeDependencies(input);
    },
  );
  input.signal?.throwIfAborted();
  if (context.targets.every((target) => target.sourceNodeIds.length === 0))
    return resolveWorkflowConnectionNativeDependencies({
      ...input,
      proposal: {
        sourcesByNodeId: Object.fromEntries(
          context.targets.map((target) => [
            target.nodeId,
            { sourceNodeIds: [] },
          ]),
        ),
      },
    });
  if (!input.model)
    throw new Error(
      'planWorkflowConnectionNativeDependencies.model is required for producer choices',
    );
  const output = await invokeStructuredModel<NativeInstanceDependencyProposal>({
    model: input.model,
    schema: createWorkflowConnectionNativeDependenciesSchema(input),
    operation: 'planWorkflowConnectionNativeDependencies',
    name: 'repair_native_dependencies',
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
      operation: 'planWorkflowConnectionNativeDependencies',
      stage: 'contract-validation',
      code: 'NATIVE_NODE_PLANNING_FAILED',
    },
    () => {
      try {
        if (
          !isDeepStrictEqual(
            context,
            describeWorkflowConnectionNativeDependencies(input),
          )
        )
          throw new Error(
            'Native repair source changed during dependency planning',
          );
        return resolveWorkflowConnectionNativeDependencies({
          ...input,
          proposal: output,
        });
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        throw new WorkflowConnectionNativeRepairError(
          {
            operation: 'planWorkflowConnectionNativeDependencies',
            fingerprint: context.fingerprint,
            output,
          },
          cause,
        );
      }
    },
  );
}
