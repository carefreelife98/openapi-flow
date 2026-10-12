import type { WorkflowCapability } from '../types/workflow-plan.js';
import type { WorkflowCapabilityPlanningInput } from '../types/workflow-capability-planning.js';
import { assertApiCallIdentities } from './assert-api-call-identities.js';

export function createWorkflowPlanningCapabilities({
  capabilities,
  apiCallIds,
}: WorkflowCapabilityPlanningInput): WorkflowCapability[] {
  assertApiCallIdentities(apiCallIds);
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
    });
    if (!parametersSchema || typeof parametersSchema.safeParse !== 'function')
      throw new Error(
        `planning.capabilities[${capability.name}].createPlanningParametersSchema must return a Zod schema`,
      );
    return { ...capability, parametersSchema };
  });
}
