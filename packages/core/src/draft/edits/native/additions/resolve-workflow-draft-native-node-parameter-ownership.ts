import { createHash } from 'node:crypto';
import type {
  ResolveWorkflowDraftNativeNodeParameterOwnershipInput,
  WorkflowDraftNativeNodeParameterOwnershipResult,
  WorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeNodeParameterOwnershipContract,
  WorkflowDraftNativeNodeParameterOwnershipChoice,
} from '../../../../types/workflow-draft-native-node-addition.js';
import type { NativeRuntimeParameterSelection } from '../../../../types/workflow-plan.js';
import { resolveNativeNodeAdditionContext } from './resolve-native-node-addition-context.js';
import { createWorkflowDraftNativeNodeParameterOwnershipSchema } from '../../../../schemas/workflow-draft-native-node-addition-schema.js';
import { resolveWorkflowDraftSourceEvidence } from '../../references/resolve-workflow-draft-source-evidence.js';
import { createNativeParameterGenerationContract } from '../../../../schemas/create-native-parameter-generation-contract.js';
import { jsonValuesEqual } from '../../../../utils/json-values-equal.js';

/** A validated ownership receipt, not literal values, node readiness or a new schema chosen by a model. */
export function resolveWorkflowDraftNativeNodeParameterOwnership(
  input: ResolveWorkflowDraftNativeNodeParameterOwnershipInput,
): WorkflowDraftNativeNodeParameterOwnershipResult {
  const { description, capability, parametersSchema } =
    resolveNativeNodeAdditionContext(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'Native addition ownership fingerprint is stale or describes different staged materials',
    );
  const proposal = createWorkflowDraftNativeNodeParameterOwnershipSchema(
    input,
  ).parse(input.proposal);
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Native addition ownership must validate without defaults, coercion or transformation',
    );
  const evidence = resolveWorkflowDraftSourceEvidence({
    description,
    decision: proposal.decision,
    capabilities: input.context.capabilities,
  });
  const choice: WorkflowDraftNativeNodeParameterOwnershipChoice =
    proposal.decision.status === 'runtime-fields'
      ? { status: 'runtime-fields', pointers: proposal.decision.pointers }
      : proposal.decision.status === 'needs-clarification'
        ? { status: 'needs-clarification', message: proposal.decision.message }
        : { status: proposal.decision.status };
  const decision = { ...choice, ...evidence };
  if (decision.status === 'needs-clarification')
    return {
      status: 'needs-clarification',
      fingerprint: description.fingerprint,
      proposal,
      questions: [
        {
          id:
            'native-ownership-question:' +
            createHash('sha256')
              .update(JSON.stringify([description.fingerprint, proposal]))
              .digest('hex'),
          nodeId: description.nodeId,
          message: decision.message,
          ...evidence,
        },
      ],
    };
  const runtimeParameters: true | NativeRuntimeParameterSelection | undefined =
    decision.status === 'runtime-parameters'
      ? true
      : decision.status === 'runtime-fields'
        ? { pointers: decision.pointers }
        : undefined;
  const contract = createNativeParameterGenerationContract({
    nodeId: description.nodeId,
    capability,
    planningParametersSchema: parametersSchema,
    runtimeParameters,
  });
  const fields = {
    fingerprint: description.fingerprint,
    stepId: input.stepId,
    nodeId: description.nodeId,
    proposal,
    decision,
    literalParametersSchema: contract.literalParametersSchema,
    hasLiteralParameters: contract.hasLiteralParameters,
    ...(runtimeParameters === undefined ? {} : { runtimeParameters }),
  };
  return {
    status: 'ready',
    contract: {
      id:
        'native-ownership:' +
        createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
      ...fields,
    },
  };
}

/** Recompute from original authority rather than trusting persisted schema/owner metadata. */
export function validateWorkflowDraftNativeNodeParameterOwnershipContract(
  input: WorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeNodeParameterOwnershipContract {
  const contract = input.parameterOwnership;
  if (
    !contract ||
    typeof contract.fingerprint !== 'string' ||
    !contract.proposal
  )
    throw new Error(
      'Native addition parameterOwnership requires fingerprint and original proposal',
    );
  const result = resolveWorkflowDraftNativeNodeParameterOwnership({
    ...input,
    fingerprint: contract.fingerprint,
    proposal: contract.proposal,
  });
  if (result.status !== 'ready' || !jsonValuesEqual(result.contract, contract))
    throw new Error(
      'Native addition parameterOwnership is stale or has modified identities, ownership or schemas',
    );
  return result.contract;
}
