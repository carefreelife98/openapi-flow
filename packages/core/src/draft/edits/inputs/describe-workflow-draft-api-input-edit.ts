import type {
  WorkflowDraftApiInputEditDescription,
  WorkflowDraftApiInputEditInput,
} from '../../../types/workflow-draft-api-input-edit.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { createApiRequestSchema } from '../../../schemas/create-api-request-schema.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';

export function describeWorkflowDraftApiInputEdit(
  input: WorkflowDraftApiInputEditInput,
): WorkflowDraftApiInputEditDescription {
  const stage = stageWorkflowDraftEdit({
    ...input,
    resolutions: input.resolutions === undefined ? [] : input.resolutions,
  });
  const step = input.plan.steps.find((step) => step.id === input.stepId);
  if (!step || step.decision.kind !== 'revise-api-inputs')
    throw new Error(
      'API input edit stepId must identify a revise-api-inputs decision',
    );
  const nodeId = step.decision.nodeId;
  if (!stage.pendingResolutionStepIds.includes(step.id))
    throw new Error(
      'API input edit step already has a supplied result; remove that result explicitly before replanning',
    );
  if (stage.blockedSourceNodeIds.includes(nodeId))
    throw new Error(
      `API input edit target ${nodeId} is blocked by an unresolved contract or requirement`,
    );
  const stagedCall = stage.content.apiCalls.find((call) => call.id === nodeId);
  if (stagedCall === undefined)
    throw new Error(
      `API input edit target ${nodeId} has no staged API instance`,
    );
  const material = resolveWorkflowDraftApiMaterials({
    content: stage.content,
    context: input.context,
  }).find((item) => item.callId === stagedCall.id)!;
  const call = structuredClone({
    ...stagedCall,
    ...(input.requestMediaType === undefined
      ? {}
      : { requestMediaType: input.requestMediaType }),
  });
  return {
    stageFingerprint: stage.fingerprint,
    stepId: step.id,
    instruction: step.decision.instruction,
    call,
    operation: structuredClone(material.operation),
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
