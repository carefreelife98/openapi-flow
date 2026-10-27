import { z } from 'zod';
import type {
  WorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeNodeAdditionProposal,
  WorkflowDraftNativeNodeParameterOwnershipProposal,
} from '../types/workflow-draft-native-node-addition.js';
import { resolveNativeNodeAdditionContext } from '../draft/edits/native/additions/resolve-native-node-addition-context.js';
import { createWorkflowDraftSourceEvidenceFields } from './create-workflow-draft-source-evidence-fields.js';
import { validateWorkflowDraftNativeNodeParameterOwnershipContract } from '../draft/edits/native/additions/resolve-workflow-draft-native-node-parameter-ownership.js';
import { createNativeParameterGenerationContract } from './create-native-parameter-generation-contract.js';

export function createWorkflowDraftNativeNodeParameterOwnershipSchema(
  input: WorkflowDraftNativeNodeAdditionInput,
): z.ZodType<WorkflowDraftNativeNodeParameterOwnershipProposal> {
  const { description } = resolveNativeNodeAdditionContext(input);
  const fields = createWorkflowDraftSourceEvidenceFields(description);
  const choices: z.ZodType[] = [
    z.strictObject({ status: z.literal('literal'), ...fields }),
    z.strictObject({
      status: z.literal('needs-clarification'),
      message: z.string().min(1),
      ...fields,
    }),
  ];
  if (
    description.allowRuntimeParameters &&
    description.capability.supportsRuntimeParameters &&
    description.parameterMode !== 'fixed-empty'
  )
    choices.push(
      z.strictObject({ status: z.literal('runtime-parameters'), ...fields }),
      z.strictObject({
        status: z.literal('runtime-fields'),
        pointers: z
          .array(
            z
              .string()
              .min(1)
              .describe(
                'An explicitly deferred RFC 6901 native parameter field, never a slot ID or schema.',
              ),
          )
          .min(1),
        ...fields,
      }),
    );
  return z.strictObject({
    decision: z.union(choices),
  }) as z.ZodType<WorkflowDraftNativeNodeParameterOwnershipProposal>;
}

/** The model returns only configuration/ownership or a question, never IDs, capability selection, ports or graph edges. */
export function createWorkflowDraftNativeNodeAdditionSchema(
  input: WorkflowDraftNativeNodeAdditionInput,
): z.ZodType<WorkflowDraftNativeNodeAdditionProposal> {
  const { description, parametersSchema, capability } =
    resolveNativeNodeAdditionContext(input);
  const fields = createWorkflowDraftSourceEvidenceFields(description);
  const ownership =
    input.parameterOwnership === undefined
      ? undefined
      : validateWorkflowDraftNativeNodeParameterOwnershipContract(input);
  const contract = createNativeParameterGenerationContract({
    nodeId: description.nodeId,
    capability,
    planningParametersSchema: parametersSchema,
    runtimeParameters: ownership?.runtimeParameters,
  });
  const values = contract.valuesSchema;
  const choices: z.ZodType[] = [
    z.strictObject({
      status: z.literal('needs-clarification'),
      message: z
        .string()
        .min(1)
        .describe(
          'Ask for missing structural settings or source choices. Do not invent values, producers or code.',
        ),
      ...fields,
    }),
  ];
  if (ownership?.runtimeParameters !== true)
    choices.unshift(
      z.strictObject({
        status: z.literal('provided'),
        parameters: values,
        ...fields,
      }),
    );
  if (
    (ownership === undefined &&
      description.allowRuntimeParameters &&
      description.capability.supportsRuntimeParameters) ||
    ownership?.runtimeParameters === true
  )
    choices.push(
      z.strictObject({ status: z.literal('runtime-parameters'), ...fields }),
    );
  return z
    .strictObject({
      decision: z.union(choices),
    })
    .meta({
      $defs: contract.definitions,
    }) as z.ZodType<WorkflowDraftNativeNodeAdditionProposal>;
}
