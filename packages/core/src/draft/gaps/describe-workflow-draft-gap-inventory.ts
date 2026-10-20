import { createHash } from 'node:crypto';
import type { WorkflowDraftContext } from '../../types/workflow-draft.js';
import type { WorkflowDraftGapInventory } from '../../types/workflow-draft-capability-gap.js';
import { describeWorkflowPlanningContext } from '../../planning/evidence/describe-workflow-planning-context.js';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';

/** Capture actual supplied contract identities; message order and later replies are not inventory changes. */
export function describeWorkflowDraftGapInventory(
  context: WorkflowDraftContext,
): WorkflowDraftGapInventory {
  if (
    !context ||
    !Array.isArray(context.operations) ||
    !Array.isArray(context.capabilities) ||
    !Array.isArray(context.messages)
  )
    throw new Error(
      'Capability gap context requires explicit operations, capabilities and messages arrays',
    );
  const planning = describeWorkflowPlanningContext(context);
  return {
    operations: planning.operations
      .map((operation) => apiOperationKeySchema.parse(operation.key))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    capabilities: planning.capabilities
      .map((capability) => ({
        name: capability.name,
        fingerprint: createHash('sha256')
          .update(JSON.stringify(capability))
          .digest('hex'),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
