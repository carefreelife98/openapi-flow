import { createHash } from 'node:crypto';
import type {
  WorkflowDraftConnectionEditInput,
  WorkflowDraftConnectionEditDescription,
} from '../../../types/workflow-draft-connection-edit.js';
import { stageWorkflowDraftEdit } from '../stage-workflow-draft-edit.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { collectDeferredApiInputSlots } from '../../../inputs/collect-deferred-api-input-slots.js';
import { createWorkflowNodeContracts } from '../../../workflow/create-workflow-node-contracts.js';
import { draftEdgeKey } from '../../changes/draft-edge-key.js';
import { resolveWorkflowDraftNativeSnapshot } from '../../resolve-workflow-draft-native-snapshot.js';
import { NativeMaterialResolutionError } from '../../../workflow/native-material-resolution-error.js';
import { resolveWorkflowPlanningMessages } from '../../../planning/evidence/resolve-workflow-planning-messages.js';

/** The final connection stage needs actual ports/references, not unfinished old contracts. */
export function describeWorkflowDraftConnectionEdit(
  input: WorkflowDraftConnectionEditInput,
): WorkflowDraftConnectionEditDescription {
  const stage = stageWorkflowDraftEdit(input);
  const steps = structuredClone(
    input.plan.steps.filter((step) => step.stages.includes('connections')),
  );
  const fields = {
    stage,
    steps,
    messages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter((message) =>
        input.requestMessageIds.includes(message.id),
      ),
    ),
    backgroundMessages: structuredClone(
      resolveWorkflowPlanningMessages(input.context).filter(
        (message) => !input.requestMessageIds.includes(message.id),
      ),
    ),
    includeExplanations: input.plan.options.includeExplanations,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(fields))
    .digest('hex');
  if (!steps.length) return { status: 'not-required', fingerprint, ...fields };
  if (
    stage.pendingResolutionStepIds.length ||
    stage.pendingRepairs.length ||
    stage.blockedSourceNodeIds.length ||
    stage.deferredRequirementIds.length ||
    stage.pendingClarificationQuestionIds.length
  )
    return { status: 'waiting-for-materials', fingerprint, ...fields };
  const materials = resolveWorkflowDraftApiMaterials({
    content: stage.content,
    context: input.context,
  });
  const slots = collectDeferredApiInputSlots({ materials });
  const snapshot = resolveWorkflowDraftNativeSnapshot({
    content: stage.content,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  if (snapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(snapshot.pending);
  const contracts = createWorkflowNodeContracts({
    unresolvedNodes: stage.content.gapNodes,
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
        ...(material.requestMediaType === undefined
          ? {}
          : { requestMediaType: material.requestMediaType }),
      },
    })),
    nativeNodes: stage.content.nativeNodes,
    capabilities: snapshot.capabilities,
  });
  const affectedNodeIds = [
    ...new Set(
      steps.flatMap((step) => {
        const decision = step.decision;
        if (decision.kind === 'revise-connections') return decision.nodeIds;
        if (decision.kind === 'remove-node')
          return [
            decision.nodeId,
            ...input.draft.edges.flatMap((edge) =>
              edge.from === decision.nodeId
                ? [edge.to]
                : edge.to === decision.nodeId
                  ? [edge.from]
                  : [],
            ),
          ];
        if ('nodeId' in decision) return [decision.nodeId];
        if (step.newNodeId !== undefined) return [step.newNodeId];
        throw new Error(`Connection step ${step.id} has no actual node scope`);
      }),
    ),
  ];
  const existingEdges = stage.content.edges.map((edge) => ({
    id: 'edge:' + createHash('sha256').update(draftEdgeKey(edge)).digest('hex'),
    edge: structuredClone(edge),
    editable:
      affectedNodeIds.includes(edge.from) || affectedNodeIds.includes(edge.to),
  }));
  const apiInstances = materials.map((material) => ({
    nodeId: material.callId,
    method: material.operation.method,
    path: material.operation.path,
    ...(material.operation.operation.summary === undefined
      ? {}
      : { summary: material.operation.operation.summary }),
    values: structuredClone(material.values),
    bindings: structuredClone(material.bindings),
  }));
  const ready = {
    ...fields,
    contracts,
    apiInstances,
    affectedNodeIds,
    existingEdges,
  };
  if (
    !steps.some((step) => step.decision.kind === 'revise-connections') &&
    contracts.length === 1 &&
    existingEdges.length === 0 &&
    contracts[0].inputs.length === 1 &&
    contracts[0].inputs[0] === 'main' &&
    !contracts[0].waitsForAllInputs &&
    contracts[0].dependencyNodeIds.length === 0 &&
    contracts[0].references.length === 0 &&
    Object.values(contracts[0].inputReferences ?? {}).flat().length === 0
  ) {
    const structuralProof = {
      kind: 'single-node-dag' as const,
      nodeId: contracts[0].id,
    };
    return {
      ...fields,
      status: 'not-required',
      structuralProof,
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ ...ready, structuralProof }))
        .digest('hex'),
    };
  }
  return {
    status: 'ready',
    fingerprint: createHash('sha256')
      .update(JSON.stringify(ready))
      .digest('hex'),
    ...ready,
  };
}
