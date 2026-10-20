import type {
  ValidateWorkflowPlanningEvidenceInput,
  WorkflowPlanningContextDescription,
  WorkflowPlanningEvidence,
} from '../../types/planning-evidence.js';
import { workflowPlanningEvidenceSchema } from '../../schemas/planning-evidence-schema.js';
import { describeWorkflowPlanningContext } from './describe-workflow-planning-context.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';
import { pointerValue } from '../../bindings/json-pointer.js';

/** Existence and exact-source checks are not proof of semantic entailment. */
export function validateWorkflowPlanningEvidence(
  input: ValidateWorkflowPlanningEvidenceInput,
): void {
  const context = describeWorkflowPlanningContext(input.context);
  validateDescribedWorkflowPlanningEvidence(context, input.evidence);
}

/** Reuse one validated source description across a whole clarification round. */
export function validateDescribedWorkflowPlanningEvidence(
  context: WorkflowPlanningContextDescription,
  supplied: WorkflowPlanningEvidence[],
): void {
  const evidence = workflowPlanningEvidenceSchema
    .array()
    .min(1)
    .parse(supplied);
  if (
    new Set(evidence.map((item) => JSON.stringify(item))).size !==
    evidence.length
  )
    throw new Error('Planning evidence must not repeat an identical source');
  for (const item of evidence) {
    if (item.kind === 'message') {
      const message = context.messages.find(
        (message) => message.id === item.messageId,
      );
      if (!message || !message.text.includes(item.quote))
        throw new Error(
          `Planning evidence references an unknown message or fabricated quote: ${item.messageId}`,
        );
    } else if (item.kind === 'oas') {
      const operation = context.operations.find((operation) =>
        apiOperationKeyEquals(operation.key, item.operation),
      );
      if (
        !operation ||
        pointerValue(operation.operation, item.pointer) === undefined
      )
        throw new Error(
          `Planning evidence references a stale operation or undeclared OAS pointer: ${item.operation.documentId}${item.pointer}`,
        );
    } else if (item.kind === 'native') {
      if (
        !context.capabilities.some(
          (capability) => capability.name === item.capability,
        )
      )
        throw new Error(
          `Planning evidence references an unavailable native capability: ${item.capability}`,
        );
    } else if (context.entrypoint?.kind !== item.entrypoint)
      throw new Error(
        `Planning evidence references an unavailable entrypoint: ${item.entrypoint}`,
      );
  }
}
