import type {
  WorkflowDraftApiInputEditDescription,
  WorkflowDraftApiInputEditInput,
} from '../../../types/workflow-draft-api-input-edit.js';
import { validateWorkflowDraftEditPlan } from '../validate-workflow-draft-edit-plan.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';

export function describeWorkflowDraftApiInputEdit(
  input: WorkflowDraftApiInputEditInput,
): WorkflowDraftApiInputEditDescription {
  validateWorkflowDraftEditPlan(input);
  const step = input.plan.steps.find((step) => step.id === input.stepId);
  if (!step || step.decision.kind !== 'revise-api-inputs')
    throw new Error(
      'API input edit stepId must identify a revise-api-inputs decision',
    );
  const nodeId = step.decision.nodeId;
  if (
    input.plan.steps.some(
      (other) =>
        other.decision.kind === 'replace-api-operation' &&
        other.decision.nodeId === nodeId,
    )
  )
    throw new Error(
      'API input edit must use a draft after its operation replacement is resolved',
    );
  const original = input.draft.apiCalls.find((call) => call.id === nodeId)!;
  const material = resolveWorkflowDraftApiMaterials({
    content: input.draft,
    context: input.context,
  }).find((item) => item.callId === original.id)!;
  const call = structuredClone({
    ...original,
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
  });
  return {
    stepId: step.id,
    instruction: step.decision.instruction,
    call,
    requestSchema: createApiRequestSchema({
      operation: material.operation,
      requestMediaType: call.requestMediaType,
    }),
    messages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter((message) =>
        input.requestMessageIds.includes(message.id),
      ),
    ),
    includeExplanations: input.plan.options.includeExplanations,
  };
}
