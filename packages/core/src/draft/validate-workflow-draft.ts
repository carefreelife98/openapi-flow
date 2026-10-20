import type { WorkflowDraftInput } from '../types/workflow-draft.js';
import { workflowDraftSchema } from '../schemas/workflow-draft-schema.js';
import { resolveWorkflowDraftMaterials } from './resolve-workflow-draft-materials.js';
import { validateWorkflowGraphPlan } from '../workflow/validate-workflow-graph-plan.js';
import { validateWorkflowDraftRequirementHistory } from './requirements/history/validate-workflow-draft-requirement-history.js';
import { workflowPlanningMessageIdsSchema } from '../schemas/workflow-planning-message-ids-schema.js';
import { inspectWorkflowDraftCapabilityGap } from './gaps/inspect-workflow-draft-capability-gap.js';

/** A canonical draft retains valid structure even while values/decisions await input. */
export function validateWorkflowDraft(input: WorkflowDraftInput): void {
  const draft = workflowDraftSchema.parse(input.draft);
  if (
    !input.context ||
    !Array.isArray(input.context.operations) ||
    !Array.isArray(input.context.messages) ||
    !Array.isArray(input.context.capabilities)
  )
    throw new Error(
      'draft context.operations, context.messages and context.capabilities must be arrays',
    );
  const { materials, slots } = resolveWorkflowDraftMaterials({
    ...input,
    draft,
  });
  const capabilityNames = input.context.capabilities.map(
    (capability) => capability.name,
  );
  if (
    new Set(capabilityNames).size !== capabilityNames.length ||
    capabilityNames.some((name) => typeof name !== 'string' || !name.trim())
  )
    throw new Error(
      'draft context.capabilities requires distinct non-empty names',
    );
  const ids = [
    ...draft.apiCalls.map((call) => call.id),
    ...draft.nativeNodes.map((node) => node.id),
    ...(draft.gapNodes === undefined
      ? []
      : draft.gapNodes.map((node) => node.id)),
  ];
  const known = new Set(ids);
  for (const gap of draft.gapNodes === undefined ? [] : draft.gapNodes)
    inspectWorkflowDraftCapabilityGap({ gap, context: input.context });
  if (known.size !== ids.length)
    throw new Error(
      'Draft node IDs must be unique across API and native instances, including unresolved gaps',
    );
  const messageIds = new Set(
    input.context.messages.map((message) => message.id),
  );
  if (
    messageIds.size !== input.context.messages.length ||
    input.context.messages.some(
      (message) => !message.id?.trim() || typeof message.text !== 'string',
    )
  )
    throw new Error(
      'draft context.messages requires distinct non-empty IDs and text',
    );
  if (
    new Set(draft.requirements.map((item) => item.id)).size !==
    draft.requirements.length
  )
    throw new Error('Draft requirements require distinct IDs');
  if (
    input.context.planningMessageIds !== undefined &&
    workflowPlanningMessageIdsSchema
      .parse(input.context.planningMessageIds)
      .some((id) => !messageIds.has(id))
  )
    throw new Error(
      'draft context.planningMessageIds references an unknown message',
    );
  for (const requirement of draft.requirements) {
    if (requirement.sourceMessageIds.some((id) => !messageIds.has(id)))
      throw new Error(
        `Requirement ${requirement.id} references an unknown source message`,
      );
    if (
      requirement.scope.kind === 'nodes' &&
      requirement.scope.nodeIds.some((id) => !known.has(id))
    )
      throw new Error(
        `Requirement ${requirement.id} references an unknown node`,
      );
  }
  validateWorkflowDraftRequirementHistory({ draft, context: input.context });
  if (
    new Set(draft.approvals.map((item) => item.id)).size !==
    draft.approvals.length
  )
    throw new Error('Draft approval IDs must be distinct');
  for (const approval of draft.approvals) {
    if (
      approval.revision > draft.revision ||
      approval.invalidatedNodeIds.some(
        (id) => !approval.nodeIds.includes(id),
      ) ||
      approval.nodeIds.some(
        (id) => !known.has(id) && !approval.invalidatedNodeIds.includes(id),
      )
    )
      throw new Error(
        `Draft approval ${approval.id} has invalid revision or scope`,
      );
  }
  if (!ids.length) {
    if (draft.edges.length)
      throw new Error('An empty draft cannot contain edges');
    return;
  }
  validateWorkflowGraphPlan({
    unresolvedNodes: draft.gapNodes,
    capabilities: input.context.capabilities,
    materials: materials.map((material) => ({
      operation: material.operation,
      arguments: {
        callId: material.callId,
        values: material.values,
        bindings: material.bindings,
        ...(material.requestedInputs === undefined
          ? {}
          : { requestedInputs: material.requestedInputs }),
        unresolvedInputs: slots
          .filter((slot) => slot.callId === material.callId)
          .map((slot) => slot.targetPointer),
        ...(material.requestMediaType !== undefined
          ? { requestMediaType: material.requestMediaType }
          : {}),
      },
    })),
    plan: {
      nativeNodes: draft.nativeNodes,
      edges: draft.edges,
      starts: ids.filter((id) => !draft.edges.some((edge) => edge.to === id)),
      gaps: [],
    },
  });
}
