import { createHash } from 'node:crypto';
import type {
  CreateWorkflowDraftCapabilityGapInput,
  WorkflowDraftCapabilityGap,
} from '../../types/workflow-draft-capability-gap.js';
import {
  workflowDraftCapabilityGapSchema,
  workflowDraftCapabilityGapFieldsSchema,
} from '../../schemas/workflow-draft-capability-gap-schema.js';
import { describeWorkflowDraftGapInventory } from './describe-workflow-draft-gap-inventory.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';

/** Code owns identity, inventory receipt and unchanged original evidence. The finding remains a semantic judgment. */
export function createWorkflowDraftCapabilityGap(
  input: CreateWorkflowDraftCapabilityGapInput,
): WorkflowDraftCapabilityGap {
  if (
    !Array.isArray(input.sourceMessageIds) ||
    !input.sourceMessageIds.length ||
    new Set(input.sourceMessageIds).size !== input.sourceMessageIds.length
  )
    throw new Error(
      'Capability gap sourceMessageIds must name distinct original messages',
    );
  const inventory = describeWorkflowDraftGapInventory(input.context);
  const finding = workflowDraftCapabilityGapFieldsSchema.shape.finding.parse(
    input.finding,
  );
  if (
    finding.kind === 'api-contract-gap' &&
    !inventory.operations.some((operation) =>
      apiOperationKeyEquals(operation, finding.operation),
    )
  )
    throw new Error(
      'Capability gap operation must be an actual supplied OAS operation and snapshot',
    );
  const sources = input.sourceMessageIds.map((messageId) => {
    const message = input.context.messages.find(
      (message) => message.id === messageId,
    );
    if (!message)
      throw new Error(
        `Capability gap sourceMessageIds contains unknown message ${messageId}`,
      );
    return { kind: 'message' as const, messageId, quote: message.text };
  });
  const fields = workflowDraftCapabilityGapFieldsSchema.parse({
    id: input.id,
    requestedBehavior: input.requestedBehavior,
    finding: structuredClone(input.finding),
    sources,
    inventory,
  });
  return workflowDraftCapabilityGapSchema.parse({
    ...fields,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(fields))
      .digest('hex'),
  });
}
