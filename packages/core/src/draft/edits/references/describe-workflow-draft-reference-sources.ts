import type {
  DescribeWorkflowDraftReferenceSourcesInput,
  WorkflowDraftReferenceSources,
  WorkflowDraftReferenceSource,
  WorkflowDraftApiReferenceSource,
} from '../../../types/workflow-draft-reference-sources.js';
import { resolveNativeMaterialSnapshot } from '../../../workflow/resolve-native-material-snapshot.js';
import { createWorkflowNodeContracts } from '../../../workflow/create-workflow-node-contracts.js';
import { listApiResponsePointers } from '../../../openapi/response/list-api-response-pointers.js';

/** Actual declarations only. A native awaiting consumer repair has no confirmed new output. */
export function describeWorkflowDraftReferenceSources(
  input: DescribeWorkflowDraftReferenceSourcesInput,
): WorkflowDraftReferenceSources {
  const unavailable = new Set([
    ...input.excludedNodeIds,
    ...input.stage.blockedSourceNodeIds,
    ...input.stage.pendingRepairs
      .filter((task) => task.kind === 'native-parameters')
      .map((task) => task.nodeId),
  ]);
  const apis: WorkflowDraftApiReferenceSource[] = input.stage.apiResponseSources
    .filter(
      (source) =>
        !input.excludedNodeIds.includes(source.nodeId) &&
        !input.stage.content.requirements.some(
          (requirement) =>
            requirement.state !== 'confirmed' &&
            (requirement.scope.kind === 'workflow' ||
              requirement.scope.nodeIds.includes(source.nodeId)),
        ),
    )
    .map((source) => ({
      ...structuredClone(source),
      kind: 'api',
      responsePointerCatalog: listApiResponsePointers(source.operation),
    }));
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: apis.map((source) => ({
      callId: source.nodeId,
      operation: source.operation,
    })),
    nativeOutputs: [],
    nativeNodes: input.stage.content.nativeNodes,
    capabilities: input.context.capabilities,
    deferredNodeIds: input.stage.content.nativeNodes
      .filter((node) => unavailable.has(node.id))
      .map((node) => node.id),
  });
  const natives = input.stage.content.nativeNodes.filter((node) =>
    snapshot.bindings.some((binding) => binding.nodeId === node.id),
  );
  const outputs: WorkflowDraftReferenceSource[] = snapshot.outputs.map(
    (output) => ({
      kind: 'native',
      nodeId: output.nodeId,
      schema: structuredClone(output.schema),
      node: structuredClone(natives.find((node) => node.id === output.nodeId)!),
    }),
  );
  const contracts = snapshot.bindings.flatMap((binding) =>
    createWorkflowNodeContracts({
      materials: [],
      nativeNodes: [natives.find((node) => node.id === binding.nodeId)!],
      capabilities: [binding.capability],
    }),
  );
  return {
    values: [...apis, ...outputs],
    exclusiveOutputs: contracts
      .filter((contract) => contract.exclusiveOutputPorts)
      .map((contract) => ({
        kind: 'exclusive-output',
        nodeId: contract.id,
        node: structuredClone(natives.find((node) => node.id === contract.id)!),
        outputPorts: [...contract.outputs],
      })),
  };
}
