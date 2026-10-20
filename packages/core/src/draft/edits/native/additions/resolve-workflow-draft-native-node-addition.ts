import { createHash } from 'node:crypto';
import type { PlannedNativeNode } from '../../../../types/workflow-plan.js';
import type {
  ResolveWorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeNodeAdditionResult,
  WorkflowDraftNativeNodeAdditionChoice,
} from '../../../../types/workflow-draft-native-node-addition.js';
import { createWorkflowDraftNativeNodeAdditionSchema } from '../../../../schemas/workflow-draft-native-node-addition-schema.js';
import { resolveNativeNodeAdditionContext } from './resolve-native-node-addition-context.js';
import { resolveWorkflowDraftSourceEvidence } from '../../references/resolve-workflow-draft-source-evidence.js';
import { validateWorkflowDraftNativeReferences } from '../../references/validate-workflow-draft-native-references.js';
import { collectNativeRuntimeInputSlots } from '../../../../inputs/native/collect-native-runtime-input-slots.js';
import { jsonValuesEqual } from '../../../../utils/json-values-equal.js';
import { validateWorkflowDraftNativeNodeParameterOwnershipContract } from './resolve-workflow-draft-native-node-parameter-ownership.js';
import { validateNativeNodeProducerReferences } from '../../../../workflow/planning/resolve-native-configuration-materials.js';

export function resolveWorkflowDraftNativeNodeAddition(
  input: ResolveWorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeNodeAdditionResult {
  const { description, capability } = resolveNativeNodeAdditionContext(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'Native node addition fingerprint is stale or describes different staged materials',
    );
  const proposal = createWorkflowDraftNativeNodeAdditionSchema(input).parse(
    input.proposal,
  );
  const ownership =
    input.parameterOwnership === undefined
      ? undefined
      : validateWorkflowDraftNativeNodeParameterOwnershipContract(input);
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Native node addition schema must validate without defaults, coercion or transformation',
    );
  const evidence = resolveWorkflowDraftSourceEvidence({
    description,
    decision: proposal.decision,
    capabilities: input.context.capabilities,
  });
  const decision = { ...proposal.decision, ...evidence };
  // Wire evidence IDs remain in the unchanged proposal; resolved decisions carry only canonical evidence.
  const choice: WorkflowDraftNativeNodeAdditionChoice =
    proposal.decision.status === 'provided'
      ? { status: 'provided', parameters: proposal.decision.parameters }
      : proposal.decision.status === 'runtime-parameters'
        ? { status: 'runtime-parameters' }
        : { status: 'needs-clarification', message: proposal.decision.message };
  const fields = {
    fingerprint: description.fingerprint,
    proposal,
    decision: { ...choice, ...evidence },
    ...(ownership === undefined ? {} : { parameterOwnership: ownership }),
  };
  if (decision.status === 'needs-clarification')
    return {
      status: 'needs-clarification',
      ...fields,
      questions: [
        {
          id:
            'native-addition-question:' +
            createHash('sha256')
              .update(JSON.stringify([description.fingerprint, proposal]))
              .digest('hex'),
          nodeId: description.nodeId,
          message: decision.message,
          ...evidence,
        },
      ],
    };
  const node: PlannedNativeNode =
    decision.status === 'provided'
      ? {
          id: description.nodeId,
          capability: capability.name,
          parameters: decision.parameters,
          ...(ownership?.runtimeParameters === undefined
            ? {}
            : { runtimeParameters: ownership.runtimeParameters }),
        }
      : {
          id: description.nodeId,
          capability: capability.name,
          parameters: {},
          runtimeParameters: true,
        };
  if (node.runtimeParameters !== undefined)
    collectNativeRuntimeInputSlots({
      nativeNodes: [node],
      capabilities: [capability],
    });
  validateWorkflowDraftNativeReferences({
    node,
    capability,
    sources: description.sources,
  });
  if (description.sourceDependencies !== undefined)
    validateNativeNodeProducerReferences(
      node,
      capability,
      description.sourceDependencies.sourceNodeIds,
    );
  return {
    status: 'ready',
    ...fields,
    resolution:
      decision.status === 'provided' &&
      ownership?.runtimeParameters !== undefined &&
      ownership.runtimeParameters !== true
        ? {
            stepId: input.stepId,
            kind: 'native-mixed',
            parameters: structuredClone(decision.parameters),
            runtimeParameters: structuredClone(ownership.runtimeParameters),
          }
        : decision.status === 'provided'
          ? {
              stepId: input.stepId,
              kind: 'native-literal',
              parameters: structuredClone(decision.parameters),
            }
          : { stepId: input.stepId, kind: 'native-runtime' },
  };
}
