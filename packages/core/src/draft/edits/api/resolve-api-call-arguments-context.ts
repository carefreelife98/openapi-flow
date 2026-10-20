import { createHash } from 'node:crypto';
import type { WorkflowDraftApiCallArgumentsInput } from '../../../types/workflow-draft-api-call-planning.js';
import type { WorkflowDraftApiCallArgumentsContext } from '../../../types/workflow-draft-api-call-planning-internal.js';
import { describeWorkflowDraftApiCallPlanning } from './describe-workflow-draft-api-call-planning.js';
import { resolveWorkflowDraftApiCallBindings } from './resolve-workflow-draft-api-call-bindings.js';
import { createApiArgumentGenerationContract } from '../../../schemas/create-api-argument-generation-contract.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';

export function resolveApiCallArgumentsContext(
  input: WorkflowDraftApiCallArgumentsInput,
): WorkflowDraftApiCallArgumentsContext {
  if (
    input.allowRuntimeInputs !== undefined &&
    typeof input.allowRuntimeInputs !== 'boolean'
  )
    throw new Error('API call arguments allowRuntimeInputs must be a boolean');
  if (
    input.trackRequestedInputs !== undefined &&
    typeof input.trackRequestedInputs !== 'boolean'
  )
    throw new Error(
      'API call arguments trackRequestedInputs must be a boolean',
    );
  if (!input.bindingPlan || input.bindingPlan.status !== 'ready')
    throw new Error('API call arguments require a ready bindingPlan');
  const description = describeWorkflowDraftApiCallPlanning(input);
  const bindingPlan = resolveWorkflowDraftApiCallBindings({
    ...input,
    fingerprint: input.bindingPlan.fingerprint,
    proposal: input.bindingPlan.proposal,
    ...(input.bindingPlan.inputIntent === undefined
      ? {}
      : { inputIntent: input.bindingPlan.inputIntent }),
    ...(input.bindingPlan.answers === undefined
      ? {}
      : { answers: input.bindingPlan.answers }),
  });
  if (!jsonValuesEqual(bindingPlan, input.bindingPlan))
    throw new Error(
      'API call arguments bindingPlan must match its actual validated proposal and current contracts',
    );
  const contract = createApiArgumentGenerationContract({
    callId: description.nodeId,
    operation: description.operation,
    requestMediaType: description.requestMediaType,
    bindings: input.bindingPlan.bindings,
    confirmedInputs: input.confirmedInputs,
  });
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        description,
        bindingPlan,
        confirmedInputs: input.confirmedInputs,
        allowRuntimeInputs: input.allowRuntimeInputs === true,
        trackRequestedInputs: input.trackRequestedInputs === true,
      }),
    )
    .digest('hex');
  return { description, contract, fingerprint };
}
