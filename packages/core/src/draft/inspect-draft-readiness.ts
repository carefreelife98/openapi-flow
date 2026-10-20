import type {
  WorkflowDraftInput,
  WorkflowDraftReadiness,
} from '../types/workflow-draft.js';
import { validateWorkflowDraft } from './validate-workflow-draft.js';
import { resolveWorkflowDraftMaterials } from './resolve-workflow-draft-materials.js';
import {
  workflowDraftDependencies,
  transitiveDraftDependencies,
} from './impact/workflow-draft-dependencies.js';

export function inspectDraftReadiness(
  input: WorkflowDraftInput,
): WorkflowDraftReadiness {
  validateWorkflowDraft(input);
  const { slots: apiSlots, nativeSlots } = resolveWorkflowDraftMaterials(input);
  const slots = [...apiSlots, ...nativeSlots];
  const dependencies = workflowDraftDependencies(input);
  const nodes = [...dependencies.keys()].map((nodeId) => {
    const upstream = transitiveDraftDependencies(nodeId, dependencies);
    const scope = new Set([nodeId, ...upstream]);
    const blockingGapNodeIds = (
      input.draft.gapNodes === undefined ? [] : input.draft.gapNodes
    )
      .filter((gap) => scope.has(gap.id))
      .map((gap) => gap.id);
    const unresolvedRequirementIds = input.draft.requirements
      .filter(
        (requirement) =>
          requirement.state !== 'confirmed' &&
          (requirement.scope.kind === 'workflow' ||
            requirement.scope.nodeIds.some((id) => scope.has(id))),
      )
      .map((requirement) => requirement.id);
    const inputSlotIds = slots
      .filter((slot) =>
        scope.has(
          slot.kind === 'api-request-input' ? slot.callId : slot.nodeId,
        ),
      )
      .map((slot) => slot.id);
    const requestSlots = apiSlots.filter((slot) => scope.has(slot.callId));
    const blocked = unresolvedRequirementIds.length > 0;
    return {
      nodeId,
      planningStatus: blocked
        ? ('blocked-by-decision' as const)
        : blockingGapNodeIds.length
          ? ('blocked-by-capability' as const)
          : ('ready' as const),
      requestInputStatus: blocked
        ? ('blocked-by-decision' as const)
        : blockingGapNodeIds.length
          ? ('blocked-by-capability' as const)
          : requestSlots.length
            ? ('needs-input' as const)
            : ('ready' as const),
      runtimeInputStatus: blocked
        ? ('blocked-by-decision' as const)
        : blockingGapNodeIds.length
          ? ('blocked-by-capability' as const)
          : inputSlotIds.length
            ? ('needs-input' as const)
            : ('ready' as const),
      unresolvedRequirementIds,
      inputSlotIds,
      dependencyNodeIds: upstream,
      ...(blockingGapNodeIds.length ? { blockingGapNodeIds } : {}),
      reviewed: input.draft.approvals.some(
        (approval) =>
          approval.nodeIds.includes(nodeId) &&
          !approval.invalidatedNodeIds.includes(nodeId),
      ),
    };
  });
  return {
    designReady:
      nodes.length > 0 &&
      nodes.every((node) => node.planningStatus === 'ready'),
    requestInputsReady:
      nodes.length > 0 &&
      nodes.every((node) => node.requestInputStatus === 'ready'),
    nativeInputsReady: nodes.length > 0 && nativeSlots.length === 0,
    runtimeInputsReady:
      nodes.length > 0 &&
      nodes.every((node) => node.runtimeInputStatus === 'ready'),
    reviewed: nodes.length > 0 && nodes.every((node) => node.reviewed),
    nodes,
    slots,
  };
}
