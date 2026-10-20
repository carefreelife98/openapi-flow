import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  InspectWorkflowDraftCapabilityGapInput,
  WorkflowDraftCapabilityGapInspection,
} from '../../types/workflow-draft-capability-gap.js';
import { workflowDraftCapabilityGapSchema } from '../../schemas/workflow-draft-capability-gap-schema.js';
import { describeWorkflowDraftGapInventory } from './describe-workflow-draft-gap-inventory.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';

/** A retained gap is historical when inventory changes; never silently resolved or re-attributed. */
export function inspectWorkflowDraftCapabilityGap(
  input: InspectWorkflowDraftCapabilityGapInput,
): WorkflowDraftCapabilityGapInspection {
  const currentInventory = describeWorkflowDraftGapInventory(input.context);
  const { fingerprint, ...fields } = workflowDraftCapabilityGapSchema.parse(
    input.gap,
  );
  if (
    !isDeepStrictEqual(input.gap, { ...fields, fingerprint }) ||
    createHash('sha256').update(JSON.stringify(fields)).digest('hex') !==
      fingerprint
  )
    throw new Error(
      `Capability gap ${fields.id} has changed finding, inventory or evidence`,
    );
  for (const source of fields.sources)
    if (
      !input.context.messages.some(
        (message) =>
          message.id === source.messageId && message.text === source.quote,
      )
    )
      throw new Error(
        `Capability gap ${fields.id} source ${source.messageId} is absent or changed`,
      );
  const finding = fields.finding;
  if (
    finding.kind === 'api-contract-gap' &&
    !fields.inventory.operations.some((operation) =>
      apiOperationKeyEquals(operation, finding.operation),
    )
  )
    throw new Error(
      `Capability gap ${fields.id} cites an operation outside its original inventory`,
    );
  return {
    inventoryCurrent: isDeepStrictEqual(fields.inventory, currentInventory),
  };
}
