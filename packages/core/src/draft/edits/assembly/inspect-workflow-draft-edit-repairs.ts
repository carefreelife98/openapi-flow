import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { WorkflowDraftEditRepairTask } from '../../../types/workflow-draft-edit-assembly.js';
import type { InspectWorkflowDraftEditRepairsInput } from '../../../types/workflow-draft-edit-assembly-internal.js';
import type { WorkflowPlanNodeContract } from '../../../types/workflow-plan.js';
import type { NativeOutputContract } from '../../../types/node-output.js';
import { resolveWorkflowDraftApiMaterials } from '../../resolve-workflow-draft-api-materials.js';
import { resolveWorkflowDraftNativeSnapshot } from '../../resolve-workflow-draft-native-snapshot.js';
import { createWorkflowNodeContracts } from '../../../workflow/create-workflow-node-contracts.js';
import { createNativeStructureContracts } from '../../../workflow/create-native-structure-contracts.js';
import { NativeMaterialResolutionError } from '../../../workflow/native-material-resolution-error.js';
import { apiOperationKeyEquals } from '../../../openapi/catalog/api-operation-key-equals.js';
import { validateApiArguments } from '../../../arguments/validate-api-arguments.js';
import { describeNativeReferenceBindings } from '../../../workflow/describe-native-reference-bindings.js';
import { collectNativeReferenceRepairPointers } from '../native/repairs/collect-native-reference-repair-pointers.js';
import { resolveWorkflowDraftApiResponseSources } from '../references/resolve-workflow-draft-api-response-sources.js';
import { resolveNativeMaterialSnapshot } from '../../../workflow/resolve-native-material-snapshot.js';

/** Discover consumer decisions before binding their output, then cascade only actually resolved new contracts. */
export function inspectWorkflowDraftEditRepairs(
  input: InspectWorkflowDraftEditRepairsInput,
): WorkflowDraftEditRepairTask[] {
  const oldMaterials = resolveWorkflowDraftApiMaterials({
    content: input.before,
    context: input.context,
  });
  const newMaterials = resolveWorkflowDraftApiMaterials({
    content: input.content,
    context: input.context,
  });
  const responseSources = resolveWorkflowDraftApiResponseSources(input);
  const oldSnapshot = resolveWorkflowDraftNativeSnapshot({
    content: input.before,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  if (oldSnapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(oldSnapshot.pending);
  const oldCapabilities = oldSnapshot.capabilities;
  const oldContracts = createWorkflowNodeContracts({
    materials: oldMaterials.map((material) => ({
      operation: material.operation,
      arguments: {
        ...material,
        unresolvedInputs: validateApiArguments(material).missingInputs,
      },
    })),
    nativeNodes: input.before.nativeNodes,
    capabilities: oldCapabilities,
  });
  const newContracts = createNativeStructureContracts({
    materials: newMaterials.map((material) => ({
      operation: material.operation,
      arguments: {
        ...material,
        unresolvedInputs: validateApiArguments(material).missingInputs,
      },
    })),
    nativeNodes: input.content.nativeNodes,
    capabilities: input.context.capabilities,
  });
  const sourceChanges = new Map<string, string>();
  const controlChanges = new Map<string, string>();
  for (const before of oldContracts) {
    const after = newContracts.find((contract) => contract.id === before.id);
    const oldCall = input.before.apiCalls.find((call) => call.id === before.id);
    const selectedSource = responseSources.find(
      (source) => source.nodeId === before.id,
    );
    if (
      !after ||
      before.exclusiveOutputPorts !== after.exclusiveOutputPorts ||
      (before.exclusiveOutputPorts &&
        !isDeepStrictEqual(before.outputs, after.outputs))
    )
      controlChanges.set(
        before.id,
        JSON.stringify([after?.exclusiveOutputPorts, after?.outputs]),
      );
    if (
      !after ||
      (oldCall &&
        (!selectedSource ||
          !apiOperationKeyEquals(
            oldCall.operation,
            selectedSource.operation.key,
          )))
    )
      sourceChanges.set(
        before.id,
        JSON.stringify([
          selectedSource?.operation.key,
          undefined,
          after?.outputs,
        ]),
      );
  }
  const updateNativeChanges = (
    outputs: NativeOutputContract[],
    resolvedNodeIds: string[],
  ): void => {
    for (const nodeId of resolvedNodeIds) {
      const before = oldContracts.find((contract) => contract.id === nodeId);
      if (!before) continue;
      const oldOutput = oldSnapshot.outputs.find(
        (output) => output.nodeId === nodeId,
      );
      const newOutput = outputs.find((output) => output.nodeId === nodeId);
      if (!isDeepStrictEqual(oldOutput, newOutput))
        sourceChanges.set(
          nodeId,
          JSON.stringify([
            undefined,
            newOutput,
            newContracts.find((contract) => contract.id === nodeId)?.outputs,
          ]),
        );
    }
  };
  function taskFor(
    contract: WorkflowPlanNodeContract,
  ): WorkflowDraftEditRepairTask | undefined {
    if (!newContracts.some((node) => node.id === contract.id)) return undefined;
    const ownDecisions = input.plan.steps
      .filter(
        (step) =>
          'nodeId' in step.decision && step.decision.nodeId === contract.id,
      )
      .map((step) => step.decision.kind);
    const api = input.before.apiCalls.find((call) => call.id === contract.id);
    // A primary result for this same contract already supplies its own mapping/settings.
    if (
      api
        ? ownDecisions.some(
            (kind) =>
              kind === 'replace-api-operation' ||
              kind === 'revise-api-bindings',
          )
        : ownDecisions.includes('revise-native-node')
    )
      return undefined;
    const references = [
      ...contract.references,
      ...Object.values(
        contract.inputReferences === undefined ? {} : contract.inputReferences,
      ).flat(),
    ];
    const sourceNodeIds = [
      ...new Set([
        ...references
          .map((reference) => reference.nodeId)
          .filter((id) => sourceChanges.has(id)),
        ...(contract.rejoinsExclusiveOutputs !== undefined &&
        controlChanges.has(contract.rejoinsExclusiveOutputs)
          ? [contract.rejoinsExclusiveOutputs]
          : []),
      ]),
    ].sort();
    if (!sourceNodeIds.length) return undefined;
    const native = input.before.nativeNodes.find(
      (node) => node.id === contract.id,
    );
    const capability =
      native === undefined
        ? undefined
        : oldCapabilities.find(
            (capability) => capability.name === native.capability,
          )!;
    const bindings =
      native && capability?.parameterReferenceBindings
        ? describeNativeReferenceBindings({ node: native, capability })
        : [];
    const targetPointers = api
      ? api.bindings
          .filter((binding) => sourceNodeIds.includes(binding.sourceNodeId))
          .map((binding) => binding.targetPointer)
          .sort()
      : collectNativeReferenceRepairPointers(
          bindings,
          new Set(sourceChanges.keys()),
          new Set(controlChanges.keys()),
        );
    const kind = api
      ? ('api-bindings' as const)
      : ('native-parameters' as const);
    const id =
      'draft-repair:' +
      createHash('sha256')
        .update(
          JSON.stringify([
            input.plan.id,
            contract.id,
            kind,
            sourceNodeIds.map((id) => [
              id,
              sourceChanges.get(id),
              controlChanges.get(id),
            ]),
            targetPointers,
          ]),
        )
        .digest('hex');
    return input.acknowledgedTaskIds.has(id)
      ? undefined
      : { id, nodeId: contract.id, kind, sourceNodeIds, targetPointers };
  }
  const deferredNodeIds = input.plan.steps.flatMap((step) =>
    input.pendingResolutionStepIds.includes(step.id) &&
    step.decision.kind === 'revise-native-node'
      ? [step.decision.nodeId]
      : [],
  );
  const nativeTasks = new Map<string, WorkflowDraftEditRepairTask>();
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: responseSources.map((source) => ({
      callId: source.nodeId,
      operation: source.operation,
    })),
    nativeOutputs: [],
    nativeNodes: input.content.nativeNodes,
    capabilities: input.context.capabilities,
    deferredNodeIds,
    shouldDeferNode: (nodeId, outputs, resolvedNodeIds) => {
      updateNativeChanges(outputs, resolvedNodeIds);
      const original = oldContracts.find((contract) => contract.id === nodeId);
      const task = original === undefined ? undefined : taskFor(original);
      if (!task) return false;
      nativeTasks.set(task.id, task);
      return true;
    },
  });
  updateNativeChanges(
    snapshot.outputs,
    snapshot.bindings.map((binding) => binding.nodeId),
  );
  const tasks = new Map(nativeTasks);
  for (const contract of oldContracts) {
    const task = taskFor(contract);
    if (task) tasks.set(task.id, task);
  }
  return [...tasks.values()];
}
