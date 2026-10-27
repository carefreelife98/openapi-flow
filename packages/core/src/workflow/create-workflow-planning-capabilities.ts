import type { WorkflowCapability } from '../types/workflow-plan.js';
import type { WorkflowCapabilityPlanningInput } from '../types/workflow-capability-planning.js';
import { assertApiCallIdentities } from './assert-api-call-identities.js';
import { validateNativeOutputContracts } from '../bindings/validate-native-output-contracts.js';

export function createWorkflowPlanningCapabilities({
  capabilities,
  apiCallIds,
  nativeOutputs,
}: WorkflowCapabilityPlanningInput): WorkflowCapability[] {
  assertApiCallIdentities(apiCallIds);
  if (nativeOutputs !== undefined) {
    validateNativeOutputContracts(nativeOutputs);
    if (nativeOutputs.some((source) => apiCallIds.includes(source.nodeId)))
      throw new Error('planning.nativeOutputs cannot reuse an API callId');
  }
  if (!Array.isArray(capabilities))
    throw new Error('planning.capabilities must be an array');
  if (
    new Set(capabilities.map((item) => item.name)).size !== capabilities.length
  )
    throw new Error('planning.capabilities contains duplicate names');
  return capabilities.map((capability) => {
    if (capability.createPlanningParametersSchema === undefined)
      return capability;
    if (typeof capability.createPlanningParametersSchema !== 'function')
      throw new Error(
        `planning.capabilities[${capability.name}].createPlanningParametersSchema must be a function`,
      );
    const parametersSchema = capability.createPlanningParametersSchema({
      apiCallIds: [...apiCallIds],
      ...(nativeOutputs === undefined
        ? {}
        : { nativeOutputs: structuredClone(nativeOutputs) }),
    });
    if (!parametersSchema || typeof parametersSchema.safeParse !== 'function')
      throw new Error(
        `planning.capabilities[${capability.name}].createPlanningParametersSchema must return a Zod schema`,
      );
    return { ...capability, parametersSchema };
  });
}
